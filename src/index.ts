import { CodeboltDev } from './codebolt';
import codebolt from '@codebolt/codeboltjs';
import { ask_question, attemptApiRequest, executeTool, formatImagesIntoBlocks, getEnvironmentDetails, handleConsecutiveError, send_message_to_ui, findLast, findLastIndex, formatContentBlockToMarkdown } from "./helper"

codebolt.chat.onActionMessage().on("userMessage", async (req, response) => {
    let message = req.message;
    let threadId = req.threadId;
    let images = req.images;
    let consecutiveMistakeCount = 0;
    let localCurrentUserContent = Array<any>;
    let localMessageStore = []
    let apiConversationHistory = [];

    let { projectPath } = await codebolt.project.getProjectPath();
    const responseTs = Date.now()

    // await this.say("text", message.userMessage, images, true)
    localMessageStore.push({ ts: responseTs, type: "say", say: "text", text: message.userMessage, images });

    let imageBlocks = formatImagesIntoBlocks(images)
    let nextUserContent = [
        {
            type: "text",
            text: `<task>\n${message.userMessage}\n</task>`,
        },
        ...imageBlocks,
    ];

    let includeFileDetails = true
    let didEndLoop = false

    while (true) {

        handleConsecutiveError(consecutiveMistakeCount)

        await this.say(
			"api_req_started",
			JSON.stringify({
				request:
					userContent
						.map((block) => formatContentBlockToMarkdown(block, this.apiConversationHistory))
						.join("\n\n") + "\n\n<environment_details>\nLoading...\n</environment_details>",
			})
		)
        includeFileDetails = false // we only need file details the first time
        const environmentDetails = await getEnvironmentDetails(includeFileDetails)

        userContent.push({ type: "text", text: environmentDetails })
		await this.addToApiConversationHistory({ role: "user", content: userContent })

        const lastApiReqIndex = findLastIndex(localMessageStore, (m: any) => m.say === "api_req_started")

        this.localMessageStore[lastApiReqIndex].text = JSON.stringify({
			request: userContent
				.map((block) => formatContentBlockToMarkdown(block, this.apiConversationHistory))
				.join("\n\n"),
		})


        try {
			const response = await attemptApiRequest()
			let assistantResponses = []


			// A response always returns text content blocks (it's just that before we were iterating over the completion_attempt response before we could append text response, resulting in bug)
			for (const contentBlock of response.choices) {
				// type can only be text or tool_use
				if (contentBlock.message) {
					assistantResponses.push(contentBlock.message)
					await this.say("text", contentBlock.message.content)
				}
			}
			// need to save assistant responses to file before proceeding to tool use since user can exit at any moment and we wouldn't be able to save the assistant's response
			if (assistantResponses.length > 0) {
				for (let assistantResponse of assistantResponses) {
					await apiConversationHistory.push(assistantResponse)

				}
			} else {
				// this should never happen! it there's no assistant_responses, that means we got no text or tool_use content blocks from API which we should assume is an error
				await this.say(
					"error",
					"Unexpected API Response: The language model did not provide any assistant messages. This may indicate an issue with the API or the model's output."
				)
				await apiConversationHistory.push({
					role: "assistant",
					content: [{ type: "text", text: "Failure: I did not provide a response." }],
				})
			}

			let toolResults = []
			let attemptCompletionBlock
			let userRejectedATool = false;
			const contentBlock = response.choices[0]
			// for (const contentBlock of response.choices response.ch) {
			if (contentBlock.message && contentBlock.message.tool_calls) {
				for (const tool of contentBlock.message.tool_calls) {
					const toolName = tool.function.name
					const toolInput = JSON.parse(tool.function.arguments || "{}");
					const toolUseId = tool.id
					if (userRejectedATool) {
						toolResults.push({
							type: "tool",
							tool_use_id: toolUseId,
							content: "Skipping tool execution due to previous tool user rejection.",
						})
						continue
					}
					if (toolName === "attempt_completion") {
						attemptCompletionBlock = tool
					} else {
						const [didUserReject, result] = await executeTool(toolName, toolInput)
						apiConversationHistory.push({
							"role": "tool",
							"tool_call_id": toolUseId,
							"content": result
						})
						if (didUserReject) {
							userRejectedATool = true
						}
					}
				}

			}
			// }


			// attempt_completion is always done last, since there might have been other tools that needed to be called first before the job is finished
			// it's important to note that claude will order the tools logically in most cases, so we don't have to think about which tools make sense calling before others
			if (attemptCompletionBlock) {
				let [_, result] = await executeTool(
					attemptCompletionBlock.function.name,
					JSON.parse(attemptCompletionBlock.function.arguments || "{}")
				)

				if (result === "") {
					didEndLoop = true
					result = "The user is satisfied with the result."
				}
				apiConversationHistory.push({
					"role": "tool",
					"tool_call_id": attemptCompletionBlock.id,
					"content": result
				})
			}
			if (toolResults.length > 0) {
				if (didEndLoop) {
					for (let result of toolResults) {
						apiConversationHistory.push(result)
					}
					apiConversationHistory.push({
						role: "assistant",
						content: [
							{
								type: "text",
								text: "I am pleased you are satisfied with the result. Do you have a new task for me?",
							},
						],
					})
				} 
                else {
					
                    // Set the user message here
                    userMessage = toolResults; //TODO: Fix this
					didEndLoop = false;
				}
			}


		} catch (error) {
			console.log(error)
            didEndLoop = true;
		}

        if (didEndLoop) {
            break
        } else {
            nextUserContent = [
                {
                    type: "text",
                    text: "If you have completed the user's task, use the attempt_completion tool. If you require additional information from the user, use the ask_followup_question tool. Otherwise, if you have not completed the task and do not need additional information, then proceed with the next step of the task. (This is an automated message, so do not respond to it conversationally.)",
                },
            ]
            consecutiveMistakeCount++
        }
        consecutiveMistakeCount = 0;
        localCurrentUserContent = [];
    }

    response("ok")
})

