import codebolt from '@codebolt/codeboltjs';
let projectPath;
import { promises as fs } from 'fs';
import path from 'path';
import { cwd } from 'process';
import { getTools } from './prompt';
import { SYSTEM_PROMPT } from './prompt';
const COMMAND_OUTPUT_STRING = "Output:"


export async function send_message_to_ui(message, type) {
    await codebolt.waitForConnection();
    let paylod:any = {};
    let agentMessage;
    switch (type) {
        case "tool":
            const tool = JSON.parse(message || "{}")
            switch (tool.tool) {
                case "readFile":
                    paylod.type = "file"
                    agentMessage = "Codebolt read this file:";
                    paylod.content = tool.content
                    paylod.path = tool.path;
                    break;
                case "listFilesTopLevel":
                    paylod.type = "file"
                    agentMessage = "Codebolt viewed the top level files in this directory:";
                    paylod.content = tool.content
                    paylod.path = tool.path
                    break;
                case "listFilesRecursive":
                    paylod.type = "file"
                    agentMessage = "Codebolt recursively viewed all files in this directory:";
                    paylod.content = tool.content
                    paylod.path = tool.path
                    break;
                case "listCodeDefinitionNames":
                    paylod.type = "file"
                    paylod.content = tool.content
                    paylod.path = tool.path
                    agentMessage = "Codebolt viewed source code definition names used in this directory:";
                    break;
                case "searchFiles":
                    paylod.type = "file"
                    paylod.content = tool.content
                    paylod.path = tool.path + (tool.filePattern ? `/(${tool.filePattern})` : "")
                    agentMessage = `Codebolt searched this directory for <code>{tool.regex}</code>:`;
                    break;
                default:
                    agentMessage = message
                    break;
            }
        default:
            agentMessage = message
            break;
    }

    await codebolt.chat.sendMessage(agentMessage, paylod)
}



