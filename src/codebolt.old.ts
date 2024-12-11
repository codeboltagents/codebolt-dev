import os from "os";
import * as path from "path";
import fs from "fs";
import { findLast, findLastIndex, formatContentBlockToMarkdown } from "./utils/array-helpers";
import codebolt from '@codebolt/codeboltjs';
import { getTools, SYSTEM_PROMPT } from "./prompts/prompt";
import { ask_question, send_message_to_ui } from "./utils/codebolt-helper";

let cwd = "";

type ToolResponse = string | Array<any>;
type UserContent = Array<any>;

const CodeboltDev = (() => {
    let taskId: string;
    let customInstructions?: string;
    let apiConversationHistory = [];
    let claudeMessages = [];
    let askResponse;
    let askResponseText?: string;
    let askResponseImages?: string[];
    let lastMessageTs?: number;
    let consecutiveMistakeCount: number = 0;
    let abort: boolean = false;

    function initialize(task?: string, images?: string[], historyItem?) {
        if (historyItem) {
            taskId = historyItem.id;
        } else if (task || images) {
            taskId = Date.now().toString();
        } else {
            throw new Error("Either historyItem or task/images must be provided");
        }
    }

    async function addToApiConversationHistory(message) {
        apiConversationHistory.push(message);
    }

    async function overwriteApiConversationHistory(newHistory) {
        apiConversationHistory = newHistory;
    }

    async function addToClaudeMessages(message) {
        claudeMessages.push(message);
    }

    async function handleWebviewAskResponse(askResponse: any, askResponseText: string, askResponseImages: any, messageId, threadId) {
        const result = { response: askResponse, text: askResponseText, images: askResponseImages, messageId, threadId };
        return result;
    }

    async function ask(type, question?: string): Promise<{ response; text?: string; images?: string[] }> {
        if (abort) {
            throw new Error("CodeboltDev instance aborted");
        }
        askResponse = undefined;
        askResponseText = undefined;
        askResponseImages = undefined;
        const askTs = Date.now();
        lastMessageTs = askTs;
        let codeboltAskResponse = await ask_question(question, type);
        askResponse = codeboltAskResponse.response;

        if (!askResponse) {
            return { response: undefined, text: undefined, images: undefined };
        }

        const result = { response: askResponse, text: askResponseText, images: askResponseImages };
        askResponse = undefined;
        askResponseText = undefined;
        askResponseImages = undefined;
        return result;
    }

    async function say(type, text?, images?, isUserMessage = false) {
        if (abort) {
            throw new Error("ClaudeDev instance aborted");
        }
        const sayTs = Date.now();
        lastMessageTs = sayTs;
        await addToClaudeMessages({ ts: sayTs, type: "say", say: type, text: text, images });
        if (type == "text" || type == "error" || type == "tool" || type == "command")
            if (text != "" && !isUserMessage)
                send_message_to_ui(text, type);
    }

    async function startTask(task, images, response) {
        claudeMessages = [];
        apiConversationHistory = [];

        let { projectPath } = await codebolt.project.getProjectPath();
        cwd = projectPath;
        await say("text", task, images, true);

        let imageBlocks = formatImagesIntoBlocks(images);
        await initiateTaskLoop([
            {
                type: "text",
                text: `<task>\n${task}\n</task>`,
            },
            ...imageBlocks,
        ]);
        response("ok");
    }

    async function initiateTaskLoop(userContent: UserContent): Promise<void> {
        let nextUserContent = userContent;
        let includeFileDetails = true;
        while (!abort) {
            const { didEndLoop } = await recursivelyMakeClaudeRequests(nextUserContent, includeFileDetails);
            includeFileDetails = false;

            if (didEndLoop) {
                break;
            } else {
                nextUserContent = [
                    {
                        type: "text",
                        text: "If you have completed the user's task, use the attempt_completion tool. If you require additional information from the user, use the ask_followup_question tool. Otherwise, if you have not completed the task and do not need additional information, then proceed with the next step of the task. (This is an automated message, so do not respond to it conversationally.)",
                    },
                ];
                consecutiveMistakeCount++;
            }
        }
    }

    function abortTask() {
        abort = true;
    }

    async function executeTool(toolName, toolInput: any): Promise<[boolean, ToolResponse]> {
        switch (toolName) {
            case "write_to_file": {
                let { success, result } = await codebolt.fs.writeToFile(toolInput.path, toolInput.content);
                console.log("write_to_file", success, result);
                return [success, result];
            }
            case "read_file": {
                let { success, result } = await codebolt.fs.readFile(toolInput.path);
                return [success, result];
            }
            case "list_files": {
                let { success, result } = await codebolt.fs.listFile(toolInput.path, toolInput.recursive);
                return [success, result];
            }
            case "list_code_definition_names": {
                let { success, result } = await codebolt.fs.listCodeDefinitionNames(toolInput.path);
                return [success, result];
            }
            case "search_files": {
                let { success, result } = await codebolt.fs.searchFiles(toolInput.path, toolInput.regex, toolInput.filePattern);
                return [success, result];
            }
            case "execute_command": {
                let { success, result } = await codebolt.terminal.executeCommand(toolInput.command, false);
                return [success, result];
            }
            case "ask_followup_question":
                return askFollowupQuestion(toolInput.question);
            case "attempt_completion":
                return attemptCompletion(toolInput.result, toolInput.command);
            default:
                return [false, `Unknown tool: ${toolName}`];
        }
    }

    async function askFollowupQuestion(question?: string): Promise<[boolean, ToolResponse]> {
        if (question === undefined) {
            consecutiveMistakeCount++;
            return [false, await sayAndCreateMissingParamError("ask_followup_question", "question")];
        }
        consecutiveMistakeCount = 0;
        const { text, images } = await ask("followup", question);
        await say("user_feedback", text ?? "", images);
        return [false, formatToolResponseWithImages(`<answer>\n${text}\n</answer>`, images)];
    }

    async function attemptCompletion(result?: string, command?: string): Promise<[boolean, ToolResponse]> {
        if (result === undefined) {
            consecutiveMistakeCount++;
            return [false, await sayAndCreateMissingParamError("attempt_completion", "result")];
        }
        consecutiveMistakeCount = 0;
        let resultToSend = result;
        if (command) {
            await say("completion_result", resultToSend);
            let { success, result } = await codebolt.terminal.executeCommand(command, true);
            return [false, ""];
            resultToSend = "";
        }
        return [false, ""];
    }

    async function attemptApiRequest() {
        try {
            let systemPrompt = await SYSTEM_PROMPT(cwd);
            if (customInstructions && customInstructions.trim()) {
                systemPrompt += `
====

USER'S CUSTOM INSTRUCTIONS

The following additional instructions are provided by the user. They should be followed and given precedence in case of conflicts with previous instructions.

${customInstructions.trim()}
`;
            }
            let tools = getTools();
            let systemMessage = { role: "system", content: systemPrompt };
            let messages = apiConversationHistory;
            messages.unshift(systemMessage);
            const createParams = {
                full: true,
                messages: messages,
                tools: tools,
                tool_choice: "auto",
            };
            let { completion } = await codebolt.llm.inference(createParams);
            return completion;
        } catch (error) {
            console.log(error);

            const { response } = await ask(
                "api_req_failed",
                error.message ?? JSON.stringify(error, null, 2)
            );

            await say("api_req_retried");
            return attemptApiRequest();
        }
    }

    async function recursivelyMakeClaudeRequests(
        userContent: UserContent,
        includeFileDetails: boolean = false
    ) {
        if (abort) {
            throw new Error("ClaudeDev instance aborted");
        }
        if (consecutiveMistakeCount >= 3) {
            const { response, text, images } = await ask(
                "mistake_limit_reached",
                `This may indicate a failure in his thought process or inability to use a tool properly, which can be mitigated with some user guidance (e.g. "Try breaking down the task into smaller steps").`
            );
            if (response === "messageResponse") {
                userContent.push(
                    ...[
                        {
                            type: "text",
                            text: `You seem to be having trouble proceeding. The user has provided the following feedback to help guide you:\n<feedback>\n${text}\n</feedback>`,
                        } as any,
                        ...formatImagesIntoBlocks(images),
                    ]
                );
            }
            consecutiveMistakeCount = 0;
        }
        await say(
            "api_req_started",
            JSON.stringify({
                request:
                    userContent
                        .map((block) => formatContentBlockToMarkdown(block, apiConversationHistory))
                        .join("\n\n") + "\n\n<environment_details>\nLoading...\n</environment_details>",
            })
        );
        const environmentDetails = await getEnvironmentDetails(includeFileDetails);
        userContent.push({ type: "text", text: environmentDetails });
        await addToApiConversationHistory({ role: "user", content: userContent });
        const lastApiReqIndex = findLastIndex(claudeMessages, (m: any) => m.say === "api_req_started");
        claudeMessages[lastApiReqIndex].text = JSON.stringify({
            request: userContent
                .map((block) => formatContentBlockToMarkdown(block, apiConversationHistory))
                .join("\n\n"),
        });
        try {
            const response = await attemptApiRequest();
            if (abort) {
                throw new Error("CodeboltDev instance aborted");
            }
            let assistantResponses = [];
            let inputTokens = response.usage.input_tokens;
            let outputTokens = response.usage.output_tokens;
            let cacheCreationInputTokens =
                response.usage.cache_creation_input_tokens || undefined;
            let cacheReadInputTokens =
                response.usage.cache_read_input_tokens || undefined;
            await say(
                "api_req_finished",
                JSON.stringify({
                    tokensIn: inputTokens,
                    tokensOut: outputTokens,
                    cacheWrites: cacheCreationInputTokens,
                    cacheReads: cacheReadInputTokens,
                })
            );
            for (const contentBlock of response.choices) {
                if (contentBlock.message) {
                    assistantResponses.push(contentBlock.message);
                    if (contentBlock.message)
                        await say("text", contentBlock.message.content);
                }
            }
            if (assistantResponses.length > 0) {
                for (let assistantResponse of assistantResponses) {
                    await addToApiConversationHistory(assistantResponse);
                }
            } else {
                await say(
                    "error",
                    "Unexpected API Response: The language model did not provide any assistant messages. This may indicate an issue with the API or the model's output."
                );
                await addToApiConversationHistory({
                    role: "assistant",
                    content: [{ type: "text", text: "Failure: I did not provide a response." }],
                });
            }

            let toolResults = [];
            let attemptCompletionBlock;
            let userRejectedATool = false;
            const contentBlock = response.choices[0];
            if (contentBlock.message && contentBlock.message.tool_calls) {
                for (const tool of contentBlock.message.tool_calls) {
                    const toolName = tool.function.name;
                    const toolInput = JSON.parse(tool.function.arguments || "{}");
                    const toolUseId = tool.id;
                    if (userRejectedATool) {
                        toolResults.push({
                            type: "tool",
                            tool_use_id: toolUseId,
                            content: "Skipping tool execution due to previous tool user rejection.",
                        });
                        continue;
                    }
                    if (toolName === "attempt_completion") {
                        attemptCompletionBlock = tool;
                    } else {
                        const [didUserReject, result] = await executeTool(toolName, toolInput);
                        addToApiConversationHistory({
                            "role": "tool",
                            "tool_call_id": toolUseId,
                            "content": result
                        });
                        if (didUserReject) {
                            userRejectedATool = true;
                        }
                    }
                }
            }

            let didEndLoop = false;

            if (attemptCompletionBlock) {
                let [_, result] = await executeTool(
                    attemptCompletionBlock.function.name,
                    JSON.parse(attemptCompletionBlock.function.arguments || "{}")
                );

                if (result === "") {
                    didEndLoop = true;
                    result = "The user is satisfied with the result.";
                }
                addToApiConversationHistory({
                    "role": "tool",
                    "tool_call_id": attemptCompletionBlock.id,
                    "content": result
                });
            }
            if (toolResults.length > 0) {
                if (didEndLoop) {
                    for (let result of toolResults) {
                        await addToApiConversationHistory(result);
                    }
                    await addToApiConversationHistory({
                        role: "assistant",
                        content: [
                            {
                                type: "text",
                                text: "I am pleased you are satisfied with the result. Do you have a new task for me?",
                            },
                        ],
                    });
                } else {
                    const {
                        didEndLoop: recDidEndLoop,
                        inputTokens: recInputTokens,
                        outputTokens: recOutputTokens,
                    } = await recursivelyMakeClaudeRequests(toolResults);
                    didEndLoop = recDidEndLoop;
                    inputTokens += recInputTokens;
                    outputTokens += recOutputTokens;
                }
            }

            return { didEndLoop, inputTokens, outputTokens };

        } catch (error) {
            console.log(error);
            return { didEndLoop: true, inputTokens: 0, outputTokens: 0 };
        }
    }

    function formatImagesIntoBlocks(images?: string[]) {
        return images
            ? images.map((dataUrl) => {
                const [rest, base64] = dataUrl.split(",");
                const mimeType = rest.split(":")[1].split(";")[0];
                return {
                    type: "image",
                    source: { type: "base64", media_type: mimeType, data: base64 },
                } as any;
            })
            : [];
    }

    function formatToolResponseWithImages(text: string, images?: string[]): ToolResponse {
        if (images && images.length > 0) {
            const textBlock = { type: "text", text };
            const imageBlocks = formatImagesIntoBlocks(images);
            return [textBlock, ...imageBlocks];
        } else {
            return text;
        }
    }

    async function sayAndCreateMissingParamError(toolName, paramName: string, relPath?: string) {
        await say(
            "error",
            `Claude tried to use ${toolName}${relPath ? ` for '${relPath}'` : ""
            } without value for required parameter '${paramName}'. Retrying...`
        );
        return await formatToolError(
            `Missing value for required parameter '${paramName}'. Please retry with complete response.`
        );
    }

    async function getEnvironmentDetails(includeFileDetails = false) {
        let details = "";
        details += "\n\n# Codebolt Visible Files";
        const visibleFiles = [] // vscode.window.visibleTextEditors
            ?.map((editor) => editor.document?.uri?.fsPath)
            .filter(Boolean)
            .map((absolutePath) => path.relative(cwd, absolutePath))
            .join("\n");
        if (visibleFiles) {
            details += `\n${visibleFiles}`;
        } else {
            details += "\n(No visible files)";
        }
        details += "\n\n# Codebolt Open Tabs";
        const openTabs = [] // vscode.window.tabGroups.all
            .flatMap((group) => group.tabs)
            .map((tab) => (tab.input)?.uri?.fsPath)
            .filter(Boolean)
            .map((absolutePath) => path.relative(cwd, absolutePath))
            .join("\n");
        if (openTabs) {
            details += `\n${openTabs}`;
        } else {
            details += "\n(No open tabs)";
        }

        if (includeFileDetails) {
            const isDesktop = cwd === path.join(os.homedir(), "Desktop");
            let { success, result } = await codebolt.fs.listFile(cwd, !isDesktop);
            details += `\n\n# Current Working Directory (${cwd}) Files\n${result}${isDesktop
                ? "\n(Note: Only top-level contents shown for Desktop by default. Use list_files to explore further if necessary.)"
                : ""
                }`;
        }

        return `<environment_details>\n${details.trim()}\n</environment_details>`;
    }

    return {
        initialize,
        addToApiConversationHistory,
        overwriteApiConversationHistory,
        addToClaudeMessages,
        handleWebviewAskResponse,
        ask,
        say,
        startTask,
        abortTask,
        executeTool,
        askFollowupQuestion,
        attemptCompletion,
        attemptApiRequest,
        recursivelyMakeClaudeRequests,
        formatImagesIntoBlocks,
        formatToolResponseWithImages,
        sayAndCreateMissingParamError,
        getEnvironmentDetails
    };
})();

export default CodeboltDev;