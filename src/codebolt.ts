import os from "os"
import * as path from "path"
import fs from "fs"
import { findLast, findLastIndex, formatContentBlockToMarkdown } from "./utils/array-helpers"
import codebolt from '@codebolt/codeboltjs';
import { getTools, SYSTEM_PROMPT } from "./prompts/prompt"
import { ask_question, send_message_to_ui } from "./utils/codebolt-helper"

let cwd = "";

type ToolResponse = string | Array<any>
type UserContent = Array<any>

export class CodeboltDev {
	readonly taskId: string
	private customInstructions?: string
	apiConversationHistory = []
	claudeMessages = []
	private askResponse
	private askResponseText?: string
	private askResponseImages?: string[]
	private lastMessageTs?: number
	private consecutiveMistakeCount: number = 0

	private abort: boolean = false

	constructor(
		task?: string,
		images?: string[],
		historyItem?
	) {

		if (historyItem) {
			this.taskId = historyItem.id
			// this.resumeTaskFromHistory()
		} else if (task || images) {
			this.taskId = Date.now().toString()
			// this.startTask(task, images,function(response){

			// })
		} else {
			throw new Error("Either historyItem or task/images must be provided")
		}
	}

	// storing task to disk for history

	private async addToApiConversationHistory(message) {
		this.apiConversationHistory.push(message)

	}
	private async overwriteApiConversationHistory(newHistory) {
		this.apiConversationHistory = newHistory

	}



	private async addToClaudeMessages(message) {
		this.claudeMessages.push(message)

	}
	async handleWebviewAskResponse(askResponse: any, askResponseText: string, askResponseImages: any, messageId, threadId) {
		const result = { response: askResponse, text: askResponseText, images: askResponseImages, messageId, threadId }
		return result
	}
	async ask(
		type,
		question?: string
	): Promise<{ response; text?: string; images?: string[] }> {
		// console.log(type, question)
		// If this CodeboltDev instance was aborted by the provider, then the only thing keeping us alive is a promise still running in the background, in which case we don't want to send its result to the webview as it is attached to a new instance of CodeboltDev now. So we can safely ignore the result of any active promises, and this class will be deallocated. (Although we set CodeboltDev = undefined in provider, that simply removes the reference to this instance, but the instance is still alive until this promise resolves or rejects.)
		if (this.abort) {
			throw new Error("CodeboltDev instance aborted")
		}
		this.askResponse = undefined
		this.askResponseText = undefined
		this.askResponseImages = undefined
		const askTs = Date.now()
		this.lastMessageTs = askTs
		// await this.addToClaudeMessages({ ts: askTs, type: "ask", ask: type, text: question })
		// await this.providerRef.deref()?.postStateToWebview()
		let codeboltAskReaponse = await ask_question(question, type);

		if (!this.askResponse) {
			// Finish the process or exit the function
			return { response: undefined, text: undefined, images: undefined };
		}

		const result = { response: this.askResponse, text: this.askResponseText, images: this.askResponseImages }
		this.askResponse = undefined
		this.askResponseText = undefined
		this.askResponseImages = undefined
		return result
	}

	async say(type, text?, images?, isUserMessage = false) {
		if (this.abort) {
			throw new Error("ClaudeDev instance aborted")
		}
		const sayTs = Date.now()
		this.lastMessageTs = sayTs
		await this.addToClaudeMessages({ ts: sayTs, type: "say", say: type, text: text, images })
		// await this.providerRef.deref()?.postStateToWebview()
		if (type == "text" || type == "error" || type == "tool" || type == "command")
			if (text != "" && !isUserMessage)
				send_message_to_ui(text, type);
	}

	async startTask(task, images, response) {
		// conversationHistory (for API) and claudeMessages (for webview) need to be in sync
		// if the extension process were killed, then on restart the claudeMessages might not be empty, so we need to set it to [] when we create a new ClaudeDev client (otherwise webview would show stale messages from previous session)
		this.claudeMessages = []
		this.apiConversationHistory = []

		let { projectPath } = await codebolt.project.getProjectPath();
		cwd = projectPath;
		// codebolt_instructions = await getInstructionsForAgent();
		await this.say("text", task, images, true)

		let imageBlocks = this.formatImagesIntoBlocks(images)
		await this.initiateTaskLoop([
			{
				type: "text",
				text: `<task>\n${task}\n</task>`,
			},
			...imageBlocks,
		])
		response("ok")
	}



