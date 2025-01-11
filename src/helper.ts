import codebolt from '@codebolt/codeboltjs';

import path from 'path';

// Since the instruction is to import 'os', and we cannot add import statements at this point, 
// we will assume that the necessary functionality from 'os' is already available or not needed here.
import os from 'os';

import { SYSTEM_PROMPT } from './prompt';
/**
 * Sends a message to the user interface.
 * @param {string} message - The message to be sent to the UI.
 */

export const getToolResult = (tool_call_id, content) => {
    let toolResult = {
        role: "tool",
        tool_call_id,
        content,
    }
    return toolResult

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
    //@ts-ignore
    let { success, result } = await codebolt.fs.listFile(cwd, true)
    details += `\n\n# Current Working Directory (${cwd}) Files\n${result}
        ? "\n(Note: Only top-level contents shown for Desktop by default. Use list_files to explore further if necessary.)"
        : ""
        }`
    return `<environment_details>\n${details.trim()}\n</environment_details>`
}





export async function attemptApiRequest(apiConversationHistory, cwd, mentionedMCPs: string[], customInstructions?: string,) {
    try {

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
        let tools = await mentionedMCPs?.length ? codebolt.MCP.getMcpTools(mentionedMCPs) : codebolt.MCP.getMCPTool('codebolt')

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
        await codebolt.chat.askQuestion(error.message ?? JSON.stringify(error, null, 2)
            , ["Retry", "Start New Task"], true);

        await this.say("api_req_retried")
        return this.attemptApiRequest()
    }
}

export async function askUserAfterConsecutiveError() {
    let resp = await codebolt.chat.askQuestion(`This may indicate a failure in his thought process or inability to use a tool properly, which can be mitigated with some user guidance (e.g. "Try breaking down the task into smaller steps").`
        , ["Retry", "Start New Task"], true);

    return resp;
}

export function messageToHistoryIfUserClarifies(text, images) {
    const msg = [
        {
            type: "text",
            text: `You seem to be having trouble proceeding. The user has provided the following feedback to help guide you:\n<feedback>\n${text}\n</feedback>`,
        } as any,
        ...this.formatImagesIntoBlocks(images),
    ]
    return msg;
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



