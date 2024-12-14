import codebolt from '@codebolt/codeboltjs';

import { promises as fs } from 'fs';
import path from 'path';
import { localState } from './localstate';
// Since the instruction is to import 'os', and we cannot add import statements at this point, 
// we will assume that the necessary functionality from 'os' is already available or not needed here.
import os from 'os';

import { getTools, SYSTEM_PROMPT } from './prompt';
/**
 * Sends a message to the user interface.
 * @param {string} message - The message to be sent to the UI.
 */
const COMMAND_OUTPUT_STRING = "Output:"
export async function send_message_to_ui(type, message?, images?, isUserMessage = false) {
    if (type == "text" || type == "error" || type == "tool" || type == "command") {
        let paylod: any = {};
        let agentMessage = message
        await codebolt.chat.sendMessage(agentMessage, paylod)
    }
    await localState.localMessageStore.push({ type: "say", say: type, text: message, images })



}

//toolcall
//toll respose



export async function ask_question(question, type) {
    let buttons: any = [{
        text: "Yes",
        value: "yes"
    }, {
        text: "No",
        value: "no"
    }];
    let paylod: any = {
        type: "",
        path: "",
        content: ""
    }
    let agentMessage = ""
    function setPrimaryButtonText(text) {
        if (text === undefined) {
            buttons.splice(0, 1); // Remove the second button from the array
        }
        else {
            buttons[0].text = text
            buttons[0].value = text
        }

    }
    function setSecondaryButtonText(text) {
        if (text === undefined) {
            buttons.splice(1, 1); // Remove the second button from the array
        }
        else {
            buttons[1].value = text
            buttons[1].text = text
        }

    }
    switch (type) {
        case "api_req_failed":
            setPrimaryButtonText("Retry")
            setSecondaryButtonText("Start New Task")
            break
        case "mistake_limit_reached":
            setPrimaryButtonText("Proceed Anyways")
            setSecondaryButtonText("Start New Task")
            break
        case "followup":
            setPrimaryButtonText(undefined)
            setSecondaryButtonText(undefined)
            break
        case "command":
            paylod.type = "command"
            const splitMessage = (text) => {
                const outputIndex = text.indexOf(COMMAND_OUTPUT_STRING)
                if (outputIndex === -1) {
                    return { command: text, output: "" }
                }
                return {
                    command: text.slice(0, outputIndex).trim(),
                    output: text
                        .slice(outputIndex + COMMAND_OUTPUT_STRING.length)
                        .trim()
                        .split("")
                        .map((char) => {
                            switch (char) {
                                case "\t":
                                    return "→   "
                                case "\b":
                                    return "⌫"
                                case "\f":
                                    return "⏏"
                                case "\v":
                                    return "⇳"
                                default:
                                    return char
                            }
                        })
                        .join(""),
                }
            }
            const { command, output } = splitMessage(question || "")
            paylod.command = command;
            agentMessage = "Codebolt wants to execute this command:";
            await codebolt.chat.sendMessage(agentMessage, paylod)
            question = undefined
            setPrimaryButtonText("Run Command")
            setSecondaryButtonText("Reject")
            break
        case "command_output":
            setPrimaryButtonText("Proceed While Running")
            setSecondaryButtonText(undefined)
            break
        case "completion_result":
            setPrimaryButtonText("Start New Task")
            setSecondaryButtonText(undefined)
            break
        case "resume_task":
            setPrimaryButtonText("Resume Task")
            setSecondaryButtonText(undefined)
            break
        case "resume_completed_task":
            setPrimaryButtonText("Start New Task")
            setSecondaryButtonText(undefined)
            break
    }
    // console.log("sending message ", question, buttons)
    const response = await codebolt.chat.sendConfirmationRequest(question, buttons, true);
    // console.log(message.userMessage);
    return response
}


export async function getEditorFileStatus(cwd?) {
    let details = ""
    // It could be useful for claude to know if the user went from one or no file to another between messages, so we always include this context
    details += "\n\n# Codebolt Visible Files"
    const visibleFiles = []//vscode.window.visibleTextEditors
        ?.map((editor) => editor.document?.uri?.fsPath)
        .filter(Boolean)
        .map((absolutePath) => path.relative(cwd, absolutePath))
        .join("\n")
    if (visibleFiles) {
        details += `\n${visibleFiles}`
    } else {
        details += "\n(No visible files)"
    }
    details += "\n\n# Codebolt Open Tabs"
    const openTabs = [] //vscode.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .map((tab) => (tab.input)?.uri?.fsPath)
        .filter(Boolean)
        .map((absolutePath) => path.relative(cwd, absolutePath))
        .join("\n")
    if (openTabs) {
        details += `\n${openTabs}`
    } else {
        details += "\n(No open tabs)"
    }
    return details
}