	private async initiateTaskLoop(userContent: UserContent): Promise<void> {
		let nextUserContent = userContent
		let includeFileDetails = true
		while (!this.abort) {
			const { didEndLoop } = await this.recursivelyMakeClaudeRequests(nextUserContent, includeFileDetails)
			includeFileDetails = false // we only need file details the first time

			//  The way this agentic loop works is that claude will be given a task that he then calls tools to complete. unless there's an attempt_completion call, we keep responding back to him with his tool's responses until he either attempt_completion or does not use anymore tools. If he does not use anymore tools, we ask him to consider if he's completed the task and then call attempt_completion, otherwise proceed with completing the task.
			// There is a MAX_REQUESTS_PER_TASK limit to prevent infinite requests, but Claude is prompted to finish the task as efficiently as he can.

			//const totalCost = this.calculateApiCost(totalInputTokens, totalOutputTokens)
			if (didEndLoop) {
				// For now a task never 'completes'. This will only happen if the user hits max requests and denies resetting the count.
				//this.say("task_completed", `Task completed. Total API usage cost: ${totalCost}`)
				break
			} else {
				// this.say(
				// 	"tool",
				// 	"Claude responded with only text blocks but has not called attempt_completion yet. Forcing him to continue with task..."
				// )
				nextUserContent = [
					{
						type: "text",
						text: "If you have completed the user's task, use the attempt_completion tool. If you require additional information from the user, use the ask_followup_question tool. Otherwise, if you have not completed the task and do not need additional information, then proceed with the next step of the task. (This is an automated message, so do not respond to it conversationally.)",
					},
				]
				this.consecutiveMistakeCount++
			}
		}
	}

	abortTask() {
		this.abort = true // will stop any autonomously running promises

	}

