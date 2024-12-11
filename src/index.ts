import { CodeboltDev } from './codebolt';
import codebolt from '@codebolt/codeboltjs';
import { ask_question, attemptApiRequest, executeTool, formatImagesIntoBlocks, getEnvironmentDetails, handleConsecutiveError, send_message_to_ui, findLast, findLastIndex, formatContentBlockToMarkdown } from "./helper"
import { localState } from './localstate';

codebolt.chat.onActionMessage().on("userMessage", async (req, response) => {
// const test = async (req) => {
	let { projectPath } = await codebolt.project.getProjectPath();
	const responseTs = Date.now()
	localState.localMessageStore.push({ ts: responseTs, type: "say", say: "text", text: req.message.userMessage, req.images  });
	let imageBlocks = formatImagesIntoBlocks(req.images || [])
	let userContent = [
		{
			type: "text",
			text: `<task>\n${req.message.userMessage}\n</task>`,
		},
		...imageBlocks,
	];

	let includeFileDetails = true
	let nextUserContent = userContent

	while (true) {
		const recursivelyMakeAiRequests = async (userContent, includeFileDetails = true, initialMessage = true) => {
			await handleConsecutiveError(localState.consecutiveMistakeCount, userContent)
			// potentially expensive operation
			const environmentDetails = await getEnvironmentDetails(projectPath,includeFileDetails)
			// add environment details as its own text block, separate from tool results
			if (initialMessage) {
				userContent.push({ type: "text", text: environmentDetails })
				await localState.apiConversationHistory.push({ role: "user", content: userContent })
			}
			else {
				for (let userMessage of userContent) {
					await localState.apiConversationHistory.push(userMessage)
				}
			}
			try {
				const response = await attemptApiRequest(userContent)
				let assistantResponses = []
				for (const contentBlock of response.choices) {
					// type can only be text or tool_use
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
							const [didUserReject, result] = await executeTool(toolName, toolInput);
							toolResults.push({
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
					toolResults.push({
						role: "tool",
						tool_call_id: attemptCompletionBlock.id,
						content: result,
					})
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
						const {
							didEndLoop: recDidEndLoop,
						} = await recursivelyMakeAiRequests(toolResults,false,false)
						didEndLoop = recDidEndLoop
					}
				}
				return { didEndLoop }
			} catch (error) {
				console.log(error)
				// this should never happen since the only thing that can throw an error is the attemptApiRequest, which is wrapped in a try catch that sends an ask where if noButtonTapped, will clear current task and destroy this instance. However to avoid unhandled promise rejection, we will end this loop which will end execution of this instance (see startTask)
				return { didEndLoop: true }
			}
		}
		const { didEndLoop } = await recursivelyMakeAiRequests(nextUserContent, includeFileDetails);
		includeFileDetails = false // we only need file details the first time
		if (didEndLoop) {
			break
		} else {
			nextUserContent = [
				{
					type: "text",
					text: "If you have completed the user's task, use the attempt_completion tool. If you require additional information from the user, use the ask_followup_question tool. Otherwise, if you have not completed the task and do not need additional information, then proceed with the next step of the task. (This is an automated message, so do not respond to it conversationally.)",
				},
			]
			localState.consecutiveMistakeCount++
		}
	}
// }
})

// test({ message: { userMessage: "create a node js app" } })


