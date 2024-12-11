import { CodeboltDev } from './codebolt';
import codebolt from '@codebolt/codeboltjs';
import { ask_question, attemptApiRequest, executeTool, formatImagesIntoBlocks, getEnvironmentDetails, handleConsecutiveError, send_message_to_ui, findLast, findLastIndex, formatContentBlockToMarkdown } from "./helper"
import { localState } from './localstate';





// codebolt.chat.onActionMessage().on("userMessage", async (req, response) => {
const test = async (req) => {
	await codebolt.waitForConnection();
	console.log("req", req)
	let message = req.message;
	let images = req.images || [];

	let { projectPath } = await codebolt.project.getProjectPath();
	const responseTs = Date.now()
	localState.localMessageStore.push({ ts: responseTs, type: "say", say: "text", text: message.userMessage, images });
	let imageBlocks = formatImagesIntoBlocks(images)
	let userContent = [
		{
			type: "text",
			text: `<task>\n${message.userMessage}\n</task>`,
		},
		...imageBlocks,
	];

	let includeFileDetails = true
	let didEndLoop = false
	while (true) {
		let nextUserContent = userContent
		nextUserContent = await handleConsecutiveError(localState.consecutiveMistakeCount, nextUserContent)
		send_message_to_ui(
			"api_req_started",
			JSON.stringify({
				request:
					userContent
						.map((block) => formatContentBlockToMarkdown(block, localState.apiConversationHistory))
						.join("\n\n") + "\n\n<environment_details>\nLoading...\n</environment_details>",
			})
		)
		includeFileDetails = false // we only need file details the first time
		const environmentDetails = await getEnvironmentDetails(includeFileDetails)
		userContent.push({ type: "text", text: environmentDetails })
		localState.apiConversationHistory.push({ role: "user", content: userContent })
		//TODO: check if we need to add this
		const lastApiReqIndex = findLastIndex(localState.localMessageStore, (m: any) => m.say === "api_req_started")
		localState.localMessageStore[lastApiReqIndex].text = JSON.stringify({
			request: userContent
				.map((block) => formatContentBlockToMarkdown(block, localState.apiConversationHistory))
				.join("\n\n"),
		})
		try {
			const response = await attemptApiRequest(projectPath)
			let assistantResponses = []
			for (const contentBlock of response.choices) {
				if (contentBlock.message) {
					assistantResponses.push(contentBlock.message)
					await send_message_to_ui("text", contentBlock.message.content)
				}
			}
			if (assistantResponses.length > 0) {
				for (let assistantResponse of assistantResponses) {
					await localState.apiConversationHistory.push(assistantResponse)
				}
			} else {
				await send_message_to_ui(
					"error",
					"Unexpected API Response: The language model did not provide any assistant messages. This may indicate an issue with the API or the model's output."
				)
				await localState.apiConversationHistory.push({
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
						toolResults.push({
							role: "tool",
							tool_call_id: toolUseId,
							content: result,
						})
						// toolResults.push({ type: "tool_result", tool_use_id: toolUseId, content: result })

						if (didUserReject) {
							userRejectedATool = true
						}
					}
				}

			}
			// }

			let didEndLoop = false

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
				toolResults.push({
					role: "tool",
					tool_call_id: attemptCompletionBlock.id,
					content: result,
				})
				// toolResults.push({ type: "tool_result", tool_use_id: attemptCompletionBlock.id, content: result })
			}

			if (toolResults.length > 0) {
				if (didEndLoop) {
					for (let result of toolResults) {
						await localState.apiConversationHistory.push(result)
					}
					await localState.apiConversationHistory.push({
						role: "assistant",
						content: [
							{
								type: "text",
								text: "I am pleased you are satisfied with the result. Do you have a new task for me?",
							},
						],
					})
				} else {
					// const {
					//     didEndLoop: recDidEndLoop,
					//     inputTokens: recInputTokens,
					//     outputTokens: recOutputTokens,
					// } = await this.recursivelyMakeCodebotRequests(toolResults)
					// didEndLoop = recDidEndLoop

				}
			}
			if(!didEndLoop) {
				nextUserContent = [
					{
						type: "text",
						text: "If you have completed the user's task, use the attempt_completion tool. If you require additional information from the user, use the ask_followup_question tool. Otherwise, if you have not completed the task and do not need additional information, then proceed with the next step of the task. (This is an automated message, so do not respond to it conversationally.)",
					},
				]
				localState.consecutiveMistakeCount++
			}
			else {
				console.log("didEndLoop is true");
				localState.consecutiveMistakeCount = 0;
				localState.localCurrentUserContent = [];
			}


		} catch (error) {
			console.log(error)
			didEndLoop = true;
		}

		if (didEndLoop) {
			break
		} else {
			localState.localCurrentUserContent = [
				{
					type: "text",
					text: "If you have completed the user's task, use the attempt_completion tool. If you require additional information from the user, use the ask_followup_question tool. Otherwise, if you have not completed the task and do not need additional information, then proceed with the next step of the task. (This is an automated message, so do not respond to it conversationally.)",
				},
			]
			localState.consecutiveMistakeCount++
		}
		localState.consecutiveMistakeCount = 0;
		localState.localCurrentUserContent = [];
	}

	// response("ok")
	// })
}



test({ message: { userMessage: "hi" } })


