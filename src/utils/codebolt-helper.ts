import codebolt from '@codebolt/codeboltjs';
let projectPath;
import { promises as fs } from 'fs';
import path from 'path';
/**
 * Sends a message to the user interface.
 * @param {string} message - The message to be sent to the UI.
 */
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