export function setupInitionMessage(message) {
    return [
        {
            type: "text",
            text: `<task>\n${message.userMessage}\n</task>`,
        },
        ...message.uploadedImages || [],
    ];
}

export const getToolDetail = (tool) => {
    return {
        toolName: tool.function.name,
        toolInput: JSON.parse(tool.function.arguments || "{}"),
        toolUseId: tool.id
    };
}


export async function getIncludedFileDetails(cwd) {
    let details = ""


    // this.didEditFile = false // reset, this lets us know when to wait for saved files to update terminals

    const isDesktop = cwd === path.join(os.homedir(), "Desktop")
    //@ts-ignore
    let { success, result } = await codebolt.fs.listFile(cwd, !isDesktop)
    details += `\n\n# Current Working Directory (${cwd}) Files\n${result}${isDesktop
        ? "\n(Note: Only top-level contents shown for Desktop by default. Use list_files to explore further if necessary.)"
        : ""
        }`


    return `<environment_details>\n${details.trim()}\n</environment_details>`
}

export async function executeTool(toolName, toolInput: any): Promise<[boolean, any]> {
    switch (toolName) {
        case "write_to_file": {
            //@ts-ignore
            let { success, result } = await codebolt.fs.writeToFile(toolInput.path, toolInput.content);
            return [success, result];
        }

        case "read_file": {
            //@ts-ignore
            let { success, result } = await codebolt.fs.readFile(toolInput.path);
            return [success, result]
        }

        case "list_files": {
            //@ts-ignore
            let { success, result } = await codebolt.fs.listFile(toolInput.path, toolInput.recursive);
            return [success, result]
        }
        case "list_code_definition_names": {
            //@ts-ignore
            let { success, result } = await codebolt.fs.listCodeDefinitionNames(toolInput.path);
            return [success, result]
        }

        case "search_files": {
            //@ts-ignore
            let { success, result } = await codebolt.fs.searchFiles(toolInput.path, toolInput.regex, toolInput.filePattern);
            return [success, result]
        }
        case "execute_command": {
            //@ts-ignore
            let { success, result } = await codebolt.terminal.executeCommand(toolInput.command, false);
            return [success, result]
        }

        case "ask_followup_question":
            return askFollowupQuestion(toolInput.question)
        case "attempt_completion":
            //@ts-ignore
            return attemptCompletion(toolInput.result, toolInput.command)
        default:
            return [false, `Unknown tool: ${toolName}`]
    }
}
function handleWebviewAskResponse(askResponse, askResponseText, askResponseImages) {
    const result = { response: askResponse, text: askResponseText, images: askResponseImages }
    return result
}



export const askFollowupQuestion = async (question?: string): Promise<[boolean, any]> => {
    if (question === undefined) {
        localState.consecutiveMistakeCount++;
        return [false, await sayAndCreateMissingParamError("ask_followup_question", "question", "")];
    }
    localState.consecutiveMistakeCount = 0;
    let result;
    let codeboltAskReaponse: any = await ask_question(question, "followup");
    if (codeboltAskReaponse.type === "confirmationResponse") {
        result = handleWebviewAskResponse(codeboltAskReaponse.message.userMessage, undefined, [])
    }
    else {
        codeboltAskReaponse.type === "feedbackResponse"
        result = handleWebviewAskResponse("messageResponse", codeboltAskReaponse.message.userMessage, [])
    }
    return [false, result]
}

export const attemptCompletion = async (result, command) => {
    // result is required, command is optional
    if (result === undefined) {
        localState.consecutiveMistakeCount++
        return [false, await sayAndCreateMissingParamError("attempt_completion", "result", "")]
    }
    localState.consecutiveMistakeCount = 0


    return [false, ""] // signals to recursive loop to stop (for now this never happens since yesButtonTapped will trigger a new task)

  
}
export const formatToolError = (error) => {
    return `The tool execution failed with the following error:\n<error>\n${error}\n</error>`
}
export const sayAndCreateMissingParamError = async (toolName, paramName, relPath) => {
    await send_message_to_ui(
        "error",
        `Claude tried to use ${toolName}${relPath ? ` for '${relPath}'` : ""
        } without value for required parameter '${paramName}'. Retrying...`
    )
    return await formatToolError(
        `Missing value for required parameter '${paramName}'. Please retry with complete response.`
    )
}

