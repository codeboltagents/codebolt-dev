import { CodeboltDev } from './codebolt';
import codebolt from '@codebolt/codeboltjs';
import { ask_question, attemptApiRequest, executeTool, getEnvironmentDetails, send_message_to_ui } from "./utils/codebolt-helper"
import { findLast, findLastIndex, formatContentBlockToMarkdown } from "./utils/array-helpers"

codebolt.chat.onActionMessage().on("userMessage", async (req, response) => {
    let message = req.message;
    let threadId = req.threadId;
    let images = req.images;
    let consecutiveMistakeCount = 0;
    let localCurrentUserContent = Array<any>;
    


    // let codebotDev = new CodeboltDev(message.userMessage, [], []);
    // await codebotDev.startTask(message.userMessage,[],response);
    // if (historyItem) {
        // this.taskId = historyItem.id
        // this.resumeTaskFromHistory()
    // } else if (task || images) {
        // this.taskId = Date.now().toString()  //Check why it is defining threadId
        // this.startTask(task, images,function(response){

        // })
    // } 
    // (task, images, response) {
    // conversationHistory (for API) and claudeMessages (for webview) need to be in sync
    // if the extension process were killed, then on restart the claudeMessages might not be empty, so we need to set it to [] when we create a new ClaudeDev client (otherwise webview would show stale messages from previous session)
    let localMessageStore = []
    let apiConversationHistory = []



    let { projectPath } = await codebolt.project.getProjectPath();
    const responseTs = Date.now()

    // await this.say("text", message.userMessage, images, true)
    localMessageStore.push({ ts: responseTs, type: "say", say: "text", text: message.userMessage, images });

    let imageBlocks = this.formatImagesIntoBlocks(images)
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
        // const { didEndLoop } = await this.recursivelyMakeClaudeRequests(nextUserContent, includeFileDetails)
        // Handle the consequtive Mistake Count
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
					// const {
					// 	didEndLoop: recDidEndLoop,
					// 	inputTokens: recInputTokens,
					// 	outputTokens: recOutputTokens,
					// } = await this.recursivelyMakeClaudeRequests(toolResults)

                    // Set the user message here
                    userMessage = toolResults; //TODO: Fix this
					didEndLoop = false;
				}
			}


		} catch (error) {
			console.log(error)
			// this should never happen since the only thing that can throw an error is the attemptApiRequest, which is wrapped in a try catch that sends an ask where if noButtonTapped, will clear current task and destroy this instance. However to avoid unhandled promise rejection, we will end this loop which will end execution of this instance (see startTask)
			return { didEndLoop: true, inputTokens: 0, outputTokens: 0 }
		}

        //  The way this agentic loop works is that claude will be given a task that he then calls tools to complete. unless there's an attempt_completion call, we keep responding back to him with his tool's responses until he either attempt_completion or does not use anymore tools. If he does not use anymore tools, we ask him to consider if he's completed the task and then call attempt_completion, otherwise proceed with completing the task.
        // There is a MAX_REQUESTS_PER_TASK limit to prevent infinite requests, but Claude is prompted to finish the task as efficiently as he can.

        //const totalCost = this.calculateApiCost(totalInputTokens, totalOutputTokens)
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
    // }
    // await this.initiateTaskLoop([
    // 	{
    // 		type: "text",
    // 		text: `<task>\n${message.userMessage}\n</task>`,
    // 	},
    // 	...imageBlocks,
    // ])
    response("ok")
	// }


	// async say(type, text?, images?, isUserMessage = false) {
	// 	if (this.abort) {
	// 		throw new Error("ClaudeDev instance aborted")
	// 	}
	// 	// this.lastMessageTs = sayTs
	// 	// await this.providerRef.deref()?.postStateToWebview()
	// 	if (type == "text" || type == "error" || type == "tool" || type == "command")
	// 		if (text != "" && !isUserMessage)
	// 			send_message_to_ui(text, type);
	// }




    // async recursivelyMakeClaudeRequests(
	// 	userContent: UserContent,
	// 	includeFileDetails: boolean = false
	// ) {
		// if (this.abort) {
		// 	throw new Error("ClaudeDev instance aborted")
		// }
		// if (this.consecutiveMistakeCount >= 3) {
		// 	const { response, text, images } = await this.ask(
		// 		"mistake_limit_reached",
		// 		`This may indicate a failure in his thought process or inability to use a tool properly, which can be mitigated with some user guidance (e.g. "Try breaking down the task into smaller steps").`

		// 	)
		// 	if (response === "messageResponse") {
		// 		userContent.push(
		// 			...[
		// 				{
		// 					type: "text",
		// 					text: `You seem to be having trouble proceeding. The user has provided the following feedback to help guide you:\n<feedback>\n${text}\n</feedback>`,
		// 				} as any,
		// 				...this.formatImagesIntoBlocks(images),
		// 			]
		// 		)
		// 	}
		// 	this.consecutiveMistakeCount = 0
		// }
		// getting verbose details is an expensive operation, it uses globby to top-down build file structure of project which for large projects can take a few seconds
		// for the best UX we show a placeholder api_req_started message with a loading spinner as this happens
		// await this.say(
		// 	"api_req_started",
		// 	JSON.stringify({
		// 		request:
		// 			userContent
		// 				.map((block) => formatContentBlockToMarkdown(block, this.apiConversationHistory))
		// 				.join("\n\n") + "\n\n<environment_details>\nLoading...\n</environment_details>",
		// 	})
		// )
		// potentially expensive operation
		
		// add environment details as its own text block, separate from tool results
		// userContent.push({ type: "text", text: environmentDetails })
		// await this.addToApiConversationHistory({ role: "user", content: userContent })
		// since we sent off a placeholder api_req_started message to update the webview while waiting to actually start the API request (to load potential details for example), we need to update the text of that message
		// this.localMessageStore[lastApiReqIndex].text = JSON.stringify({
		// 	request: userContent
		// 		.map((block) => formatContentBlockToMarkdown(block, this.apiConversationHistory))
		// 		.join("\n\n"),
		// })
		// await this.saveClaudeMessages()
		// await this.providerRef.deref()?.postStateToWebview()
		
	// }
})

