import { CodeboltDev } from './codebolt';
import codebolt from '@codebolt/codeboltjs';
import { ask_question, attemptApiRequest, executeTool, formatImagesIntoBlocks, getEnvironmentDetails, handleConsecutiveError, send_message_to_ui, findLast, findLastIndex, formatContentBlockToMarkdown } from "./helper"
import { localState } from './localstate';

codebolt.chat.onActionMessage().on("userMessage", async (req, response) => {
	let message = req.message;
	let images = req.images;
	let apiConversationHistory = [];
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
		userContent = await handleConsecutiveError(localState.consecutiveMistakeCount, userContent)
		send_message_to_ui(
			"api_req_started",
			JSON.stringify({
				request:
					userContent
						.map((block) => formatContentBlockToMarkdown(block, apiConversationHistory))
						.join("\n\n") + "\n\n<environment_details>\nLoading...\n</environment_details>",
			})
		)
		includeFileDetails = false // we only need file details the first time
		const environmentDetails = await getEnvironmentDetails(includeFileDetails)
		userContent.push({ type: "text", text: environmentDetails })
		apiConversationHistory.push({ role: "user", content: userContent })
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
					await apiConversationHistory.push(assistantResponse)
				}
			} else {
				await send_message_to_ui(
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
			if (contentBlock.message && contentBlock.message.tool_calls) {
				for (const tool of contentBlock.message.tool_calls) {
					const toolName = tool.function.name
					const toolInput = JSON.parse(tool.function.arguments || "{}");
					const toolUseId = tool.id
					if (userRejectedATool) {
						apiConversationHistory.push({
							role: "tool",
							tool_call_id: toolUseId,
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
					// userMessage = toolResults; //TODO: Fix this
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

	response("ok")
})