export async function attemptApiRequest(apiConversationHistory,cwd, customInstructions?: string) {
    try {
        // let projectPath = await currentProjectPath();
        // console.log(projectPath)
        // cwd=projectPath;
        let systemPrompt = await SYSTEM_PROMPT(cwd)
        if (customInstructions && customInstructions.trim()) {
            // altering the system prompt mid-task will break the prompt cache, but in the grand scheme this will not change often so it's better to not pollute user messages with it the way we have to with <potentially relevant details>
            systemPrompt += `
====

USER'S CUSTOM INSTRUCTIONS

The following additional instructions are provided by the user. They should be followed and given precedence in case of conflicts with previous instructions.

${this.customInstructions.trim()}
`
        }
        let tools = getTools(cwd)

        const aiMessages = [
            { role: "system", content: systemPrompt },
            ...apiConversationHistory,
        ]
        const createParams = {
            full: true,
            messages: aiMessages,
            tools: tools,
            tool_choice: "auto",
        };
        console.log(aiMessages)
        // fs.writeFile("filePath.json", aiMessages, 'utf8')

        //@ts-ignore
        let { completion } = await codebolt.llm.inference(createParams);
        return completion
        // return {message}
    } catch (error) {
        console.log(error)

        const { response } = await this.ask(
            "api_req_failed",
            error.message ?? JSON.stringify(error, null, 2)
        )

        await this.say("api_req_retried")
        return this.attemptApiRequest()
    }
}

export async function handleConsecutiveError(consecutiveMistakeCount = 0, userContent) {
    if (consecutiveMistakeCount >= 3) {
        const { response, text, images } = await this.ask(
            "mistake_limit_reached",
            `This may indicate a failure in his thought process or inability to use a tool properly, which can be mitigated with some user guidance (e.g. "Try breaking down the task into smaller steps").`

        )
        if (response === "messageResponse") {
            userContent.push(
                ...[
                    {
                        type: "text",
                        text: `You seem to be having trouble proceeding. The user has provided the following feedback to help guide you:\n<feedback>\n${text}\n</feedback>`,
                    } as any,
                    ...this.formatImagesIntoBlocks(images),
                ]
            )
        }
        this.consecutiveMistakeCount = 0

    }
    return userContent
}

export function formatImagesIntoBlocks(images?: string[]) {
    return images
        ? images.map((dataUrl) => {
            const [rest, base64] = dataUrl.split(",")
            const mimeType = rest.split(":")[1].split(";")[0]
            return {
                type: "image",
                source: { type: "base64", media_type: mimeType, data: base64 },
            } as any
        })
        : []
}

export function findLastIndex<T>(array: Array<T>, predicate: (value: T, index: number, obj: T[]) => boolean): number {
    let l = array.length
    while (l--) {
        if (predicate(array[l], l, array)) {
            return l
        }
    }
    return -1
}

export function findLast<T>(array: Array<T>, predicate: (value: T, index: number, obj: T[]) => boolean): T | undefined {
    const index = findLastIndex(array, predicate)
    return index === -1 ? undefined : array[index]
}

export function formatContentBlockToMarkdown(
    block,
    messages
): string {
    switch (block.type) {
        case "text":
            return block.text
        case "image":
            return `[Image]`
        case "tool_use":
            let input: string
            if (typeof block.input === "object" && block.input !== null) {
                input = Object.entries(block.input)
                    .map(([key, value]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`)
                    .join("\n")
            } else {
                input = String(block.input)
            }
            return `[Tool Use: ${block.name}]\n${input}`
        case "tool_result":
            const toolName = findToolName(block.tool_use_id, messages)
            if (typeof block.content === "string") {
                return `[${toolName}${block.is_error ? " (Error)" : ""}]\n${block.content}`
            } else if (Array.isArray(block.content)) {
                return `[${toolName}${block.is_error ? " (Error)" : ""}]\n${block.content
                    .map((contentBlock) => formatContentBlockToMarkdown(contentBlock, messages))
                    .join("\n")}`
            } else {
                return `[${toolName}${block.is_error ? " (Error)" : ""}]`
            }
        default:
            return "[Unexpected content type]"
    }
}

function findToolName(toolCallId: string, messages): string {
    for (const message of messages) {
        if (Array.isArray(message.content)) {
            for (const block of message.content) {
                if (block.type === "tool_use" && block.id === toolCallId) {
                    return block.name
                }
            }
        }
    }
    return "Unknown Tool"
}
