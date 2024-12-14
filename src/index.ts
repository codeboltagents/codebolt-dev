
import codebolt from '@codebolt/codeboltjs';
import {
	attemptApiRequest,
	executeTool,
	handleConsecutiveError,
	send_message_to_ui,
	setupInitionMessage,
	getIncludedFileDetails,
	getToolDetail,
	getToolResult
} from "./helper";
import { localState } from './localstate';

codebolt.chat.onActionMessage().on("userMessage", async (req, response) => {

	await codebolt.waitForConnection();
	let { projectPath } = await codebolt.project.getProjectPath();
	let userMessage = setupInitionMessage(req.message)
	const includedFileDetails = await getIncludedFileDetails(projectPath)
	let firstTimeLoop = true
	let nextUserMessage = userMessage
	let didEndLoop = false
	while (!didEndLoop) {
		await handleConsecutiveError(localState.consecutiveMistakeCount, nextUserMessage)
		if (firstTimeLoop) {
			nextUserMessage.push({ type: "text", text: includedFileDetails })
			localState.apiConversationHistory.push({ role: "user", content: nextUserMessage })
		} else {
			for (let userMessage of nextUserMessage) {
				localState.apiConversationHistory.push(userMessage)
			}
		}
		try {
			const response = await attemptApiRequest(localState.apiConversationHistory, projectPath)

			/**
			 * If there is text message to be sent to user present in the AI Reply, send it to user.
			 */
			let isMessagePresentinReply = false;
			for (const contentBlock of response.choices) {
				if (contentBlock.message) {
					isMessagePresentinReply = true;
					localState.apiConversationHistory.push(contentBlock.message)
					if (contentBlock.message.content != null)
						await send_message_to_ui("text", contentBlock.message.content)
				}
			}
			if (!isMessagePresentinReply) {
				localState.apiConversationHistory.push({
					role: "assistant",
					content: [{ type: "text", text: "Failure: I did not provide a response." }],
				})
			}

			/**
			 *  --------Handle the Tool Calling-------
			 *  Here we are checking if the ToolDetails are available and if so, then execute the tools.
			 * If the user rejects tool calling, then it will reject all the tools execution.
			 */
			localState.toolResults = []
			let taskCompletedBlock;
			let userRejectedToolUse = false;
			const contentBlock = response.choices[0]
			if (contentBlock.message && contentBlock.message.tool_calls) {
				for (const tool of contentBlock.message.tool_calls) {
					const { toolInput, toolName, toolUseId } = getToolDetail(tool);
					if (!userRejectedToolUse) {
						if (toolName === "attempt_completion") {
							taskCompletedBlock = tool
						} else {
							const [didUserReject, result] = await executeTool(toolName, toolInput);

							localState.toolResults.push(getToolResult(toolUseId, result))
							if (didUserReject) {
								userRejectedToolUse = true
							}
						}
					}
					else {
						localState.toolResults.push(getToolResult(toolUseId, "Skipping tool execution due to previous tool user rejection."))
					}
				}
			}

			/**
			 * Handle if Task Completion is given by AI. This is put separately so that it is called at last.
			 */
			if (taskCompletedBlock) {
				let [_, result] = await executeTool(
					taskCompletedBlock.function.name,
					JSON.parse(taskCompletedBlock.function.arguments || "{}")
				)
				if (result === "") {
					didEndLoop = true
					result = "The user is satisfied with the result."
				}
				localState.toolResults.push(getToolResult(taskCompletedBlock.id, result))

			}


			/**
			 * Setting the Response of Tool Results as Usermessage for next time. 
			 * Also pushing all the tool result in api conversation history.
			 */
			for (let result of localState.toolResults) {
				localState.apiConversationHistory.push(result)
			}
			nextUserMessage = localState.toolResults

			/**
			 * Handle if Tool does not have a result, we assume the ai has nothing more to do, then you need to ask the AI to explicitly send Completion task. 
			 */
			if (localState.toolResults.length == 0) {
				nextUserMessage = [
					{
						"role": "user",
						"content": [
							{
								"type": "text",
								"text": "If you have completed the user's task, use the attempt_completion tool. If you require additional information from the user, use the ask_followup_question tool. Otherwise, if you have not completed the task and do not need additional information, then proceed with the next step of the task. (This is an automated message, so do not respond to it conversationally.)"
							}
						]
					}
				]
				localState.consecutiveMistakeCount++
			}

			else {
				if (didEndLoop) {
					for (let result of localState.toolResults) {
						localState.apiConversationHistory.push(result)
					}
				}
				else {
					nextUserMessage = localState.toolResults
					firstTimeLoop = false
				}

			}

		} catch (error) {
			break
		}
	}

	// convert to send_message_to_ui

	send_message_to_ui("text", "I am pleased you are satisfied with the result.")

	response("ok")

})