export async function ask_question(question, type) {
    let buttons:any = [{
        text: "Yes",
        value: "yes"
    }, {
        text: "No",
        value: "no"
    }];
    let paylod:any = {
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
        case "tool":
            const tool = JSON.parse(question || "{}")
            switch (tool.tool) {

                case "editedExistingFile":
                    agentMessage = "Codebolt wants to edit this file";
                    paylod.content = tool.diff
                    paylod.path = tool.path;
                    paylod.type = "file"
                    setPrimaryButtonText("Save");
                    setSecondaryButtonText("Reject");
                    break;

                case "newFileCreated":
                    agentMessage = "Codebolt wants to create a new file:";
                    setPrimaryButtonText("Save");
                    paylod.content = tool.content
                    paylod.path = tool.path;
                    paylod.type = "file"
                    setSecondaryButtonText("Reject");
                    break;

                case "readFile":
                    agentMessage = "Codebolt wants to read this file:";
                    paylod.content = tool.content
                    paylod.path = tool.path;
                    setPrimaryButtonText("Approve");
                    setSecondaryButtonText("Reject");
                    paylod.type = "file"
                    break;
                case "listFilesTopLevel":
                    agentMessage = "Codebolt wants to view the top level files in this directory:";
                    paylod.content = tool.content
                    paylod.path = tool.path;
                    setPrimaryButtonText("Approve");
                    setSecondaryButtonText("Reject");
                    paylod.type = "file"
                    break;

                case "listFilesRecursive":
                    paylod.content = tool.content
                    paylod.path = tool.path;
                    agentMessage = "Codebolt wants to recursively view all files in this directory:";
                    setPrimaryButtonText("Approve");
                    setSecondaryButtonText("Reject");
                    paylod.type = "file"
                    break;
                case "listCodeDefinitionNames":
                    paylod.content = tool.content
                    paylod.path = tool.path;
                    agentMessage = "Codebolt wants to view source code definition names used in this directory:";
                    setPrimaryButtonText("Approve");
                    setSecondaryButtonText("Reject");
                    paylod.type = "file"
                    break;
                case "searchFiles":
                    paylod.content = tool.content
                    paylod.path = tool.path + (tool.filePattern ? `/(${tool.filePattern})` : "")
                    agentMessage = `Codebolt wants to search this directory for ${tool.regex}:`;
                    setPrimaryButtonText("Approve");
                    setSecondaryButtonText("Reject");
                    paylod.type = "file"
                    break;
                default:
                    return null
                    break;

            }
            question = undefined
            await codebolt.chat.sendMessage(agentMessage, paylod)
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


export function formatAIMessage(completion) {
    const openAiMessage = completion.choices[0].message;
    const anthropicMessage = {
        id: completion.id,
        type: "message",
        role: openAiMessage.role,
        content: [
            {
                type: "text",
                text: openAiMessage.content || "",
            },
        ],
        model: completion.model,
        stop_reason: (() => {
            switch (completion.choices[0].finish_reason) {
                case "stop":
                    return "end_turn";
                case "length":
                    return "max_tokens";
                case "tool_calls":
                    return "tool_use";
                case "content_filter":
                default:
                    return null;
            }
        })(),
        stop_sequence: null,
        usage: {
            input_tokens: completion.usage?.prompt_tokens || 0,
            output_tokens: completion.usage?.completion_tokens || 0,
        },
    };

    if (openAiMessage.tool_calls && openAiMessage.tool_calls.length > 0) {
        anthropicMessage.content.push(
            ...openAiMessage.tool_calls.map((toolCall) => {
                let parsedInput = {};
                try {
                    parsedInput = JSON.parse(toolCall.function.arguments || "{}");
                } catch (error) {
                    console.error("Failed to parse tool arguments:", error);
                }
                return {
                    type: "tool_use",
                    id: toolCall.id,
                    name: toolCall.function.name,
                    input: parsedInput,
                };
            })
        );
    }
    return anthropicMessage;
}
export async function getEnvironmentDetails(includeFileDetails = false) {
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

    // this.didEditFile = false // reset, this lets us know when to wait for saved files to update terminals

    if (includeFileDetails) {
        const isDesktop = cwd === path.join(os.homedir(), "Desktop")
        //@ts-ignore
        let { success, result } = await codebolt.fs.listFile(cwd, !isDesktop)
        details += `\n\n# Current Working Directory (${cwd}) Files\n${result}${isDesktop
            ? "\n(Note: Only top-level contents shown for Desktop by default. Use list_files to explore further if necessary.)"
            : ""
            }`
    }

    return `<environment_details>\n${details.trim()}\n</environment_details>`
}

export async function executeTool(toolName, toolInput: any): Promise<[boolean, ToolResponse]> {
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

        case "list_files":{
                //@ts-ignore
                let { success, result } = await codebolt.fs.listFile(toolInput.path, toolInput.recursive);
                return [success, result]
            }
        case "list_code_definition_names":{
                //@ts-ignore
                let { success, result } = await codebolt.fs.listCodeDefinitionNames(toolInput.path);
                return [success, result]
            }

        case "search_files":{
                //@ts-ignore
                let { success, result } = await codebolt.fs.searchFiles(toolInput.path, toolInput.regex, toolInput.filePattern);
                return [success, result]
            }
        case "execute_command":{
                //@ts-ignore
                let { success, result } = await codebolt.terminal.executeCommand(toolInput.command, false);
                return [success, result]
            }

        case "ask_followup_question":
            return this.askFollowupQuestion(toolInput.question)
        case "attempt_completion":
            return this.attemptCompletion(toolInput.result, toolInput.command)
        default:
            return [false, `Unknown tool: ${toolName}`]
    }
}


export async function attemptApiRequest() {
    try {
        // let projectPath = await currentProjectPath();
        // console.log(projectPath)
        // cwd=projectPath;
        let systemPrompt = await SYSTEM_PROMPT(cwd)
        if (this.customInstructions && this.customInstructions.trim()) {
            // altering the system prompt mid-task will break the prompt cache, but in the grand scheme this will not change often so it's better to not pollute user messages with it the way we have to with <potentially relevant details>
            systemPrompt += `
====

USER'S CUSTOM INSTRUCTIONS

The following additional instructions are provided by the user. They should be followed and given precedence in case of conflicts with previous instructions.

${this.customInstructions.trim()}
`
        }
        let tools = getTools()
        let systemMessage = { role: "system", content: systemPrompt };
        let messages = this.apiConversationHistory// convertToOpenAiMessages()
        messages.unshift(systemMessage);
        const createParams = {
            full: true,
            messages: messages,
            tools: tools,
            tool_choice: "auto",
        };
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

export async function handleConsecutiveError(consecutiveMistakeCount=0) {
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