	async executeTool(toolName, toolInput: any): Promise<[boolean, ToolResponse]> {
		switch (toolName) {
			case "write_to_file": {
				//@ts-ignore
				let { success, result } = await codebolt.fs.writeToFile(toolInput.path, toolInput.content);
				console.log("write_to_file", success, result)
				return [success, result];
			}

			case "read_file": {
				//@ts-ignore
				let { success, result } = await codebolt.fs.readFile(toolInput.path);
				return [success, result]
			}

			case "list_files":
				{
					//@ts-ignore
					let { success, result } = await codebolt.fs.listFile(toolInput.path, toolInput.recursive);
					return [success, result]
				}
			case "list_code_definition_names":
				{
					//@ts-ignore
					let { success, result } = await codebolt.fs.listCodeDefinitionNames(toolInput.path);
					return [success, result]
				}

			case "search_files":
				{
					//@ts-ignore
					let { success, result } = await codebolt.fs.searchFiles(toolInput.path, toolInput.regex, toolInput.filePattern);
					return [success, result]
				}

			case "execute_command":
				{
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




	async askFollowupQuestion(question?: string): Promise<[boolean, ToolResponse]> {
		if (question === undefined) {
			this.consecutiveMistakeCount++
			return [false, await this.sayAndCreateMissingParamError("ask_followup_question", "question")]
		}
		this.consecutiveMistakeCount = 0
		const { text, images } = await this.ask("followup", question)
		await this.say("user_feedback", text ?? "", images)
		return [false, this.formatToolResponseWithImages(`<answer>\n${text}\n</answer>`, images)]
	}

	async attemptCompletion(result?: string, command?: string): Promise<[boolean, ToolResponse]> {
		// result is required, command is optional
		if (result === undefined) {
			this.consecutiveMistakeCount++
			return [false, await this.sayAndCreateMissingParamError("attempt_completion", "result")]
		}
		this.consecutiveMistakeCount = 0
		let resultToSend = result
		if (command) {
			await this.say("completion_result", resultToSend)
			// TODO: currently we don't handle if this command fails, it could be useful to let claude know and retry
			//@ts-ignore
			let { success, result }= await codebolt.terminal.executeCommand(command, true);

			return [false, ""]
			// if we received non-empty string, the command was rejected or failed
			
			resultToSend = ""
		}
		return [false, ""]
		
	}

	async attemptApiRequest() {
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
	async recursivelyMakeClaudeRequests(
		userContent: UserContent,
		includeFileDetails: boolean = false
	) {
		if (this.abort) {
			throw new Error("ClaudeDev instance aborted")
		}
		if (this.consecutiveMistakeCount >= 3) {
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
		// getting verbose details is an expensive operation, it uses globby to top-down build file structure of project which for large projects can take a few seconds
		// for the best UX we show a placeholder api_req_started message with a loading spinner as this happens
		await this.say(
			"api_req_started",
			JSON.stringify({
				request:
					userContent
						.map((block) => formatContentBlockToMarkdown(block, this.apiConversationHistory))
						.join("\n\n") + "\n\n<environment_details>\nLoading...\n</environment_details>",
			})
		)
		// potentially expensive operation
		const environmentDetails = await this.getEnvironmentDetails(includeFileDetails)
		// add environment details as its own text block, separate from tool results
		userContent.push({ type: "text", text: environmentDetails })
		await this.addToApiConversationHistory({ role: "user", content: userContent })
		// since we sent off a placeholder api_req_started message to update the webview while waiting to actually start the API request (to load potential details for example), we need to update the text of that message
		const lastApiReqIndex = findLastIndex(this.claudeMessages, (m: any) => m.say === "api_req_started")
		this.claudeMessages[lastApiReqIndex].text = JSON.stringify({
			request: userContent
				.map((block) => formatContentBlockToMarkdown(block, this.apiConversationHistory))
				.join("\n\n"),
		})
		// await this.saveClaudeMessages()
		// await this.providerRef.deref()?.postStateToWebview()
		try {
			const response = await this.attemptApiRequest()
			if (this.abort) {
				throw new Error("CodeboltDev instance aborted")
			}
			let assistantResponses = []
			let inputTokens = response.usage.input_tokens
			let outputTokens = response.usage.output_tokens
			let cacheCreationInputTokens =
				(response).usage
					.cache_creation_input_tokens || undefined
			let cacheReadInputTokens =
				(response).usage
					.cache_read_input_tokens || undefined
			// @ts-ignore-next-line
			let totalCost = response.usage.total_cost
			await this.say(
				"api_req_finished",
				JSON.stringify({
					tokensIn: inputTokens,
					tokensOut: outputTokens,
					cacheWrites: cacheCreationInputTokens,
					cacheReads: cacheReadInputTokens,

				})
			)
			// A response always returns text content blocks (it's just that before we were iterating over the completion_attempt response before we could append text response, resulting in bug)
			for (const contentBlock of response.choices) {
				// type can only be text or tool_use
				if (contentBlock.message) {
					assistantResponses.push(contentBlock.message)
					if (contentBlock.message)
						await this.say("text", contentBlock.message.content)
				}
			}
			// need to save assistant responses to file before proceeding to tool use since user can exit at any moment and we wouldn't be able to save the assistant's response
			if (assistantResponses.length > 0) {
				for (let assistantResponse of assistantResponses) {
					await this.addToApiConversationHistory(assistantResponse)

				}
			} else {
				// this should never happen! it there's no assistant_responses, that means we got no text or tool_use content blocks from API which we should assume is an error
				await this.say(
					"error",
					"Unexpected API Response: The language model did not provide any assistant messages. This may indicate an issue with the API or the model's output."
				)
				await this.addToApiConversationHistory({
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
						const [didUserReject, result] = await this.executeTool(toolName, toolInput)
						this.addToApiConversationHistory({
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

			let didEndLoop = false

			// attempt_completion is always done last, since there might have been other tools that needed to be called first before the job is finished
			// it's important to note that claude will order the tools logically in most cases, so we don't have to think about which tools make sense calling before others
			if (attemptCompletionBlock) {
				let [_, result] = await this.executeTool(
					attemptCompletionBlock.function.name,
					JSON.parse(attemptCompletionBlock.function.arguments || "{}")
				)

				if (result === "") {
					didEndLoop = true
					result = "The user is satisfied with the result."
				}
				this.addToApiConversationHistory({
					"role": "tool",
					"tool_call_id": attemptCompletionBlock.id,
					"content": result
				})
			}
			if (toolResults.length > 0) {
				if (didEndLoop) {
					for (let result of toolResults) {
						await this.addToApiConversationHistory(result)
					}
					await this.addToApiConversationHistory({
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
						inputTokens: recInputTokens,
						outputTokens: recOutputTokens,
					} = await this.recursivelyMakeClaudeRequests(toolResults)
					didEndLoop = recDidEndLoop
					inputTokens += recInputTokens
					outputTokens += recOutputTokens
				}
			}

			return { didEndLoop, inputTokens, outputTokens }

		} catch (error) {
			console.log(error)
			// this should never happen since the only thing that can throw an error is the attemptApiRequest, which is wrapped in a try catch that sends an ask where if noButtonTapped, will clear current task and destroy this instance. However to avoid unhandled promise rejection, we will end this loop which will end execution of this instance (see startTask)
			return { didEndLoop: true, inputTokens: 0, outputTokens: 0 }
		}
	}

	// Formatting responses to Claude

	private formatImagesIntoBlocks(images?: string[]) {
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

	private formatToolResponseWithImages(text: string, images?: string[]): ToolResponse {
		if (images && images.length > 0) {
			const textBlock = { type: "text", text }
			const imageBlocks = this.formatImagesIntoBlocks(images)
			// Placing images after text leads to better results
			return [textBlock, ...imageBlocks]
		} else {
			return text
		}
	}
	async formatToolDeniedFeedback(feedback?: string) {
		return `The user denied this operation and provided the following feedback:\n<feedback>\n${feedback}\n</feedback>`
	}

	async formatToolDenied() {
		return `The user denied this operation.`
	}

	async formatToolResult(result: string) {
		return result // the successful result of the tool should never be manipulated, if we need to add details it should be as a separate user text block
	}

	async formatToolError(error?: string) {
		return `The tool execution failed with the following error:\n<error>\n${error}\n</error>`
	}

	async sayAndCreateMissingParamError(toolName, paramName: string, relPath?: string) {
		await this.say(
			"error",
			`Claude tried to use ${toolName}${relPath ? ` for '${relPath}'` : ""
			} without value for required parameter '${paramName}'. Retrying...`
		)
		return await this.formatToolError(
			`Missing value for required parameter '${paramName}'. Please retry with complete response.`
		)
	}

	async getEnvironmentDetails(includeFileDetails = false) {
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
}
