
import codebolt from '@codebolt/codeboltjs';
import {
	attemptApiRequest,
	executeTool,
	handleConsecutiveError,
	send_message_to_ui,
	setupInitionMessage,
	getIncludedFileDetails,
	getToolDetail
} from "./helper";
import { localState } from './localstate';

codebolt.chat.onActionMessage().on("userMessage", async (req, response) => {

	let { projectPath } = await codebolt.project.getProjectPath();
	let userContent = setupInitionMessage(req.message)
	const includedFileDetails = await getIncludedFileDetails(projectPath)
	let firstTimeLoop = true
	let nextUserContent = userContent
	while (true) {
		await handleConsecutiveError(localState.consecutiveMistakeCount, nextUserContent)
		if (firstTimeLoop) {
			nextUserContent.push({ type: "text", text: includedFileDetails })
			await localState.apiConversationHistory.push({ role: "user", content: nextUserContent })
		} else {
			for (let userMessage of nextUserContent) {
				await localState.apiConversationHistory.push(userMessage)
			}
		}
		try {
			const response = await attemptApiRequest(projectPath)
			let assistantResponses = []
			for (const contentBlock of response.choices) {
				if (contentBlock.message) {
					assistantResponses.push(contentBlock.message)
					if (contentBlock.message)
						await send_message_to_ui("text", contentBlock.message.content)
				}
			}
			if (assistantResponses.length > 0) {
				for (let assistantResponse of assistantResponses) {
					await localState.apiConversationHistory.push(assistantResponse)
				}
			} else {
				await localState.apiConversationHistory.push({
					role: "assistant",
					content: [{ type: "text", text: "Failure: I did not provide a response." }],
				})
			}
			localState.toolResults = []
			let attemptCompletionBlock
			let userRejectedATool = false;
			const contentBlock = response.choices[0]
			if (contentBlock.message && contentBlock.message.tool_calls) {
				for (const tool of contentBlock.message.tool_calls) {
					const { toolInput, toolName, toolUseId } = getToolDetail(tool);
					if (userRejectedATool) {
						localState.toolResults.push({
							type: "tool",
							tool_use_id: toolUseId,
							content: "Skipping tool execution due to previous tool user rejection.",
						})
						continue
					}

					if (toolName === "attempt_completion") {
						attemptCompletionBlock = tool
					} else {
						const [didUserReject, result] = await executeTool(toolName, toolInput);
						console.log("result", result)
						localState.toolResults.push({
							role: "tool",
							tool_call_id: toolUseId,
							content: result,
						})
						if (didUserReject) {
							userRejectedATool = true
						}
					}
				}
			}
			let didEndLoop = false
			if (attemptCompletionBlock) {
				let [_, result] = await executeTool(
					attemptCompletionBlock.function.name,
					JSON.parse(attemptCompletionBlock.function.arguments || "{}")
				)
				if (result === "") {
					didEndLoop = true
					result = "The user is satisfied with the result."
				}
				console.log("result", result)
				localState.toolResults.push({
					role: "tool",
					tool_call_id: attemptCompletionBlock.id,
					content: result,
				})
			}
			if (localState.toolResults.length > 0) {
				if (didEndLoop) {
					for (let result of localState.toolResults) {
						await localState.apiConversationHistory.push(result)
					}

					await localState.apiConversationHistory.push({
						role: "assistant",
						content: [
							{
								type: "text",
								text: "I am pleased you are satisfied with the result. Do you have a new task for me?",
							},
						]
					})
				} else {
					nextUserContent = localState.toolResults
					firstTimeLoop = false
					continue
				}
			}
			if (didEndLoop) {
				break
			}
		} catch (error) {
			break
		}
		nextUserContent = [
			{
				type: "text",
				text: "If you have completed the user's task, use the attempt_completion tool. If you require additional information from the user, use the ask_followup_question tool. Otherwise, if you have not completed the task and do not need additional information, then proceed with the next step of the task. (This is an automated message, so do not respond to it conversationally.)",
			},
		]
		localState.consecutiveMistakeCount++
	}
	response("ok")
})



