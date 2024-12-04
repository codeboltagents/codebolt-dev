/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 5462:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const path = __webpack_require__(6928);
const fs = __webpack_require__(1943);
const os = __webpack_require__(857);
const {
  formatContentBlockToMarkdown,
  convertToOpenAiMessages
} = __webpack_require__(2849);
const {
  currentProjectPath,
  send_message_to_llm,
  send_message_to_ui,
  formatAIMessage,
  writeToFile,
  readFile,
  executeCommand
} = __webpack_require__(4420);
const {
  getSystemPrompt,
  getTools
} = __webpack_require__(7097);
let cwd;
class CodeboltDev {
  constructor(task, images, historyItem, response) {
    this.taskId = '';
    this.didEditFile = false;
    this.apiConversationHistory = [];
    this.claudeMessages = [];
    this.consecutiveMistakeCount = 0;
    this.abort = false;
    if (historyItem) {
      this.taskId = historyItem.id;
      // this.resumeTaskFromHistory();
    } else if (task || images) {
      this.taskId = Date.now().toString();
      // console.log(task)
      this.startTask(task, images, response);
    } else {
      console.log("Either historyItem or task/images must be provided");
      throw new Error("Either historyItem or task/images must be provided");
    }
  }
  async ask(type, question) {
    // console.log(type, question)
    // If this CodeboltDev instance was aborted by the provider, then the only thing keeping us alive is a promise still running in the background, in which case we don't want to send its result to the webview as it is attached to a new instance of CodeboltDev now. So we can safely ignore the result of any active promises, and this class will be deallocated. (Although we set CodeboltDev = undefined in provider, that simply removes the reference to this instance, but the instance is still alive until this promise resolves or rejects.)
    if (this.abort) {
      throw new Error("CodeboltDev instance aborted");
    }
    this.askResponse = undefined;
    this.askResponseText = undefined;
    this.askResponseImages = undefined;
    const askTs = Date.now();
    this.lastMessageTs = askTs;
    // await this.addToClaudeMessages({ ts: askTs, type: "ask", ask: type, text: question })
    // await this.providerRef.deref()?.postStateToWebview()
    let codeboltAskReaponse = await ask_question(question, type);
    if (codeboltAskReaponse.type === "confirmationResponse") {
      this.handleWebviewAskResponse(codeboltAskReaponse.message.userMessage, undefined, []);
    } else {
      codeboltAskReaponse.type === "feedbackResponse";
      this.handleWebviewAskResponse("messageResponse", codeboltAskReaponse.message.userMessage, []);
    }
    // await pWaitFor(() => this.askResponse !== undefined || this.lastMessageTs !== askTs, { interval: 100 })
    if (this.lastMessageTs !== askTs) {
      //throw new Error("Current ask promise was ignored") // could happen if we send multiple asks in a row i.e. with command_output. It's important that when we know an ask could fail, it is handled gracefully
    }
    if (!this.askResponse) {
      // Finish the process or exit the function
      return;
    }
    // await pWaitFor(() => this.askResponse !== undefined || this.lastMessageTs !== askTs, { interval: 100 })
    if (this.lastMessageTs !== askTs) {
      //throw new Error("Current ask promise was ignored") // could happen if we send multiple asks in a row i.e. with command_output. It's important that when we know an ask could fail, it is handled gracefully
    }
    const result = {
      response: this.askResponse,
      text: this.askResponseText,
      images: this.askResponseImages
    };
    this.askResponse = undefined;
    this.askResponseText = undefined;
    this.askResponseImages = undefined;
    return result;
  }
  async say(type, text, images, isUserMessage = false) {
    if (this.abort) {
      throw new Error("CodeboltDev instance aborted");
    }
    const sayTs = Date.now();
    this.lastMessageTs = sayTs;
    // await this.addToClaudeMessages({ ts: sayTs, type: "say", say: type, text: text, images })
    // await this.providerRef.deref()?.postStateToWebview()
    if (type == "text" || type == "error" || type == "tool" || type == "command") if (text != "" && !isUserMessage) send_message_to_ui(text, type);
  }
  async startTask(task, images, response) {
    this.taskId = Date.now().toString();
    this.claudeMessages = [];
    this.apiConversationHistory = [];
    await this.say("text", task, images, true);
    cwd = await currentProjectPath();
    let imageBlocks = this.formatImagesIntoBlocks(images);
    await this.initiateTaskLoop([{
      type: "text",
      text: `<task>\n${task}\n</task>`
    }, ...imageBlocks]);
    response("ok");
  }
  async initiateTaskLoop(userContent) {
    let nextUserContent = userContent;
    let includeFileDetails = true;
    let initialMessage = true;
    while (!this.abort) {
      const {
        didEndLoop
      } = await this.recursivelyMakeCodebotRequests(nextUserContent, includeFileDetails, initialMessage);
      includeFileDetails = false; // we only need file details the first time

      //  The way this agentic loop works is that claude will be given a task that he then calls tools to complete. unless there's an attempt_completion call, we keep responding back to him with his tool's responses until he either attempt_completion or does not use anymore tools. If he does not use anymore tools, we ask him to consider if he's completed the task and then call attempt_completion, otherwise proceed with completing the task.
      // There is a MAX_REQUESTS_PER_TASK limit to prevent infinite requests, but Claude is prompted to finish the task as efficiently as he can.

      //const totalCost = this.calculateApiCost(totalInputTokens, totalOutputTokens)
      if (didEndLoop) {
        // For now a task never 'completes'. This will only happen if the user hits max requests and denies resetting the count.
        //this.say("task_completed", `Task completed. Total API usage cost: ${totalCost}`)
        break;
      } else {
        // this.say(
        // 	"tool",
        // 	"Claude responded with only text blocks but has not called attempt_completion yet. Forcing him to continue with task..."
        // )
        nextUserContent = [{
          type: "text",
          text: "If you have completed the user's task, use the attempt_completion tool. If you require additional information from the user, use the ask_followup_question tool. Otherwise, if you have not completed the task and do not need additional information, then proceed with the next step of the task. (This is an automated message, so do not respond to it conversationally.)"
        }];
        this.consecutiveMistakeCount++;
      }
    }
  }
  abortTask() {
    this.abort = true; // will stop any autonomously running promises
    this.terminalManager.disposeAll();
  }
  async executeTool(toolName, toolInput) {
    switch (toolName) {
      case "write_to_file":
        return writeToFile(toolInput.path, toolInput.content);
      case "read_file":
        return readFile(toolInput.path);
      case "list_files":
        return listFiles(toolInput.path, toolInput.recursive);
      case "list_code_definition_names":
        return listCodeDefinitionNames(toolInput.path);
      case "search_files":
        return searchFiles(toolInput.path, toolInput.regex, toolInput.filePattern);
      case "execute_command":
        return executeCommand(toolInput.command);
      case "ask_followup_question":
        return this.askFollowupQuestion(toolInput.question);
      case "attempt_completion":
        return this.attemptCompletion(toolInput.result, toolInput.command);
      default:
        return [false, `Unknown tool: ${toolName}`];
    }
  }
  async askFollowupQuestion(question) {
    if (question === undefined) {
      this.consecutiveMistakeCount++;
      return [false, await this.sayAndCreateMissingParamError("ask_followup_question", "question")];
    }
    this.consecutiveMistakeCount = 0;
    const {
      text,
      images
    } = await this.ask("followup", question);
    await this.say("user_feedback", text ?? "", images);
    return [false, this.formatToolResponseWithImages(`<answer>\n${text}\n</answer>`, images)];
  }
  async attemptCompletion(result, command) {
    // result is required, command is optional
    if (result === undefined) {
      this.consecutiveMistakeCount++;
      return [false, await this.sayAndCreateMissingParamError("attempt_completion", "result")];
    }
    this.consecutiveMistakeCount = 0;
    let resultToSend = result;
    // if (command) {
    // 	await this.say("completion_result", resultToSend)
    // 	// TODO: currently we don't handle if this command fails, it could be useful to let claude know and retry
    // 	const [didUserReject, commandResult] = await executeCommand(command, true)
    // 	// if we received non-empty string, the command was rejected or failed
    // 	if (commandResult) {
    // 		return [didUserReject, commandResult]
    // 	}
    // 	resultToSend = ""
    // }

    // const { response, text, images } = await this.ask("completion_result", resultToSend) // this prompts webview to show 'new task' button, and enable text input (which would be the 'text' here)
    // if (!Object.values(ApproveButtons).includes(response)) {
    return [false, ""]; // signals to recursive loop to stop (for now this never happens since yesButtonTapped will trigger a new task)
    // }
    await this.say("user_feedback", text ?? "", images);
    return [true, this.formatToolResponseWithImages(`The user has provided feedback on the results. Consider their input to continue the task, and then attempt completion again.\n<feedback>\n${text}\n</feedback>`, images)];
  }
  async attemptApiRequest() {
    try {
      // let projectPath = await currentProjectPath();
      // console.log(projectPath)
      // cwd=projectPath;
      let systemPrompt = await getSystemPrompt(cwd);
      if (this.customInstructions && this.customInstructions.trim()) {
        // altering the system prompt mid-task will break the prompt cache, but in the grand scheme this will not change often so it's better to not pollute user messages with it the way we have to with <potentially relevant details>
        systemPrompt += `
====

USER'S CUSTOM INSTRUCTIONS

The following additional instructions are provided by the user. They should be followed and given precedence in case of conflicts with previous instructions.

${this.customInstructions.trim()}
`;
      }

      // If the last API request's total token usage is close to the context window, truncate the conversation history to free up space for the new request
      // const lastApiReqFinished = findLast(this.claudeMessages, (m) => m.say === "api_req_finished")
      // if (lastApiReqFinished && lastApiReqFinished.text) {
      //     const {
      //         tokensIn,
      //         tokensOut,
      //         cacheWrites,
      //         cacheReads,
      //     } = JSON.parse(
      //         lastApiReqFinished.text
      //     )
      //     const totalTokens = (tokensIn || 0) + (tokensOut || 0) + (cacheWrites || 0) + (cacheReads || 0)
      //     const contextWindow = this.api.getModel().info.contextWindow
      //     const maxAllowedSize = Math.max(contextWindow - 40_000, contextWindow * 0.8)
      //     if (totalTokens >= maxAllowedSize) {
      //         const truncatedMessages = truncateHalfConversation(this.apiConversationHistory)
      //         await this.overwriteApiConversationHistory(truncatedMessages)
      //     }
      // }
      let tools = getTools(cwd);
      let systemMessage = {
        role: "system",
        content: systemPrompt
      };
      let messages = this.apiConversationHistory;
      // messages= convertToOpenAiMessages(messages)
      messages.unshift(systemMessage);
      const createParams = {
        full: true,
        messages: messages,
        tools: tools,
        tool_choice: "auto"
      };
      const completion = await send_message_to_llm(createParams); //await this.client.chat.completions.create(createParams);

      // console.log(createParams.tools)
      // const completion = await send_message_to_llm(createParams) //await this.client.chat.completions.create(crea

      // const { message, userCredits } = await this.api.createMessage(
      //     systemPrompt,
      //     this.apiConversationHistory,
      //     tools
      // )
      return completion;
      // return {message}
    } catch (error) {
      console.log(error);
      const {
        serializeError
      } = await __webpack_require__.e(/* import() */ 521).then(__webpack_require__.bind(__webpack_require__, 8521));
      const {
        response
      } = await this.ask("api_req_failed", error.message ?? JSON.stringify(serializeError(error), null, 2));
      if (!Object.values(ApproveButtons).includes(response)) {
        // this will never happen since if noButtonTapped, we will clear current task, aborting this instance
        throw new Error("API request failed");
      }
      await this.say("api_req_retried");
      return this.attemptApiRequest();
    }
  }
  async recursivelyMakeCodebotRequests(userContent, includeFileDetails = false, initialMessage = false) {
    if (this.abort) {
      throw new Error("CodeboltDev instance aborted");
    }
    if (this.consecutiveMistakeCount >= 3) {
      const {
        response,
        text,
        images
      } = await this.ask("mistake_limit_reached", "Codebolt Dev uses complex prompts and iterative task execution that may be challenging for less capable models. For best results, it's recommended to use Claude 3.5 Sonnet for its advanced agentic coding capabilities.");
      if (response === "messageResponse") {
        userContent.push(...[{
          type: "text",
          text: `You seem to be having trouble proceeding. The user has provided the following feedback to help guide you:\n<feedback>\n${text}\n</feedback>`
        }, ...this.formatImagesIntoBlocks(images)]);
      }
      this.consecutiveMistakeCount = 0;
    }

    // getting verbose details is an expensive operation, it uses globby to top-down build file structure of project which for large projects can take a few seconds
    // for the best UX we show a placeholder api_req_started message with a loading spinner as this happens
    // sendNotification('debug',"Sending Request To AI ...: View Logs")

    await this.say("api_req_started", JSON.stringify({
      request: userContent.map(block => formatContentBlockToMarkdown(block, this.apiConversationHistory)).join("\n\n") + "\n\n<environment_details>\nLoading...\n</environment_details>"
    }));

    // potentially expensive operation
    const environmentDetails = await this.getEnvironmentDetails(false);

    // add environment details as its own text block, separate from tool results
    if (initialMessage) {
      userContent.push({
        type: "text",
        text: environmentDetails
      });
      await this.addToApiConversationHistory({
        role: "user",
        content: userContent
      });
    } else {
      for (let userMessage of userContent) {
        await this.addToApiConversationHistory(userMessage);
      }
      await this.addToApiConversationHistory({
        role: "user",
        content: [{
          type: "text",
          text: environmentDetails
        }]
      });
    }

    // since we sent off a placeholder api_req_started message to update the webview while waiting to actually start the API request (to load potential details for example), we need to update the text of that message
    // const lastApiReqIndex = findLastIndex(this.claudeMessages, (m) => m.say === "api_req_started")
    // this.claudeMessages[lastApiReqIndex].text = JSON.stringify({
    // 	request: userContent
    // 		.map((block) => formatContentBlockToMarkdown(block, this.apiConversationHistory))
    // 		.join("\n\n"),
    // })
    // await this.saveCodeboltMessages()

    try {
      const response = await this.attemptApiRequest();
      if (this.abort) {
        throw new Error("CodeboltDev instance aborted");
      }
      let assistantResponses = [];
      let inputTokens = response.usage.input_tokens;
      let outputTokens = response.usage.output_tokens;
      let cacheCreationInputTokens = response.usage.cache_creation_input_tokens || undefined;
      let cacheReadInputTokens = response.usage.cache_read_input_tokens || undefined;
      // @ts-ignore-next-line
      let totalCost = response.usage.total_cost;
      await this.say("api_req_finished", JSON.stringify({
        tokensIn: inputTokens,
        tokensOut: outputTokens,
        cacheWrites: cacheCreationInputTokens,
        cacheReads: cacheReadInputTokens
      }));

      // A response always returns text content blocks (it's just that before we were iterating over the completion_attempt response before we could append text response, resulting in bug)
      for (const contentBlock of response.choices) {
        // type can only be text or tool_use
        if (contentBlock.message) {
          assistantResponses.push(contentBlock.message);
          if (contentBlock.message) await this.say("text", contentBlock.message.content);
        }
      }

      // need to save assistant responses to file before proceeding to tool use since user can exit at any moment and we wouldn't be able to save the assistant's response
      if (assistantResponses.length > 0) {
        for (let assistantResponse of assistantResponses) {
          await this.addToApiConversationHistory(assistantResponse);
        }
      } else {
        // this should never happen! it there's no assistant_responses, that means we got no text or tool_use content blocks from API which we should assume is an error
        await this.say("error", "Unexpected API Response: The language model did not provide any assistant messages. This may indicate an issue with the API or the model's output.");
        await this.addToApiConversationHistory({
          role: "assistant",
          content: [{
            type: "text",
            text: "Failure: I did not provide a response."
          }]
        });
      }
      let toolResults = [];
      let attemptCompletionBlock;
      let userRejectedATool = false;
      const contentBlock = response.choices[0];
      // for (const contentBlock of response.choices response.ch) {
      if (contentBlock.message && contentBlock.message.tool_calls) {
        for (const tool of contentBlock.message.tool_calls) {
          const toolName = tool.function.name;
          const toolInput = JSON.parse(tool.function.arguments || "{}");
          const toolUseId = tool.id;
          if (userRejectedATool) {
            toolResults.push({
              type: "tool",
              tool_use_id: toolUseId,
              content: "Skipping tool execution due to previous tool user rejection."
            });
            continue;
          }
          if (toolName === "attempt_completion") {
            attemptCompletionBlock = tool;
          } else {
            const [didUserReject, result] = await this.executeTool(toolName, toolInput);
            toolResults.push({
              role: "tool",
              tool_call_id: toolUseId,
              content: result
            });
            // toolResults.push({ type: "tool_result", tool_use_id: toolUseId, content: result })

            if (didUserReject) {
              userRejectedATool = true;
            }
          }
        }
      }
      // }

      let didEndLoop = false;

      // attempt_completion is always done last, since there might have been other tools that needed to be called first before the job is finished
      // it's important to note that claude will order the tools logically in most cases, so we don't have to think about which tools make sense calling before others
      if (attemptCompletionBlock) {
        let [_, result] = await this.executeTool(attemptCompletionBlock.function.name, JSON.parse(attemptCompletionBlock.function.arguments || "{}"));
        if (result === "") {
          didEndLoop = true;
          result = "The user is satisfied with the result.";
        }
        toolResults.push({
          role: "tool",
          tool_call_id: attemptCompletionBlock.id,
          content: result
        });
        // toolResults.push({ type: "tool_result", tool_use_id: attemptCompletionBlock.id, content: result })
      }
      if (toolResults.length > 0) {
        if (didEndLoop) {
          for (let result of toolResults) {
            await this.addToApiConversationHistory(result);
          }
          await this.addToApiConversationHistory({
            role: "assistant",
            content: [{
              type: "text",
              text: "I am pleased you are satisfied with the result. Do you have a new task for me?"
            }]
          });
        } else {
          const {
            didEndLoop: recDidEndLoop,
            inputTokens: recInputTokens,
            outputTokens: recOutputTokens
          } = await this.recursivelyMakeCodebotRequests(toolResults);
          didEndLoop = recDidEndLoop;
          inputTokens += recInputTokens;
          outputTokens += recOutputTokens;
        }
      }
      return {
        didEndLoop,
        inputTokens,
        outputTokens
      };
    } catch (error) {
      console.log(error);
      // this should never happen since the only thing that can throw an error is the attemptApiRequest, which is wrapped in a try catch that sends an ask where if noButtonTapped, will clear current task and destroy this instance. However to avoid unhandled promise rejection, we will end this loop which will end execution of this instance (see startTask)
      return {
        didEndLoop: true,
        inputTokens: 0,
        outputTokens: 0
      };
    }
  }

  // Formatting responses to Claude

  formatImagesIntoBlocks(images) {
    return images ? images.map(dataUrl => {
      // data:image/png;base64,base64string
      const [rest, base64] = dataUrl.split(",");
      const mimeType = rest.split(":")[1].split(";")[0];
      return {
        type: "image",
        source: {
          type: "base64",
          media_type: mimeType,
          data: base64
        }
      };
    }) : [];
  }
  formatToolResponseWithImages(text, images) {
    if (images && images.length > 0) {
      const textBlock = {
        type: "text",
        text
      };
      const imageBlocks = this.formatImagesIntoBlocks(images);
      // Placing images after text leads to better results
      return [textBlock, ...imageBlocks];
    } else {
      return text;
    }
  }
  async getEnvironmentDetails(includeFileDetails = false) {
    let details = "";

    // It could be useful for claude to know if the user went from one or no file to another between messages, so we always include this context
    details += "\n\n# Codebolt Visible Files";
    const visibleFiles = [] //vscode.window.visibleTextEditors
    ?.map(editor => editor.document?.uri?.fsPath).filter(Boolean).map(absolutePath => path.relative(cwd, absolutePath)).join("\n");
    if (visibleFiles) {
      details += `\n${visibleFiles}`;
    } else {
      details += "\n(No visible files)";
    }
    details += "\n\n# Codebolt Open Tabs";
    const openTabs = [] //vscode.window.tabGroups.all
    .flatMap(group => group.tabs).map(tab => tab.input?.uri?.fsPath).filter(Boolean).map(absolutePath => path.relative(cwd, absolutePath)).join("\n");
    if (openTabs) {
      details += `\n${openTabs}`;
    } else {
      details += "\n(No open tabs)";
    }
    const busyTerminals = []; //this.terminalManager.getTerminals(true)
    const inactiveTerminals = []; // this.terminalManager.getTerminals(false)
    // const allTerminals = [...busyTerminals, ...inactiveTerminals]

    if (busyTerminals.length > 0 && this.didEditFile) {
      //  || this.didEditFile
      await delay(300); // delay after saving file to let terminals catch up
    }
    this.didEditFile = false; // reset, this lets us know when to wait for saved files to update terminals

    if (includeFileDetails) {
      const isDesktop = cwd === path.join(os.homedir(), "Desktop");
      const files = await listFiles(cwd, !isDesktop);
      const result = this.formatFilesList(cwd, files);
      details += `\n\n# Current Working Directory (${cwd}) Files\n${result}${isDesktop ? "\n(Note: Only top-level contents shown for Desktop by default. Use list_files to explore further if necessary.)" : ""}`;
    }
    return `<environment_details>\n${details.trim()}\n</environment_details>`;
  }
  async formatToolDeniedFeedback(feedback) {
    return `The user denied this operation and provided the following feedback:\n<feedback>\n${feedback}\n</feedback>`;
  }
  async formatToolDenied() {
    return `The user denied this operation.`;
  }
  async formatToolResult(result) {
    return result; // the successful result of the tool should never be manipulated, if we need to add details it should be as a separate user text block
  }
  async formatToolError(error) {
    return `The tool execution failed with the following error:\n<error>\n${error}\n</error>`;
  }
  async sayAndCreateMissingParamError(toolName, paramName, relPath) {
    await this.say("error", `Claude tried to use ${toolName}${relPath ? ` for '${relPath}'` : ""} without value for required parameter '${paramName}'. Retrying...`);
    return await this.formatToolError(`Missing value for required parameter '${paramName}'. Please retry with complete response.`);
  }
  getReadablePath(relPath) {
    // path.resolve is flexible in that it will resolve relative paths like '../../' to the cwd and even ignore the cwd if the relPath is actually an absolute path
    const absolutePath = path.resolve(cwd, relPath);
    if (cwd === path.join(os.homedir(), "Desktop")) {
      // User opened vscode without a workspace, so cwd is the Desktop. Show the full absolute path to keep the user aware of where files are being created
      return absolutePath;
    }
    if (path.normalize(absolutePath) === path.normalize(cwd)) {
      return path.basename(absolutePath);
    } else {
      // show the relative path to the cwd
      const normalizedRelPath = path.relative(cwd, absolutePath);
      if (absolutePath.includes(cwd)) {
        return normalizedRelPath;
      } else {
        // we are outside the cwd, so show the absolute path (useful for when claude passes in '../../' for example)
        return absolutePath;
      }
    }
  }
  formatFilesList(absolutePath, files) {
    const sorted = files.map(file => {
      // convert absolute path to relative path
      const relativePath = path.relative(absolutePath, file);
      return file.endsWith("/") ? relativePath + "/" : relativePath;
    })
    // Sort so files are listed under their respective directories to make it clear what files are children of what directories. Since we build file list top down, even if file list is truncated it will show directories that claude can then explore further.
    .sort((a, b) => {
      const aParts = a.split("/");
      const bParts = b.split("/");
      for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
        if (aParts[i] !== bParts[i]) {
          // If one is a directory and the other isn't at this level, sort the directory first
          if (i + 1 === aParts.length && i + 1 < bParts.length) {
            return -1;
          }
          if (i + 1 === bParts.length && i + 1 < aParts.length) {
            return 1;
          }
          // Otherwise, sort alphabetically
          return aParts[i].localeCompare(bParts[i], undefined, {
            numeric: true,
            sensitivity: "base"
          });
        }
      }
      // If all parts are the same up to the length of the shorter path,
      // the shorter one comes first
      return aParts.length - bParts.length;
    });
    if (sorted.length >= LIST_FILES_LIMIT) {
      const truncatedList = sorted.slice(0, LIST_FILES_LIMIT).join("\n");
      return `${truncatedList}\n\n(Truncated at ${LIST_FILES_LIMIT} results. Try listing files in subdirectories if you need to explore further.)`;
    } else if (sorted.length === 0 || sorted.length === 1 && sorted[0] === "") {
      return "No files found or you do not have permission to view this directory.";
    } else {
      return sorted.join("\n");
    }
  }

  /**
   * Asynchronously creates all non-existing subdirectories for a given file path
   * and collects them in an array for later deletion.
   *
   * @param filePath - The full path to a file.
   * @returns A promise that resolves to an array of newly created directories.
   */
  async createDirectoriesForFile(filePath) {
    const newDirectories = [];
    const normalizedFilePath = path.normalize(filePath); // Normalize path for cross-platform compatibility
    const directoryPath = path.dirname(normalizedFilePath);
    let currentPath = directoryPath;
    const dirsToCreate = [];

    // Traverse up the directory tree and collect missing directories
    while (!(await this.exists(currentPath))) {
      dirsToCreate.push(currentPath);
      currentPath = path.dirname(currentPath);
    }

    // Create directories from the topmost missing one down to the target directory
    for (let i = dirsToCreate.length - 1; i >= 0; i--) {
      await fs.mkdir(dirsToCreate[i]);
      newDirectories.push(dirsToCreate[i]);
    }
    return newDirectories;
  }

  /**
   * Helper function to check if a path exists.
   *
   * @param path - The path to check.
   * @returns A promise that resolves to true if the path exists, false otherwise.
   */
  async exists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
module.exports = {
  CodeboltDev
};

/***/ }),

/***/ 7601:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const websocket_1 = __importDefault(__webpack_require__(6900));
const fs_1 = __importDefault(__webpack_require__(2976));
const llm_1 = __importDefault(__webpack_require__(5500));
const terminal_1 = __importDefault(__webpack_require__(8015));
const browser_1 = __importDefault(__webpack_require__(3671));
const chat_1 = __importDefault(__webpack_require__(7145));
const codeutils_1 = __importDefault(__webpack_require__(3233));
const docutils_1 = __importDefault(__webpack_require__(3128));
const crawler_1 = __importDefault(__webpack_require__(8439));
const search_1 = __importDefault(__webpack_require__(7899));
const knowledge_1 = __importDefault(__webpack_require__(1219));
const rag_1 = __importDefault(__webpack_require__(8049));
const codeparsers_1 = __importDefault(__webpack_require__(5080));
const outputparsers_1 = __importDefault(__webpack_require__(2944));
const project_1 = __importDefault(__webpack_require__(4742));
const git_1 = __importDefault(__webpack_require__(2455));
const dbmemory_1 = __importDefault(__webpack_require__(5118));
const state_1 = __importDefault(__webpack_require__(6902));
const task_1 = __importDefault(__webpack_require__(9086));
const vectordb_1 = __importDefault(__webpack_require__(1242));
const debug_1 = __importDefault(__webpack_require__(7964));
const tokenizer_1 = __importDefault(__webpack_require__(6654));
const ws_1 = __importDefault(__webpack_require__(1085));
const history_1 = __webpack_require__(7103);
/**
 * @class Codebolt
 * @description This class provides a unified interface to interact with various modules.
 */
class Codebolt {
  /**
   * @constructor
   * @description Initializes the websocket connection.
   */
  constructor() {
    this.websocket = null;
    this.fs = fs_1.default;
    this.git = git_1.default;
    this.llm = llm_1.default;
    this.browser = browser_1.default;
    this.chat = chat_1.default;
    this.terminal = terminal_1.default;
    this.codeutils = codeutils_1.default;
    this.docutils = docutils_1.default;
    this.crawler = crawler_1.default;
    this.search = search_1.default;
    this.knowledge = knowledge_1.default;
    this.rag = rag_1.default;
    this.codeparsers = codeparsers_1.default;
    this.outputparsers = outputparsers_1.default;
    this.project = project_1.default;
    this.dbmemory = dbmemory_1.default;
    this.cbstate = state_1.default;
    this.taskplaner = task_1.default;
    this.vectordb = vectordb_1.default;
    this.debug = debug_1.default;
    this.tokenizer = tokenizer_1.default;
    this.chatSummary = history_1.chatSummary;
    this.websocket = websocket_1.default.getWebsocket;
  }
  /**
   * @method waitForConnection
   * @description Waits for the WebSocket connection to open.
   * @returns {Promise<void>} A promise that resolves when the WebSocket connection is open.
   */
  async waitForConnection() {
    return new Promise((resolve, reject) => {
      if (!this.websocket) {
        reject(new Error('WebSocket is not initialized'));
        return;
      }
      if (this.websocket.readyState === ws_1.default.OPEN) {
        resolve();
        return;
      }
      this.websocket.addEventListener('open', () => {
        resolve();
      });
      this.websocket.addEventListener('error', error => {
        reject(error);
      });
    });
  }
}
exports["default"] = new Codebolt();
// module.exports = new Codebolt();

/***/ }),

/***/ 3671:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const websocket_1 = __importDefault(__webpack_require__(6900));
/**
 * A module for interacting with a browser through WebSockets.
 */
const cbbrowser = {
  /**
   * Opens a new page in the browser.
   */
  newPage: () => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "browserEvent",
        action: 'newPage'
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.event === "newPageResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Retrieves the current URL of the browser's active page.
   * @returns {Promise<UrlResponse>} A promise that resolves with the URL.
   */
  getUrl: () => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "browserEvent",
        action: 'getUrl'
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.event === "getUrlResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Navigates to a specified URL.
   * @param {string} url - The URL to navigate to.
   * @returns {Promise<GoToPageResponse>} A promise that resolves when navigation is complete.
   */
  goToPage: url => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "browserEvent",
        action: 'goToPage',
        url
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.event === "goToPageResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Takes a screenshot of the current page.
   */
  screenshot: () => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "browserEvent",
        action: 'screenshot'
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.event === "screenshotResponse") {
          resolve(response.payload);
        }
      });
    });
  },
  /**
   * Retrieves the HTML content of the current page.
   * @returns {Promise<HtmlReceived>} A promise that resolves with the HTML content.
   */
  getHTML: () => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "browserEvent",
        action: 'getHTML'
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.event === "htmlReceived") {
          resolve(response.htmlResponse);
        }
      });
    });
  },
  /**
   * Retrieves the Markdown content of the current page.
   * @returns {Promise<GetMarkdownResponse>} A promise that resolves with the Markdown content.
   */
  getMarkdown: () => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "browserEvent",
        action: 'getMarkdown'
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.event === "getMarkdownResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Retrieves the PDF content of the current page.
   *
   */
  getPDF: () => {
    websocket_1.default.getWebsocket.send(JSON.stringify({
      "type": "browserEvent",
      action: 'getPDF'
    }));
  },
  /**
   * Converts the PDF content of the current page to text.
   */
  pdfToText: () => {
    websocket_1.default.getWebsocket.send(JSON.stringify({
      "type": "browserEvent",
      action: 'pdfToText'
    }));
  },
  /**
   * Retrieves the content of the current page.
   *  @returns {Promise<GetContentResponse>} A promise that resolves with the content.
   */
  getContent: () => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "browserEvent",
        action: 'getContent'
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.event === "getContentResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Retrieves the snapshot of the current page.
   *  @returns {Promise<GetContentResponse>} A promise that resolves with the content.
   */
  getSnapShot: () => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "browserEvent",
        action: 'getSnapShot'
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.event === "getSnapShotResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Retrieves browser info like height width scrollx scrolly of the current page.
   *  @returns {Promise<GetContentResponse>} A promise that resolves with the content.
   */
  getBrowserInfo: () => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "browserEvent",
        action: 'getBrowserInfo'
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.event === "getBrowserInfoResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Extracts text from the current page.
   *  @returns {Promise<ExtractTextResponse>} A promise that resolves with the extracted text.
   *
   */
  extractText: () => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "browserEvent",
        action: 'extractText'
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.event === "extractTextResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Closes the current page.
   */
  close: () => {
    websocket_1.default.getWebsocket.send(JSON.stringify({
      "type": "browserEvent",
      action: 'close'
    }));
  },
  /**
   * Scrolls the current page in a specified direction by a specified number of pixels.
   * @param {string} direction - The direction to scroll.
   * @param {string} pixels - The number of pixels to scroll.
   * @returns {Promise<any>} A promise that resolves when the scroll action is complete.
   */
  scroll: (direction, pixels) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "browserEvent",
        action: 'scroll',
        direction,
        pixels
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.event === "scrollResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Types text into a specified element on the page.
   * @param {string} elementid - The ID of the element to type into.
   * @param {string} text - The text to type.
   * @returns {Promise<any>} A promise that resolves when the typing action is complete.
   */
  type: (elementid, text) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "browserEvent",
        action: 'type',
        text,
        elementid
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.event === "typeResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Clicks on a specified element on the page.
   * @param {string} elementid - The ID of the element to click.
   * @returns {Promise<any>} A promise that resolves when the click action is complete.
   */
  click: elementid => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "browserEvent",
        action: 'click',
        elementid
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.event === "clickResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Simulates the Enter key press on the current page.
   * @returns {Promise<any>} A promise that resolves when the Enter action is complete.
   */
  enter: () => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "browserEvent",
        action: 'enter'
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.event === "EnterResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Performs a search on the current page using a specified query.
   * @param {string} elementid - The ID of the element to perform the search in.
   * @param {string} query - The search query.
   * @returns {Promise<any>} A promise that resolves with the search results.
   */
  search: (elementid, query) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "browserEvent",
        action: 'search',
        elementid,
        query
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.event === "searchResponse") {
          resolve(response);
        }
      });
    });
  }
};
exports["default"] = cbbrowser;
/***

start_browser(objective: string, url: string, previous_command: string, browser_content: string) {
    cbbrowser.newPage();
}
 */

/***/ }),

/***/ 7145:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
// chat.ts
const websocket_1 = __importDefault(__webpack_require__(6900));
const events_1 = __webpack_require__(4434);
/**
 * CustomEventEmitter class that extends the Node.js EventEmitter class.
 */
class CustomEventEmitter extends events_1.EventEmitter {}
let eventEmitter = new CustomEventEmitter();
/**
 * Chat module to interact with the WebSocket server.
 */
const cbchat = {
  /**
   * Retrieves the chat history from the server.
   * @returns {Promise<ChatMessage[]>} A promise that resolves with an array of ChatMessage objects representing the chat history.
   */
  getChatHistory: () => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "getChatHistory"
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "getChatHistoryResponse") {
          resolve(response); // Resolve the Promise with the response data
        }
      });
    });
  },
  /**
   * Sets up a listener for incoming WebSocket messages and emits a custom event when a message is received.
   * @returns {EventEmitter} The event emitter used for emitting custom events.
   */
  onActionMessage: () => {
    if (!websocket_1.default.getWebsocket) return;
    websocket_1.default.getWebsocket.on('message', data => {
      const response = JSON.parse(data);
      if (response.type === "messageResponse") {
        // Pass a callback function as an argument to the emit method
        eventEmitter.emit("userMessage", response, message => {
          console.log("Callback function invoked with message:", message);
          websocket_1.default.getWebsocket.send(JSON.stringify({
            "type": "processStoped"
          }));
        });
      }
    });
    return eventEmitter;
  },
  /**
   * Sends a message through the WebSocket connection.
   * @param {string} message - The message to be sent.
   */
  sendMessage: (message, payload) => {
    console.log(message);
    websocket_1.default.getWebsocket.send(JSON.stringify({
      "type": "sendMessage",
      "message": message,
      payload
    }));
  },
  /**
   * Waits for a reply to a sent message.
   * @param {string} message - The message for which a reply is expected.
   * @returns {Promise<UserMessage>} A promise that resolves with the reply.
   */
  waitforReply: message => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "waitforReply",
        "message": message
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "waitFormessageResponse") {
          resolve(response); // Resolve the Promise with the response data
        }
      });
    });
  },
  /**
   * Notifies the server that a process has started and sets up an event listener for stopProcessClicked events.
   * @returns An object containing the event emitter and a stopProcess method.
   */
  processStarted: () => {
    // Send the process started message
    websocket_1.default.getWebsocket.send(JSON.stringify({
      "type": "processStarted"
    }));
    // Register event listener for WebSocket messages
    websocket_1.default.getWebsocket.on('message', data => {
      const message = JSON.parse(data);
      console.log("Received message:", message);
      if (message.type === 'stopProcessClicked')
        // Emit a custom event based on the message type
        eventEmitter.emit("stopProcessClicked", message);
    });
    // Return an object that includes the event emitter and the stopProcess method
    return {
      event: eventEmitter,
      stopProcess: () => {
        // Implement the logic to stop the process here
        console.log("Stopping process...");
        // For example, you might want to send a specific message to the server to stop the process
        websocket_1.default.getWebsocket.send(JSON.stringify({
          "type": "processStoped"
        }));
      }
    };
  },
  /**
   * Stops the ongoing process.
   * Sends a specific message to the server to stop the process.
   */
  stopProcess: () => {
    // Implement the logic to stop the process here
    console.log("Stopping process...");
    // For example, you might want to send a specific message to the server to stop the process
    websocket_1.default.getWebsocket.send(JSON.stringify({
      "type": "processStoped"
    }));
  },
  /**
  * Stops the ongoing process.
  * Sends a specific message to the server to stop the process.
  */
  processFinished: () => {
    // Implement the logic to stop the process here
    console.log("Process Finished ...");
    // For example, you might want to send a specific message to the server to stop the process
    websocket_1.default.getWebsocket.send(JSON.stringify({
      "type": "processFinished"
    }));
  },
  /**
   * Sends a confirmation request to the server with two options: Yes or No.
   * @returns {Promise<string>} A promise that resolves with the server's response.
   */
  sendConfirmationRequest: (confirmationMessage, buttons = [], withFeedback = false) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "confirmationRequest",
        "message": confirmationMessage,
        buttons: buttons,
        withFeedback
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "confirmationResponse" || response.type === "feedbackResponse") {
          resolve(response); // Resolve the Promise with the server's response
        }
      });
    });
  },
  /**
  * Sends a notification event to the server.
  * @param {string} notificationMessage - The message to be sent in the notification.
  */
  sendNotificationEvent: (notificationMessage, type) => {
    websocket_1.default.getWebsocket.send(JSON.stringify({
      "type": "notificationEvent",
      "message": notificationMessage,
      "eventType": type
    }));
  }
};
exports["default"] = cbchat;

/***/ }),

/***/ 5080:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
/**
 * A collection of code parser functions.
 */
const cbcodeparsers = {
  /**
   * Retrieves the classes in a given file.
   * @param file The file to parse for classes.
   */
  getClassesInFile: file => {
    console.log('Code parsers initialized');
  },
  /**
   * Retrieves the functions in a given class within a file.
   * @param file The file containing the class.
   * @param className The name of the class to parse for functions.
   */
  getFunctionsinClass: (file, className) => {
    console.log('Code parsers initialized');
  },
  /**
   * Generates an Abstract Syntax Tree (AST) for a given file.
   * @param file The file to generate an AST for.
   * @param className The name of the class to focus the AST generation on.
   */
  getAstTreeInFile: (file, className) => {}
};
exports["default"] = cbcodeparsers;

/***/ }),

/***/ 3233:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


var __createBinding = this && this.__createBinding || (Object.create ? function (o, m, k, k2) {
  if (k2 === undefined) k2 = k;
  var desc = Object.getOwnPropertyDescriptor(m, k);
  if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
    desc = {
      enumerable: true,
      get: function () {
        return m[k];
      }
    };
  }
  Object.defineProperty(o, k2, desc);
} : function (o, m, k, k2) {
  if (k2 === undefined) k2 = k;
  o[k2] = m[k];
});
var __setModuleDefault = this && this.__setModuleDefault || (Object.create ? function (o, v) {
  Object.defineProperty(o, "default", {
    enumerable: true,
    value: v
  });
} : function (o, v) {
  o["default"] = v;
});
var __importStar = this && this.__importStar || function (mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
  __setModuleDefault(result, mod);
  return result;
};
var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const websocket_1 = __importDefault(__webpack_require__(6900));
const fs = __importStar(__webpack_require__(9896));
const path_1 = __importDefault(__webpack_require__(6928));
const tree_sitter_1 = __importDefault(__webpack_require__(941));
const tree_sitter_javascript_1 = __importDefault(__webpack_require__(3859));
/**
 * A utility module for working with code.
 */
const cbcodeutils = {
  /**
   * Retrieves a JavaScript tree structure for a given file path.
   * @param {string} filePath - The path of the file to retrieve the JS tree for.
   * @returns {Promise<GetJsTreeResponse>} A promise that resolves with the JS tree response.
   */
  getJsTree: filePath => {
    return new Promise(async (resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "settingEvent",
        "action": "getProjectPath"
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "getProjectPathResponse") {
          // resolve(response);
          try {
            let pathInput = response.projectPath;
            let parser = new tree_sitter_1.default();
            // Initialize the parser with the JavaScript language
            parser.setLanguage(tree_sitter_javascript_1.default);
            const trees = [];
            const functionNodes = [];
            const processDirectory = directory => {
              console.log("isdir");
              // Read all files in the directory
              const files = fs.readdirSync(directory, {
                withFileTypes: true
              });
              files.forEach(file => {
                if (file.isDirectory()) {
                  if (file.name !== 'node_modules') {
                    // Ignore node_modules directory
                    processDirectory(path_1.default.join(directory, file.name)); // Recursive call for subdirectories
                  }
                } else if (path_1.default.extname(file.name) === '.js') {
                  const code = fs.readFileSync(path_1.default.join(directory, file.name), 'utf-8');
                  console.log(code);
                  let tree = parser.parse(code);
                  tree.rootNode.path = path_1.default.join(directory, file.name); // Set file path for t
                  trees.push(tree);
                }
              });
            };
            if (fs.lstatSync(pathInput).isDirectory()) {
              processDirectory(pathInput);
            } else if (path_1.default.extname(pathInput) === '.js') {
              // Read a single JavaScript file
              const code = fs.readFileSync(pathInput, 'utf-8');
              let tree = parser.parse(code);
              tree.rootNode.path = pathInput; // Set file path for t
              trees.push(tree);
            }
            resolve({
              event: 'GetJsTreeResponse',
              payload: trees
            }); // Return an array of abstract syntax trees (ASTs)
          } catch (error) {
            console.error('An error occurred:', error);
            return {
              event: 'GetJsTreeResponse',
              payload: null
            }; // Return null in case of error
          }
        }
      });
      // cbws.getWebsocket.send(JSON.stringify({
      //     "type": "codeEvent",
      //     "action":"getJsTree",
      //     payload:{
      //         filePath
      //     }
      // }));
      // cbws.getWebsocket.on('message', (data: string) => {
      //     const response = JSON.parse(data);
      //     if (response.type === "getJsTreeResponse") {
      //         resolve(response); // Resolve the Promise with the response data
      //     } 
      // });
    });
  },
  /**
   * Retrieves all files as Markdown.
   * @returns {Promise<string>} A promise that resolves with the Markdown content of all files.
   */
  getAllFilesAsMarkDown: () => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "codeEvent",
        "action": "getAllFilesMarkdown"
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "getAllFilesMarkdownResponse") {
          resolve(response); // Resolve the Promise with the response data
        }
      });
    });
  },
  /**
   * Performs a matching operation based on the provided matcher definition and problem patterns.
   * @param {object} matcherDefinition - The definition of the matcher.
   * @param {Array} problemPatterns - The patterns to match against.
   * @param {Array} problems - The list of problems.
   * @returns {Promise<MatchProblemResponse>} A promise that resolves with the matching problem response.
   */
  performMatch: (matcherDefinition, problemPatterns, problems) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "codeEvent",
        "action": "performMatch",
        payload: {
          matcherDefinition,
          problemPatterns
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "getgetJsTreeResponse") {
          resolve(response); // Resolve the Promise with the response data
        }
      });
    });
  },
  /**
   * Retrieves the list of matchers.
   * @returns {Promise<GetMatcherListTreeResponse>} A promise that resolves with the list of matchers response.
   */
  getMatcherList: () => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "codeEvent",
        "action": "getMatcherList"
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "getMatcherListTreeResponse") {
          resolve(response); // Resolve the Promise with the response data
        }
      });
    });
  },
  /**
   * Retrieves details of a match.
   * @param {string} matcher - The matcher to retrieve details for.
   * @returns {Promise<getMatchDetail>} A promise that resolves with the match detail response.
   */
  matchDetail: matcher => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "codeEvent",
        "action": "getMatchDetail",
        payload: {
          match: matcher
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "matchDetailTreeResponse") {
          resolve(response); // Resolve the Promise with the response data
        }
      });
    });
  }
};
exports["default"] = cbcodeutils;

/***/ }),

/***/ 8439:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const websocket_1 = __importDefault(__webpack_require__(6900));
/**
 * A module for controlling a web crawler through WebSocket messages.
 */
const cbcrawler = {
  /**
   * Starts the crawler.
   */
  start: () => {
    websocket_1.default.getWebsocket.send(JSON.stringify({
      "type": "crawlerEvent",
      action: 'start'
    }));
  },
  /**
   * Takes a screenshot using the crawler.
   */
  screenshot: () => {
    websocket_1.default.getWebsocket.send(JSON.stringify({
      "type": "crawlerEvent",
      action: 'screenshot'
    }));
  },
  /**
   * Directs the crawler to navigate to a specified URL.
   * @param url - The URL for the crawler to navigate to.
   */
  goToPage: url => {
    websocket_1.default.getWebsocket.send(JSON.stringify({
      "type": "crawlerEvent",
      action: 'goToPage',
      url
    }));
  },
  /**
   * Scrolls the crawler in a specified direction.
   * @param direction - The direction to scroll ('up', 'down', 'left', 'right').
   */
  scroll: direction => {
    websocket_1.default.getWebsocket.send(JSON.stringify({
      "type": "crawlerEvent",
      action: 'scroll',
      direction
    }));
  },
  /**
   * Simulates a click event on an element with the specified ID.
   * @param id - The ID of the element to be clicked.
   * @returns {Promise<any>} A promise that resolves when the click action is complete.
   */
  click: id => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "crawlerEvent",
        action: 'click',
        id
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.event === "clickFinished") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Types the provided text into an element with the specified ID.
   * @param id - The ID of the element where text will be typed.
   * @param text - The text to type into the element.
   * @returns {Promise<any>} A promise that resolves when the type action is complete.
   */
  type: (id, text) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "crawlerEvent",
        action: 'type',
        id,
        text
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.event === "typeFinished") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Simulates the Enter key press using the crawler.
   */
  enter: () => {
    websocket_1.default.getWebsocket.send(JSON.stringify({
      "type": "crawlerEvent",
      action: 'enter'
    }));
  },
  /**
   * Initiates a crawl process.
   */
  crawl: query => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "crawlerEvent",
        "action": 'crawl',
        "message": {
          query
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "crawlResponse") {
          resolve(response); // Resolve the Promise with the response data
        }
      });
    });
  }
};
exports["default"] = cbcrawler;

/***/ }),

/***/ 5118:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const websocket_1 = __importDefault(__webpack_require__(6900));
/**
 * A module for handling in-memory database operations via WebSocket.
 */
const dbmemory = {
  /**
   * Adds a key-value pair to the in-memory database.
   * @param {string} key - The key under which to store the value.
   * @param {any} value - The value to be stored.
   * @returns {Promise<MemorySetResponse>} A promise that resolves with the response from the memory set event.
   */
  addKnowledge: (key, value) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "memoryEvent",
        'action': 'set',
        key,
        value
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "memorySetResponse") {
          resolve(response); // Resolve the Promise with the response data
        }
      });
    });
  },
  /**
   * Retrieves a value from the in-memory database by key.
   * @param {string} key - The key of the value to retrieve.
   * @returns {Promise<MemoryGetResponse>} A promise that resolves with the response from the memory get event.
   */
  getKnowledge: key => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "memoryEvent",
        'action': 'get',
        key
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "memoryGetResponse") {
          resolve(response); // Resolve the Promise with the response data
        }
      });
    });
  }
};
exports["default"] = dbmemory;

/***/ }),

/***/ 7964:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.debug = exports.logType = void 0;
const websocket_1 = __importDefault(__webpack_require__(6900));
var logType;
(function (logType) {
  logType["info"] = "info";
  logType["error"] = "error";
  logType["warning"] = "warning";
})(logType || (exports.logType = logType = {}));
exports.debug = {
  /**
   * Sends a log message to the debug websocket and waits for a response.
   * @param {string} log - The log message to send.
   * @param {logType} type - The type of the log message (info, error, warning).
   * @returns {Promise<DebugAddLogResponse>} A promise that resolves with the response from the debug event.
   */
  debug: (log, type) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "debugEvent",
        "action": "addLog",
        message: {
          log,
          type
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "debugEventResponse") {
          resolve(response); // Resolve the Promise with the response data
        }
      });
    });
  },
  /**
   * Requests to open a debug browser at the specified URL and port.
   * @param {string} url - The URL where the debug browser should be opened.
   * @param {number} port - The port on which the debug browser will listen.
   * @returns {Promise<OpenDebugBrowserResponse>} A promise that resolves with the response from the open debug browser event.
   */
  openDebugBrowser: (url, port) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "debugEvent",
        "action": "openDebugBrowser",
        message: {
          url,
          port
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "openDebugBrowserResponse") {
          resolve(response); // Resolve the Promise with the response data
        }
      });
    });
  }
};
exports["default"] = exports.debug;

/***/ }),

/***/ 3128:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
/**
 * A module for document utility functions.
 */
const cbdocutils = {
  /**
   * Converts a PDF document to text.
   * @param pdf_path - The file path to the PDF document to be converted.
   * @returns {Promise<string>} A promise that resolves with the converted text.
   */
  pdf_to_text: pdf_path => {
    // Implementation would go here
    return new Promise((resolve, reject) => {
      // PDF to text conversion logic
    });
  }
};
exports["default"] = cbdocutils;

/***/ }),

/***/ 2976:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const websocket_1 = __importDefault(__webpack_require__(6900));
/**
 * @module cbfs
 * @description This module provides functionality to interact with the filesystem.
 */
const cbfs = {
  /**
   * @function createFile
   * @description Creates a new file.
   * @param {string} fileName - The name of the file to create.
   * @param {string} source - The source content to write into the file.
   * @param {string} filePath - The path where the file should be created.
   * @returns {Promise<CreateFileResponse>} A promise that resolves with the server response.
   */
  createFile: (fileName, source, filePath) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "fsEvent",
        "action": "createFile",
        "message": {
          fileName,
          source,
          filePath
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "createFileResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * @function createFolder
   * @description Creates a new folder.
   * @param {string} folderName - The name of the folder to create.
   * @param {string} folderPath - The path where the folder should be created.
   * @returns {Promise<CreateFolderResponse>} A promise that resolves with the server response.
   */
  createFolder: (folderName, folderPath) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "fsEvent",
        "action": "createFolder",
        "message": {
          folderName,
          folderPath
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "createFolderResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * @function readFile
   * @description Reads the content of a file.
   * @param {string} filename - The name of the file to read.
   * @param {string} filePath - The path of the file to read.
   * @returns {Promise<ReadFileResponse>} A promise that resolves with the server response.
   */
  readFile: filePath => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "fsEvent",
        "action": "readFile",
        "message": {
          filePath
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "readFileResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * @function updateFile
   * @description Updates the content of a file.
   * @param {string} filename - The name of the file to update.
   * @param {string} filePath - The path of the file to update.
   * @param {string} newContent - The new content to write into the file.
   * @returns {Promise<UpdateFileResponse>} A promise that resolves with the server response.
   */
  updateFile: (filename, filePath, newContent) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "fsEvent",
        "action": "updateFile",
        "message": {
          filename,
          filePath,
          newContent
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "commandOutput") {
          resolve(response);
        }
      });
    });
  },
  /**
   * @function deleteFile
   * @description Deletes a file.
   * @param {string} filename - The name of the file to delete.
   * @param {string} filePath - The path of the file to delete.
   * @returns {Promise<DeleteFileResponse>} A promise that resolves with the server response.
   */
  deleteFile: (filename, filePath) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "fsEvent",
        "action": "deleteFile",
        "message": {
          filename,
          filePath
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "deleteFileResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * @function deleteFolder
   * @description Deletes a folder.
   * @param {string} foldername - The name of the folder to delete.
   * @param {string} folderpath - The path of the folder to delete.
   * @returns {Promise<DeleteFolderResponse>} A promise that resolves with the server response.
   */
  deleteFolder: (foldername, folderpath) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "fsEvent",
        "action": "deleteFolder",
        "message": {
          foldername,
          folderpath
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "deleteFolderResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * @function listFile
   * @description Lists all files.
   * @returns {Promise<FileListResponse>} A promise that resolves with the list of files.
   */
  listFile: (folderPath, isRecursive = false) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "fsEvent",
        "action": "fileList",
        message: {
          folderPath,
          isRecursive
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "fileListResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * @function listCodeDefinitionNames
   * @description Lists all code definition names in a given path.
   * @param {string} path - The path to search for code definitions.
   * @returns {Promise<{success: boolean, result: any}>} A promise that resolves with the list of code definition names.
   */
  listCodeDefinitionNames: path => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "fsEvent",
        "action": "listCodeDefinitionNames",
        "message": {
          path
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "listCodeDefinitionNamesResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * @function searchFiles
   * @description Searches files in a given path using a regex pattern.
   * @param {string} path - The path to search within.
   * @param {string} regex - The regex pattern to search for.
   * @param {string} filePattern - The file pattern to match files.
   * @returns {Promise<{success: boolean, result: any}>} A promise that resolves with the search results.
   */
  searchFiles: (path, regex, filePattern) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "fsEvent",
        "action": "searchFiles",
        "message": {
          path,
          regex,
          filePattern
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "searchFilesResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * @function writeToFile
   * @description Writes content to a file.
   * @param {string} relPath - The relative path of the file to write to.
   * @param {string} newContent - The new content to write into the file.
   * @returns {Promise<{success: boolean, result: any}>} A promise that resolves with the write operation result.
   */
  writeToFile: (relPath, newContent) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "fsEvent",
        "action": "writeToFile",
        "message": {
          relPath,
          newContent
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "writeToFileResponse") {
          resolve(response);
        }
      });
    });
  }
};
exports["default"] = cbfs;

/***/ }),

/***/ 2455:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const websocket_1 = __importDefault(__webpack_require__(6900));
/**
 * A service for interacting with Git operations via WebSocket messages.
 */
const gitService = {
  /**
   * Initializes a new Git repository at the given path.
   * @param {string} path - The file system path where the Git repository should be initialized.
   * @returns {Promise<any>} A promise that resolves with the response from the init event.
   */
  init: async path => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "gitEvent",
        "action": "Init",
        "path": path
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "InitResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Clones a Git repository from the given URL to the specified path.
   * @param {string} url - The URL of the Git repository to clone.
   * @param {string} path - The file system path where the repository should be cloned to.
   * @returns {Promise<any>} A promise that resolves with the response from the clone event.
   */
  clone: async (url, path) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "gitEvent",
        "action": "Clone",
        "url": url,
        "path": path
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "CloneResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Pulls the latest changes from the remote repository to the local repository at the given path.
   * @param {string} path - The file system path of the local Git repository.
   * @returns {Promise<any>} A promise that resolves with the response from the pull event.
   */
  pull: async path => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "gitEvent",
        "action": "Pull",
        "path": path
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "PullResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Pushes local repository changes to the remote repository at the given path.
   * @param {string} path - The file system path of the local Git repository.
   * @returns {Promise<any>} A promise that resolves with the response from the push event.
   */
  push: async path => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "gitEvent",
        "action": "Push",
        "path": path
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "PushResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Retrieves the status of the local repository at the given path.
   * @param {string} path - The file system path of the local Git repository.
   * @returns {Promise<any>} A promise that resolves with the response from the status event.
   */
  status: async path => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "gitEvent",
        "action": "Status",
        "path": path
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "StatusResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Adds changes in the local repository to the staging area at the given path.
   * @param {string} path - The file system path of the local Git repository.
   * @returns {Promise<any>} A promise that resolves with the response from the add event.
   */
  add: async path => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "gitEvent",
        "action": "Add",
        "path": path
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "AddResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Commits the staged changes in the local repository with the given commit message.
   * @param {string} message - The commit message to use for the commit.
   * @returns {Promise<any>} A promise that resolves with the response from the commit event.
   */
  commit: async message => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "gitEvent",
        "action": "Commit",
        "message": message
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "gitCommitResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Checks out a branch or commit in the local repository at the given path.
   * @param {string} path - The file system path of the local Git repository.
   * @param {string} branch - The name of the branch or commit to check out.
   * @returns {Promise<any>} A promise that resolves with the response from the checkout event.
   */
  checkout: async (path, branch) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "gitEvent",
        "action": "Checkout",
        "path": path,
        "branch": branch
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "CheckoutResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Creates a new branch in the local repository at the given path.
   * @param {string} path - The file system path of the local Git repository.
   * @param {string} branch - The name of the new branch to create.
   * @returns {Promise<any>} A promise that resolves with the response from the branch event.
   */
  branch: async (path, branch) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "gitEvent",
        "action": "Branch",
        "path": path,
        "branch": branch
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "BranchResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Retrieves the commit logs for the local repository at the given path.
   * @param {string} path - The file system path of the local Git repository.
   * @returns {Promise<any>} A promise that resolves with the response from the logs event.
   */
  logs: async path => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "gitEvent",
        "action": "Logs",
        "path": path
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "LogsResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Retrieves the diff of changes for a specific commit in the local repository.
   * @param {string} commitHash - The hash of the commit to retrieve the diff for.
   * @param {string} path - The file system path of the local Git repository.
   * @returns {Promise<any>} A promise that resolves with the response from the diff event.
   */
  diff: async (commitHash, path) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "gitEvent",
        "action": "Diff",
        "path": path,
        "commitHash": commitHash
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "DiffResponse") {
          resolve(response);
        }
      });
    });
  }
};
exports["default"] = gitService;

/***/ }),

/***/ 7103:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.chatSummary = exports.logType = void 0;
const websocket_1 = __importDefault(__webpack_require__(6900));
var logType;
(function (logType) {
  logType["info"] = "info";
  logType["error"] = "error";
  logType["warning"] = "warning";
})(logType || (exports.logType = logType = {}));
exports.chatSummary = {
  summarizeAll: () => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "chatSummaryEvent",
        "action": "summarizeAll"
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "getSummarizeAllResponse") {
          resolve(response.payload); // Resolve the Promise with the response data
        }
      });
    });
  },
  summarize: (messages, depth) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "chatSummaryEvent",
        "action": "summarize",
        messages,
        depth
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "getSummarizeResponse") {
          resolve(response.payload); // Resolve the Promise with the response data
        }
      });
    });
  }
};
exports["default"] = exports.chatSummary;

/***/ }),

/***/ 1219:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const cbKnowledge = {
  // Methods related to knowledge handling can be added here
};
exports["default"] = cbKnowledge;

/***/ }),

/***/ 5500:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const websocket_1 = __importDefault(__webpack_require__(6900));
/**
 * A module for interacting with language learning models (LLMs) via WebSocket.
 */
const cbllm = {
  /**
   * Sends an inference request to the LLM and returns the model's response.
   * The model is selected based on the provided `llmrole`. If the specific model
   * for the role is not found, it falls back to the default model for the current agent,
   * and ultimately to the default application-wide LLM if necessary.
   *
   * @param {string} message - The input message or prompt to be sent to the LLM.
   * @param {string} llmrole - The role of the LLM to determine which model to use.
   * @returns {Promise<LLMResponse>} A promise that resolves with the LLM's response.
   */
  inference: async (message, llmrole) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "inference",
        "message": {
          prompt: message,
          llmrole
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "llmResponse") {
          resolve(response); // Resolve the Promise with the response data
        }
      });
    });
  }
};
exports["default"] = cbllm;

/***/ }),

/***/ 2944:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
/**
 * A module for parsing output messages to identify errors and warnings.
 */
const cboutputparsers = {
  /**
   * Initializes the output parser module.
   * Currently, this function does not perform any operations.
   * @param {any} output - The output to be initialized.
   */
  init: output => {
    // Initialization code can be added here if necessary
  },
  /**
   * Parses the given output and returns all the error messages.
   * @param {any} output - The output to parse for error messages.
   * @returns {string[]} An array of error messages.
   */
  parseErrors: output => {
    return output.split('\n').filter(line => line.includes('Error:'));
  },
  /**
   * Parses the given output and returns all the warning messages.
   * @param {any} output - The output to parse for warning messages.
   * @returns {string[]} An array of warning messages.
   */
  parseWarnings: output => {
    return output.split('\n').filter(line => line.includes('Warning:'));
  }
};
exports["default"] = cboutputparsers;

/***/ }),

/***/ 4742:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const websocket_1 = __importDefault(__webpack_require__(6900));
/**
 * A module for interacting with project settings and paths.
 */
const cbproject = {
  /**
   * Placeholder for a method to get project settings.
   * Currently, this method does not perform any operations.
   * @param {any} output - The output where project settings would be stored.
   */
  getProjectSettings: output => {
    // Implementation for getting project settings will be added here
  },
  /**
   * Retrieves the path of the current project.
   * @returns {Promise<GetProjectPathResponse>} A promise that resolves with the project path response.
   */
  getProjectPath: () => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "settingEvent",
        "action": "getProjectPath"
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "getProjectPathResponse") {
          resolve(response);
        }
      });
    });
  },
  getRepoMap: message => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "settingEvent",
        "action": "getRepoMap",
        message
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "getRepoMapResponse") {
          resolve(response);
        }
      });
    });
  },
  runProject: () => {
    websocket_1.default.getWebsocket.send(JSON.stringify({
      "type": "runProject"
    }));
  }
};
exports["default"] = cbproject;

/***/ }),

/***/ 8049:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
/**
 * A module for managing files within the CodeBolt File System.
 */
const cbrag = {
  /**
   * Initializes the CodeBolt File System Module.
   */
  init: () => {
    console.log("Initializing CodeBolt File System Module");
  },
  /**
   * Adds a file to the CodeBolt File System.
   * @param {string} filename - The name of the file to add.
   * @param {string} file_path - The path where the file should be added.
   */
  add_file: (filename, file_path) => {
    // Implementation for adding a file will be added here
  },
  /**
   * Retrieves related knowledge for a given query and filename.
   * @param {string} query - The query to retrieve related knowledge for.
   * @param {string} filename - The name of the file associated with the query.
   */
  retrieve_related_knowledge: (query, filename) => {
    // Implementation for retrieving related knowledge will be added here
  }
};
exports["default"] = cbrag;

/***/ }),

/***/ 7899:
/***/ ((__unused_webpack_module, exports) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
/**
 * A module for handling search operations.
 */
const cbsearch = {
  /**
   * Initializes the search module with the specified search engine.
   * @param {string} [engine="bing"] - The search engine to use for initializing the module.
   */
  init: (engine = "bing") => {
    console.log("Initializing Search Module with engine: " + engine);
  },
  /**
   * Performs a search operation for the given query.
   * @param {string} query - The search query.
   * @returns {Promise<string>} A promise that resolves with the search results.
   */
  search: async query => {
    console.log("Searching for " + query);
    return new Promise((resolve, reject) => {
      resolve("Search Results for " + query);
    });
  },
  /**
   * Retrieves the first link from the search results for the given query.
   * @param {string} query - The search query.
   * @returns {Promise<string>} A promise that resolves with the first link of the search results.
   */
  get_first_link: async query => {
    console.log("Getting first link for " + query);
    return new Promise((resolve, reject) => {
      resolve("First Link for " + query);
    });
  }
};
exports["default"] = cbsearch;

/***/ }),

/***/ 6902:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const websocket_1 = __importDefault(__webpack_require__(6900));
const cbstate = {
  /**
   * Retrieves the current application state from the server via WebSocket.
   * @returns {Promise<ApplicationState>} A promise that resolves with the application state.
   */
  getApplicationState: async () => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "getAppState"
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "getAppStateResponse") {
          resolve(response); // Resolve the Promise with the response data
        }
      });
    });
  },
  /**
   * Adds a key-value pair to the agent's state on the server via WebSocket.
   * @param {string} key - The key to add to the agent's state.
   * @param {string} value - The value associated with the key.
   * @returns {Promise<AddToAgentStateResponse>} A promise that resolves with the response to the addition request.
   */
  addToAgentState: async (key, value) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "agentStateEvent",
        "action": "addToAgentState",
        payload: {
          key,
          value
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "addToAgentStateResponse") {
          resolve(response); // Resolve the Promise with the response data
        }
      });
    });
  },
  /**
   * Retrieves the current state of the agent from the server via WebSocket.
   * @returns {Promise<GetAgentStateResponse>} A promise that resolves with the agent's state.
   */
  getAgentState: async () => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "agentStateEvent",
        "action": "getAgentState"
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "getAgentStateResponse") {
          resolve(response); // Resolve the Promise with the response data
        }
      });
    });
  }
};
exports["default"] = cbstate;

/***/ }),

/***/ 9086:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const websocket_1 = __importDefault(__webpack_require__(6900));
// import {AddTaskResponse,GetTasksResponse,UpdateTasksResponse } from '@codebolt/types';
/**
 * Manages task operations via WebSocket communication.
 */
const taskplaner = {
  /**
   * Adds a task using a WebSocket message.
   * @param {string} task - The task to be added.
   * @returns {Promise<AddTaskResponse>} A promise that resolves with the response from the add task event.
   */
  addTask: async task => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "taskEvent",
        "action": "addTask",
        message: {
          "task": task
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "addTaskResponse") {
          resolve(response); // Resolve the promise with the response data from adding the task
        }
      });
    });
  },
  /**
   * Retrieves all tasks using a WebSocket message.
   * @returns {Promise<GetTasksResponse>} A promise that resolves with the response from the get tasks event.
   */
  getTasks: async () => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "taskEvent",
        "action": "getTasks"
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "getTasksResponse") {
          resolve(response); // Resolve the promise with the response data from retrieving tasks
        }
      });
    });
  },
  /**
   * Updates an existing task using a WebSocket message.
   * @param {string} task - The updated task information.
   * @returns {Promise<UpdateTasksResponse>} A promise that resolves with the response from the update task event.
   */
  updateTask: async task => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "taskEvent",
        "action": "updateTask",
        message: {
          "task": task
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "updateTaskResponse") {
          resolve(response); // Resolve the promise with the response data from updating the task
        }
      });
    });
  }
};
exports["default"] = taskplaner;

/***/ }),

/***/ 8015:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const websocket_1 = __importDefault(__webpack_require__(6900));
const events_1 = __webpack_require__(4434);
/**
 * CustomEventEmitter class that extends the Node.js EventEmitter class.
 */
class CustomEventEmitter extends events_1.EventEmitter {}
/**
 * A module for executing commands in a terminal-like environment via WebSocket.
 */
const cbterminal = {
  eventEmitter: new CustomEventEmitter(),
  /**
   * Executes a given command and returns the result.
   * Listens for messages from the WebSocket that indicate the output, error, or finish state
   * of the executed command and resolves the promise accordingly.
   *
   * @param {string} command - The command to be executed.
   * @returns {Promise<CommandOutput|CommandError>} A promise that resolves with the command's output, error, or finish signal.
   */
  executeCommand: async (command, returnEmptyStringOnSuccess = false) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "executeCommand",
        "message": command,
        returnEmptyStringOnSuccess
      }));
      let result = "";
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "commandError" || response.type === "commandFinish") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Executes a given command and keeps running until an error occurs.
   * Listens for messages from the WebSocket and resolves the promise when an error is encountered.
   *
   * @param {string} command - The command to be executed.
   * @returns {Promise<CommandError>} A promise that resolves when an error occurs during command execution.
   */
  executeCommandRunUntilError: async (command, executeInMain = false) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "executeCommandRunUntilError",
        "message": command,
        executeInMain
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "commandError") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Sends a manual interrupt signal to the terminal.
   *
   * @returns {Promise<TerminalInterruptResponse>}
   */
  sendManualInterrupt() {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "sendInterruptToTerminal"
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "terminalInterrupted") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Executes a given command and streams the output.
   * Listens for messages from the WebSocket and streams the output data.
   *
   * @param {string} command - The command to be executed.
   * @returns {EventEmitter} A promise that streams the output data during command execution.
   */
  executeCommandWithStream(command, executeInMain = false) {
    // Send the process started message
    websocket_1.default.getWebsocket.send(JSON.stringify({
      "type": "executeCommandWithStream",
      "message": command,
      executeInMain
    }));
    // Register event listener for WebSocket messages
    websocket_1.default.getWebsocket.on('message', data => {
      const response = JSON.parse(data);
      console.log("Received message:", response);
      if (response.type === "commandOutput" || response.type === "commandError" || response.type === "commandFinish") {
        this.eventEmitter.emit(response.type, response);
      }
    });
    // Return an object that includes the event emitter and the stopProcess method
    return this.eventEmitter;
  }
};
exports["default"] = cbterminal;

/***/ }),

/***/ 6654:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const websocket_1 = __importDefault(__webpack_require__(6900));
/**
 * Tokenizer module for handling token-related operations.
 */
const tokenizer = {
  /**
   * Adds a token to the system via WebSocket.
   * @param {string} key - The key associated with the token to be added.
   * @returns {Promise<AddTokenResponse>} A promise that resolves with the response from the add token event.
   */
  addToken: async key => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "tokenizerEvent",
        "action": "addToken",
        "message": {
          item: key
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "addTokenResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Retrieves a token from the system via WebSocket.
   * @param {string} key - The key associated with the token to be retrieved.
   * @returns {Promise<GetTokenResponse>} A promise that resolves with the response from the get token event.
   */
  getToken: async key => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "tokenizerEvent",
        "action": "getToken",
        "message": {
          item: key
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "getTokenResponse") {
          resolve(response);
        }
      });
    });
  }
};
exports["default"] = tokenizer;

/***/ }),

/***/ 1242:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const websocket_1 = __importDefault(__webpack_require__(6900));
const VectorDB = {
  /**
   * Retrieves a vector from the vector database based on the provided key.
   *
   * @param {string} key - The key of the vector to retrieve.
   * @returns {Promise<GetVectorResponse>} A promise that resolves with the retrieved vector.
   */
  getVector: async key => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "vectordbEvent",
        "action": "getVector",
        "message": {
          item: key
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "getVectorResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Adds a new vector item to the vector database.
   *
    * @param {any} item - The item to add to the vector.
   * @returns {Promise<AddVectorItemResponse>} A promise that resolves when the item is successfully added.
   */
  addVectorItem: async item => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "vectordbEvent",
        "action": "addVectorItem",
        "message": {
          item: item
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "addVectorItemResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Queries a vector item from the vector database based on the provided key.
   *
   * @param {string} key - The key of the vector to query the item from.
   * @returns {Promise<QueryVectorItemResponse>} A promise that resolves with the queried vector item.
   */
  queryVectorItem: async key => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "vectordbEvent",
        "action": "queryVectorItem",
        "message": {
          item: key
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "qeryVectorItemResponse") {
          resolve(response);
        }
      });
    });
  },
  /**
   * Queries a vector item from the vector database based on the provided key.
   *
   * @param {string} key - The key of the vector to query the item from.
   * @returns {Promise<QueryVectorItemResponse>} A promise that resolves with the queried vector item.
   */
  queryVectorItems: async (items, dbPath) => {
    return new Promise((resolve, reject) => {
      websocket_1.default.getWebsocket.send(JSON.stringify({
        "type": "vectordbEvent",
        "action": "queryVectorItems",
        "message": {
          items,
          dbPath
        }
      }));
      websocket_1.default.getWebsocket.on('message', data => {
        const response = JSON.parse(data);
        if (response.type === "qeryVectorItemsResponse") {
          resolve(response);
        }
      });
    });
  }
};
exports["default"] = VectorDB;

/***/ }),

/***/ 6900:
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {

"use strict";


var __importDefault = this && this.__importDefault || function (mod) {
  return mod && mod.__esModule ? mod : {
    "default": mod
  };
};
Object.defineProperty(exports, "__esModule", ({
  value: true
}));
const ws_1 = __importDefault(__webpack_require__(1085));
const fs_1 = __importDefault(__webpack_require__(9896));
const js_yaml_1 = __importDefault(__webpack_require__(8768));
/**
 * Class representing a WebSocket connection.
 */
class cbws {
  /**
   * Constructs a new cbws instance and initializes the WebSocket connection.
   */
  constructor() {
    const uniqueConnectionId = this.getUniqueConnectionId();
    const initialMessage = this.getInitialMessage();
    console.log(uniqueConnectionId);
    this.websocket = new ws_1.default(`ws://localhost:${process.env.SOCKET_PORT}/codebolt?id=${uniqueConnectionId}`);
    this.initializeWebSocket(initialMessage).catch(error => {
      console.error("WebSocket connection failed:", error);
    });
  }
  getUniqueConnectionId() {
    try {
      let fileContents = fs_1.default.readFileSync('./codeboltagent.yaml', 'utf8');
      let data = js_yaml_1.default.load(fileContents);
      return data.unique_connectionid;
    } catch (e) {
      console.error('Unable to locate codeboltagent.yaml file.');
      return '';
    }
  }
  getInitialMessage() {
    try {
      let fileContents = fs_1.default.readFileSync('./codeboltagent.yaml', 'utf8');
      let data = js_yaml_1.default.load(fileContents);
      return data.initial_message;
    } catch (e) {
      console.error('Unable to locate codeboltagent.yaml file.');
      return '';
    }
  }
  /**
   * Initializes the WebSocket by setting up event listeners and returning a promise that resolves
   * when the WebSocket connection is successfully opened.
   * @returns {Promise<WebSocket>} A promise that resolves with the WebSocket instance.
   */
  async initializeWebSocket(initialMessage) {
    return new Promise((resolve, reject) => {
      this.websocket.on('error', error => {
        console.log('WebSocket error:', error);
        reject(error);
      });
      this.websocket.on('open', () => {
        console.log('WebSocket connected');
        // if (this.websocket) {
        //     this.websocket.send(JSON.stringify({
        //         "type": "sendMessage",
        //         "message": initialMessage
        //     }));
        //     resolve(this.websocket);
        // }
      });
      this.websocket.on('message', data => {
        // Handle incoming WebSocket messages here.
        // console.log('WebSocket message received:', data);
      });
    });
  }
  /**
   * Getter for the WebSocket instance. Throws an error if the WebSocket is not open.
   * @returns {WebSocket} The WebSocket instance.
   * @throws {Error} If the WebSocket is not open.
   */
  get getWebsocket() {
    if (!this.websocket.OPEN) {
      throw new Error('WebSocket is not open');
    } else {
      return this.websocket;
    }
  }
}
exports["default"] = new cbws();

/***/ }),

/***/ 7539:
/***/ ((module) => {

"use strict";


/**
 * Masks a buffer using the given mask.
 *
 * @param {Buffer} source The buffer to mask
 * @param {Buffer} mask The mask to use
 * @param {Buffer} output The buffer where to store the result
 * @param {Number} offset The offset at which to start writing
 * @param {Number} length The number of bytes to mask.
 * @public
 */
const mask = (source, mask, output, offset, length) => {
  for (var i = 0; i < length; i++) {
    output[offset + i] = source[i] ^ mask[i & 3];
  }
};

/**
 * Unmasks a buffer using the given mask.
 *
 * @param {Buffer} buffer The buffer to unmask
 * @param {Buffer} mask The mask to use
 * @public
 */
const unmask = (buffer, mask) => {
  // Required until https://github.com/nodejs/node/issues/9006 is resolved.
  const length = buffer.length;
  for (var i = 0; i < length; i++) {
    buffer[i] ^= mask[i & 3];
  }
};
module.exports = {
  mask,
  unmask
};

/***/ }),

/***/ 7893:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


try {
  module.exports = __webpack_require__(6291)(__dirname);
} catch (e) {
  module.exports = __webpack_require__(7539);
}

/***/ }),

/***/ 8768:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


var loader = __webpack_require__(6177);
var dumper = __webpack_require__(2127);
function renamed(from, to) {
  return function () {
    throw new Error('Function yaml.' + from + ' is removed in js-yaml 4. ' + 'Use yaml.' + to + ' instead, which is now safe by default.');
  };
}
module.exports.Type = __webpack_require__(666);
module.exports.Schema = __webpack_require__(13);
module.exports.FAILSAFE_SCHEMA = __webpack_require__(4769);
module.exports.JSON_SCHEMA = __webpack_require__(1006);
module.exports.CORE_SCHEMA = __webpack_require__(9403);
module.exports.DEFAULT_SCHEMA = __webpack_require__(9631);
module.exports.load = loader.load;
module.exports.loadAll = loader.loadAll;
module.exports.dump = dumper.dump;
module.exports.YAMLException = __webpack_require__(9661);

// Re-export all types in case user wants to create custom schema
module.exports.types = {
  binary: __webpack_require__(7320),
  float: __webpack_require__(9791),
  map: __webpack_require__(2955),
  null: __webpack_require__(5888),
  pairs: __webpack_require__(4792),
  set: __webpack_require__(3797),
  timestamp: __webpack_require__(6453),
  bool: __webpack_require__(4777),
  int: __webpack_require__(5488),
  merge: __webpack_require__(1997),
  omap: __webpack_require__(9564),
  seq: __webpack_require__(7322),
  str: __webpack_require__(5022)
};

// Removed functions from JS-YAML 3.0.x
module.exports.safeLoad = renamed('safeLoad', 'load');
module.exports.safeLoadAll = renamed('safeLoadAll', 'loadAll');
module.exports.safeDump = renamed('safeDump', 'dump');

/***/ }),

/***/ 8279:
/***/ ((module) => {

"use strict";


function isNothing(subject) {
  return typeof subject === 'undefined' || subject === null;
}
function isObject(subject) {
  return typeof subject === 'object' && subject !== null;
}
function toArray(sequence) {
  if (Array.isArray(sequence)) return sequence;else if (isNothing(sequence)) return [];
  return [sequence];
}
function extend(target, source) {
  var index, length, key, sourceKeys;
  if (source) {
    sourceKeys = Object.keys(source);
    for (index = 0, length = sourceKeys.length; index < length; index += 1) {
      key = sourceKeys[index];
      target[key] = source[key];
    }
  }
  return target;
}
function repeat(string, count) {
  var result = '',
    cycle;
  for (cycle = 0; cycle < count; cycle += 1) {
    result += string;
  }
  return result;
}
function isNegativeZero(number) {
  return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
}
module.exports.isNothing = isNothing;
module.exports.isObject = isObject;
module.exports.toArray = toArray;
module.exports.repeat = repeat;
module.exports.isNegativeZero = isNegativeZero;
module.exports.extend = extend;

/***/ }),

/***/ 2127:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


/*eslint-disable no-use-before-define*/
var common = __webpack_require__(8279);
var YAMLException = __webpack_require__(9661);
var DEFAULT_SCHEMA = __webpack_require__(9631);
var _toString = Object.prototype.toString;
var _hasOwnProperty = Object.prototype.hasOwnProperty;
var CHAR_BOM = 0xFEFF;
var CHAR_TAB = 0x09; /* Tab */
var CHAR_LINE_FEED = 0x0A; /* LF */
var CHAR_CARRIAGE_RETURN = 0x0D; /* CR */
var CHAR_SPACE = 0x20; /* Space */
var CHAR_EXCLAMATION = 0x21; /* ! */
var CHAR_DOUBLE_QUOTE = 0x22; /* " */
var CHAR_SHARP = 0x23; /* # */
var CHAR_PERCENT = 0x25; /* % */
var CHAR_AMPERSAND = 0x26; /* & */
var CHAR_SINGLE_QUOTE = 0x27; /* ' */
var CHAR_ASTERISK = 0x2A; /* * */
var CHAR_COMMA = 0x2C; /* , */
var CHAR_MINUS = 0x2D; /* - */
var CHAR_COLON = 0x3A; /* : */
var CHAR_EQUALS = 0x3D; /* = */
var CHAR_GREATER_THAN = 0x3E; /* > */
var CHAR_QUESTION = 0x3F; /* ? */
var CHAR_COMMERCIAL_AT = 0x40; /* @ */
var CHAR_LEFT_SQUARE_BRACKET = 0x5B; /* [ */
var CHAR_RIGHT_SQUARE_BRACKET = 0x5D; /* ] */
var CHAR_GRAVE_ACCENT = 0x60; /* ` */
var CHAR_LEFT_CURLY_BRACKET = 0x7B; /* { */
var CHAR_VERTICAL_LINE = 0x7C; /* | */
var CHAR_RIGHT_CURLY_BRACKET = 0x7D; /* } */

var ESCAPE_SEQUENCES = {};
ESCAPE_SEQUENCES[0x00] = '\\0';
ESCAPE_SEQUENCES[0x07] = '\\a';
ESCAPE_SEQUENCES[0x08] = '\\b';
ESCAPE_SEQUENCES[0x09] = '\\t';
ESCAPE_SEQUENCES[0x0A] = '\\n';
ESCAPE_SEQUENCES[0x0B] = '\\v';
ESCAPE_SEQUENCES[0x0C] = '\\f';
ESCAPE_SEQUENCES[0x0D] = '\\r';
ESCAPE_SEQUENCES[0x1B] = '\\e';
ESCAPE_SEQUENCES[0x22] = '\\"';
ESCAPE_SEQUENCES[0x5C] = '\\\\';
ESCAPE_SEQUENCES[0x85] = '\\N';
ESCAPE_SEQUENCES[0xA0] = '\\_';
ESCAPE_SEQUENCES[0x2028] = '\\L';
ESCAPE_SEQUENCES[0x2029] = '\\P';
var DEPRECATED_BOOLEANS_SYNTAX = ['y', 'Y', 'yes', 'Yes', 'YES', 'on', 'On', 'ON', 'n', 'N', 'no', 'No', 'NO', 'off', 'Off', 'OFF'];
var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
function compileStyleMap(schema, map) {
  var result, keys, index, length, tag, style, type;
  if (map === null) return {};
  result = {};
  keys = Object.keys(map);
  for (index = 0, length = keys.length; index < length; index += 1) {
    tag = keys[index];
    style = String(map[tag]);
    if (tag.slice(0, 2) === '!!') {
      tag = 'tag:yaml.org,2002:' + tag.slice(2);
    }
    type = schema.compiledTypeMap['fallback'][tag];
    if (type && _hasOwnProperty.call(type.styleAliases, style)) {
      style = type.styleAliases[style];
    }
    result[tag] = style;
  }
  return result;
}
function encodeHex(character) {
  var string, handle, length;
  string = character.toString(16).toUpperCase();
  if (character <= 0xFF) {
    handle = 'x';
    length = 2;
  } else if (character <= 0xFFFF) {
    handle = 'u';
    length = 4;
  } else if (character <= 0xFFFFFFFF) {
    handle = 'U';
    length = 8;
  } else {
    throw new YAMLException('code point within a string may not be greater than 0xFFFFFFFF');
  }
  return '\\' + handle + common.repeat('0', length - string.length) + string;
}
var QUOTING_TYPE_SINGLE = 1,
  QUOTING_TYPE_DOUBLE = 2;
function State(options) {
  this.schema = options['schema'] || DEFAULT_SCHEMA;
  this.indent = Math.max(1, options['indent'] || 2);
  this.noArrayIndent = options['noArrayIndent'] || false;
  this.skipInvalid = options['skipInvalid'] || false;
  this.flowLevel = common.isNothing(options['flowLevel']) ? -1 : options['flowLevel'];
  this.styleMap = compileStyleMap(this.schema, options['styles'] || null);
  this.sortKeys = options['sortKeys'] || false;
  this.lineWidth = options['lineWidth'] || 80;
  this.noRefs = options['noRefs'] || false;
  this.noCompatMode = options['noCompatMode'] || false;
  this.condenseFlow = options['condenseFlow'] || false;
  this.quotingType = options['quotingType'] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
  this.forceQuotes = options['forceQuotes'] || false;
  this.replacer = typeof options['replacer'] === 'function' ? options['replacer'] : null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.explicitTypes = this.schema.compiledExplicit;
  this.tag = null;
  this.result = '';
  this.duplicates = [];
  this.usedDuplicates = null;
}

// Indents every line in a string. Empty lines (\n only) are not indented.
function indentString(string, spaces) {
  var ind = common.repeat(' ', spaces),
    position = 0,
    next = -1,
    result = '',
    line,
    length = string.length;
  while (position < length) {
    next = string.indexOf('\n', position);
    if (next === -1) {
      line = string.slice(position);
      position = length;
    } else {
      line = string.slice(position, next + 1);
      position = next + 1;
    }
    if (line.length && line !== '\n') result += ind;
    result += line;
  }
  return result;
}
function generateNextLine(state, level) {
  return '\n' + common.repeat(' ', state.indent * level);
}
function testImplicitResolving(state, str) {
  var index, length, type;
  for (index = 0, length = state.implicitTypes.length; index < length; index += 1) {
    type = state.implicitTypes[index];
    if (type.resolve(str)) {
      return true;
    }
  }
  return false;
}

// [33] s-white ::= s-space | s-tab
function isWhitespace(c) {
  return c === CHAR_SPACE || c === CHAR_TAB;
}

// Returns true if the character can be printed without escaping.
// From YAML 1.2: "any allowed characters known to be non-printable
// should also be escaped. [However,] This isn’t mandatory"
// Derived from nb-char - \t - #x85 - #xA0 - #x2028 - #x2029.
function isPrintable(c) {
  return 0x00020 <= c && c <= 0x00007E || 0x000A1 <= c && c <= 0x00D7FF && c !== 0x2028 && c !== 0x2029 || 0x0E000 <= c && c <= 0x00FFFD && c !== CHAR_BOM || 0x10000 <= c && c <= 0x10FFFF;
}

// [34] ns-char ::= nb-char - s-white
// [27] nb-char ::= c-printable - b-char - c-byte-order-mark
// [26] b-char  ::= b-line-feed | b-carriage-return
// Including s-white (for some reason, examples doesn't match specs in this aspect)
// ns-char ::= c-printable - b-line-feed - b-carriage-return - c-byte-order-mark
function isNsCharOrWhitespace(c) {
  return isPrintable(c) && c !== CHAR_BOM
  // - b-char
  && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
}

// [127]  ns-plain-safe(c) ::= c = flow-out  ⇒ ns-plain-safe-out
//                             c = flow-in   ⇒ ns-plain-safe-in
//                             c = block-key ⇒ ns-plain-safe-out
//                             c = flow-key  ⇒ ns-plain-safe-in
// [128] ns-plain-safe-out ::= ns-char
// [129]  ns-plain-safe-in ::= ns-char - c-flow-indicator
// [130]  ns-plain-char(c) ::=  ( ns-plain-safe(c) - “:” - “#” )
//                            | ( /* An ns-char preceding */ “#” )
//                            | ( “:” /* Followed by an ns-plain-safe(c) */ )
function isPlainSafe(c, prev, inblock) {
  var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
  var cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
  return (
  // ns-plain-safe
  inblock ?
  // c = flow-in
  cIsNsCharOrWhitespace : cIsNsCharOrWhitespace
  // - c-flow-indicator
  && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET

  // ns-plain-char
  ) && c !== CHAR_SHARP // false on '#'
  && !(prev === CHAR_COLON && !cIsNsChar) // false on ': '
  || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP // change to true on '[^ ]#'
  || prev === CHAR_COLON && cIsNsChar; // change to true on ':[^ ]'
}

// Simplified test for values allowed as the first character in plain style.
function isPlainSafeFirst(c) {
  // Uses a subset of ns-char - c-indicator
  // where ns-char = nb-char - s-white.
  // No support of ( ( “?” | “:” | “-” ) /* Followed by an ns-plain-safe(c)) */ ) part
  return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) // - s-white
  // - (c-indicator ::=
  // “-” | “?” | “:” | “,” | “[” | “]” | “{” | “}”
  && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET
  // | “#” | “&” | “*” | “!” | “|” | “=” | “>” | “'” | “"”
  && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE
  // | “%” | “@” | “`”)
  && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
}

// Simplified test for values allowed as the last character in plain style.
function isPlainSafeLast(c) {
  // just not whitespace or colon, it will be checked to be plain character later
  return !isWhitespace(c) && c !== CHAR_COLON;
}

// Same as 'string'.codePointAt(pos), but works in older browsers.
function codePointAt(string, pos) {
  var first = string.charCodeAt(pos),
    second;
  if (first >= 0xD800 && first <= 0xDBFF && pos + 1 < string.length) {
    second = string.charCodeAt(pos + 1);
    if (second >= 0xDC00 && second <= 0xDFFF) {
      // https://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae
      return (first - 0xD800) * 0x400 + second - 0xDC00 + 0x10000;
    }
  }
  return first;
}

// Determines whether block indentation indicator is required.
function needIndentIndicator(string) {
  var leadingSpaceRe = /^\n* /;
  return leadingSpaceRe.test(string);
}
var STYLE_PLAIN = 1,
  STYLE_SINGLE = 2,
  STYLE_LITERAL = 3,
  STYLE_FOLDED = 4,
  STYLE_DOUBLE = 5;

// Determines which scalar styles are possible and returns the preferred style.
// lineWidth = -1 => no limit.
// Pre-conditions: str.length > 0.
// Post-conditions:
//    STYLE_PLAIN or STYLE_SINGLE => no \n are in the string.
//    STYLE_LITERAL => no lines are suitable for folding (or lineWidth is -1).
//    STYLE_FOLDED => a line > lineWidth and can be folded (and lineWidth != -1).
function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
  var i;
  var char = 0;
  var prevChar = null;
  var hasLineBreak = false;
  var hasFoldableLine = false; // only checked if shouldTrackWidth
  var shouldTrackWidth = lineWidth !== -1;
  var previousLineBreak = -1; // count the first line correctly
  var plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
  if (singleLineOnly || forceQuotes) {
    // Case: no block styles.
    // Check for disallowed characters to rule out plain and single.
    for (i = 0; i < string.length; char >= 0x10000 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
  } else {
    // Case: block styles permitted.
    for (i = 0; i < string.length; char >= 0x10000 ? i += 2 : i++) {
      char = codePointAt(string, i);
      if (char === CHAR_LINE_FEED) {
        hasLineBreak = true;
        // Check if any line can be folded.
        if (shouldTrackWidth) {
          hasFoldableLine = hasFoldableLine ||
          // Foldable line = too long, and not more-indented.
          i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== ' ';
          previousLineBreak = i;
        }
      } else if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char, prevChar, inblock);
      prevChar = char;
    }
    // in case the end is missing a \n
    hasFoldableLine = hasFoldableLine || shouldTrackWidth && i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== ' ';
  }
  // Although every style can represent \n without escaping, prefer block styles
  // for multiline, since they're more readable and they don't add empty lines.
  // Also prefer folding a super-long line.
  if (!hasLineBreak && !hasFoldableLine) {
    // Strings interpretable as another type have to be quoted;
    // e.g. the string 'true' vs. the boolean true.
    if (plain && !forceQuotes && !testAmbiguousType(string)) {
      return STYLE_PLAIN;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  // Edge case: block indentation indicator can only have one digit.
  if (indentPerLevel > 9 && needIndentIndicator(string)) {
    return STYLE_DOUBLE;
  }
  // At this point we know block styles are valid.
  // Prefer literal style unless we want to fold.
  if (!forceQuotes) {
    return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
  }
  return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
}

// Note: line breaking/folding is implemented for only the folded style.
// NB. We drop the last trailing newline (if any) of a returned block scalar
//  since the dumper adds its own newline. This always works:
//    • No ending newline => unaffected; already using strip "-" chomping.
//    • Ending newline    => removed then restored.
//  Importantly, this keeps the "+" chomp indicator from gaining an extra line.
function writeScalar(state, string, level, iskey, inblock) {
  state.dump = function () {
    if (string.length === 0) {
      return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
    }
    if (!state.noCompatMode) {
      if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
      }
    }
    var indent = state.indent * Math.max(1, level); // no 0-indent scalars
    // As indentation gets deeper, let the width decrease monotonically
    // to the lower bound min(state.lineWidth, 40).
    // Note that this implies
    //  state.lineWidth ≤ 40 + state.indent: width is fixed at the lower bound.
    //  state.lineWidth > 40 + state.indent: width decreases until the lower bound.
    // This behaves better than a constant minimum width which disallows narrower options,
    // or an indent threshold which causes the width to suddenly increase.
    var lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);

    // Without knowing if keys are implicit/explicit, assume implicit for safety.
    var singleLineOnly = iskey
    // No block styles in flow mode.
    || state.flowLevel > -1 && level >= state.flowLevel;
    function testAmbiguity(string) {
      return testImplicitResolving(state, string);
    }
    switch (chooseScalarStyle(string, singleLineOnly, state.indent, lineWidth, testAmbiguity, state.quotingType, state.forceQuotes && !iskey, inblock)) {
      case STYLE_PLAIN:
        return string;
      case STYLE_SINGLE:
        return "'" + string.replace(/'/g, "''") + "'";
      case STYLE_LITERAL:
        return '|' + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
      case STYLE_FOLDED:
        return '>' + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
      case STYLE_DOUBLE:
        return '"' + escapeString(string, lineWidth) + '"';
      default:
        throw new YAMLException('impossible error: invalid scalar style');
    }
  }();
}

// Pre-conditions: string is valid for a block scalar, 1 <= indentPerLevel <= 9.
function blockHeader(string, indentPerLevel) {
  var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : '';

  // note the special case: the string '\n' counts as a "trailing" empty line.
  var clip = string[string.length - 1] === '\n';
  var keep = clip && (string[string.length - 2] === '\n' || string === '\n');
  var chomp = keep ? '+' : clip ? '' : '-';
  return indentIndicator + chomp + '\n';
}

// (See the note for writeScalar.)
function dropEndingNewline(string) {
  return string[string.length - 1] === '\n' ? string.slice(0, -1) : string;
}

// Note: a long line without a suitable break point will exceed the width limit.
// Pre-conditions: every char in str isPrintable, str.length > 0, width > 0.
function foldString(string, width) {
  // In folded style, $k$ consecutive newlines output as $k+1$ newlines—
  // unless they're before or after a more-indented line, or at the very
  // beginning or end, in which case $k$ maps to $k$.
  // Therefore, parse each chunk as newline(s) followed by a content line.
  var lineRe = /(\n+)([^\n]*)/g;

  // first line (possibly an empty line)
  var result = function () {
    var nextLF = string.indexOf('\n');
    nextLF = nextLF !== -1 ? nextLF : string.length;
    lineRe.lastIndex = nextLF;
    return foldLine(string.slice(0, nextLF), width);
  }();
  // If we haven't reached the first content line yet, don't add an extra \n.
  var prevMoreIndented = string[0] === '\n' || string[0] === ' ';
  var moreIndented;

  // rest of the lines
  var match;
  while (match = lineRe.exec(string)) {
    var prefix = match[1],
      line = match[2];
    moreIndented = line[0] === ' ';
    result += prefix + (!prevMoreIndented && !moreIndented && line !== '' ? '\n' : '') + foldLine(line, width);
    prevMoreIndented = moreIndented;
  }
  return result;
}

// Greedy line breaking.
// Picks the longest line under the limit each time,
// otherwise settles for the shortest line over the limit.
// NB. More-indented lines *cannot* be folded, as that would add an extra \n.
function foldLine(line, width) {
  if (line === '' || line[0] === ' ') return line;

  // Since a more-indented line adds a \n, breaks can't be followed by a space.
  var breakRe = / [^ ]/g; // note: the match index will always be <= length-2.
  var match;
  // start is an inclusive index. end, curr, and next are exclusive.
  var start = 0,
    end,
    curr = 0,
    next = 0;
  var result = '';

  // Invariants: 0 <= start <= length-1.
  //   0 <= curr <= next <= max(0, length-2). curr - start <= width.
  // Inside the loop:
  //   A match implies length >= 2, so curr and next are <= length-2.
  while (match = breakRe.exec(line)) {
    next = match.index;
    // maintain invariant: curr - start <= width
    if (next - start > width) {
      end = curr > start ? curr : next; // derive end <= length-2
      result += '\n' + line.slice(start, end);
      // skip the space that was output as \n
      start = end + 1; // derive start <= length-1
    }
    curr = next;
  }

  // By the invariants, start <= length-1, so there is something left over.
  // It is either the whole string or a part starting from non-whitespace.
  result += '\n';
  // Insert a break if the remainder is too long and there is a break available.
  if (line.length - start > width && curr > start) {
    result += line.slice(start, curr) + '\n' + line.slice(curr + 1);
  } else {
    result += line.slice(start);
  }
  return result.slice(1); // drop extra \n joiner
}

// Escapes a double-quoted string.
function escapeString(string) {
  var result = '';
  var char = 0;
  var escapeSeq;
  for (var i = 0; i < string.length; char >= 0x10000 ? i += 2 : i++) {
    char = codePointAt(string, i);
    escapeSeq = ESCAPE_SEQUENCES[char];
    if (!escapeSeq && isPrintable(char)) {
      result += string[i];
      if (char >= 0x10000) result += string[i + 1];
    } else {
      result += escapeSeq || encodeHex(char);
    }
  }
  return result;
}
function writeFlowSequence(state, level, object) {
  var _result = '',
    _tag = state.tag,
    index,
    length,
    value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }

    // Write only valid elements, put null instead of invalid elements.
    if (writeNode(state, level, value, false, false) || typeof value === 'undefined' && writeNode(state, level, null, false, false)) {
      if (_result !== '') _result += ',' + (!state.condenseFlow ? ' ' : '');
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = '[' + _result + ']';
}
function writeBlockSequence(state, level, object, compact) {
  var _result = '',
    _tag = state.tag,
    index,
    length,
    value;
  for (index = 0, length = object.length; index < length; index += 1) {
    value = object[index];
    if (state.replacer) {
      value = state.replacer.call(object, String(index), value);
    }

    // Write only valid elements, put null instead of invalid elements.
    if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === 'undefined' && writeNode(state, level + 1, null, true, true, false, true)) {
      if (!compact || _result !== '') {
        _result += generateNextLine(state, level);
      }
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        _result += '-';
      } else {
        _result += '- ';
      }
      _result += state.dump;
    }
  }
  state.tag = _tag;
  state.dump = _result || '[]'; // Empty sequence if no valid values.
}
function writeFlowMapping(state, level, object) {
  var _result = '',
    _tag = state.tag,
    objectKeyList = Object.keys(object),
    index,
    length,
    objectKey,
    objectValue,
    pairBuffer;
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = '';
    if (_result !== '') pairBuffer += ', ';
    if (state.condenseFlow) pairBuffer += '"';
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level, objectKey, false, false)) {
      continue; // Skip this pair because of invalid key;
    }
    if (state.dump.length > 1024) pairBuffer += '? ';
    pairBuffer += state.dump + (state.condenseFlow ? '"' : '') + ':' + (state.condenseFlow ? '' : ' ');
    if (!writeNode(state, level, objectValue, false, false)) {
      continue; // Skip this pair because of invalid value.
    }
    pairBuffer += state.dump;

    // Both key and value are valid.
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = '{' + _result + '}';
}
function writeBlockMapping(state, level, object, compact) {
  var _result = '',
    _tag = state.tag,
    objectKeyList = Object.keys(object),
    index,
    length,
    objectKey,
    objectValue,
    explicitPair,
    pairBuffer;

  // Allow sorting keys so that the output file is deterministic
  if (state.sortKeys === true) {
    // Default sorting
    objectKeyList.sort();
  } else if (typeof state.sortKeys === 'function') {
    // Custom sort function
    objectKeyList.sort(state.sortKeys);
  } else if (state.sortKeys) {
    // Something is wrong
    throw new YAMLException('sortKeys must be a boolean or a function');
  }
  for (index = 0, length = objectKeyList.length; index < length; index += 1) {
    pairBuffer = '';
    if (!compact || _result !== '') {
      pairBuffer += generateNextLine(state, level);
    }
    objectKey = objectKeyList[index];
    objectValue = object[objectKey];
    if (state.replacer) {
      objectValue = state.replacer.call(object, objectKey, objectValue);
    }
    if (!writeNode(state, level + 1, objectKey, true, true, true)) {
      continue; // Skip this pair because of invalid key.
    }
    explicitPair = state.tag !== null && state.tag !== '?' || state.dump && state.dump.length > 1024;
    if (explicitPair) {
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        pairBuffer += '?';
      } else {
        pairBuffer += '? ';
      }
    }
    pairBuffer += state.dump;
    if (explicitPair) {
      pairBuffer += generateNextLine(state, level);
    }
    if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
      continue; // Skip this pair because of invalid value.
    }
    if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
      pairBuffer += ':';
    } else {
      pairBuffer += ': ';
    }
    pairBuffer += state.dump;

    // Both key and value are valid.
    _result += pairBuffer;
  }
  state.tag = _tag;
  state.dump = _result || '{}'; // Empty mapping if no valid pairs.
}
function detectType(state, object, explicit) {
  var _result, typeList, index, length, type, style;
  typeList = explicit ? state.explicitTypes : state.implicitTypes;
  for (index = 0, length = typeList.length; index < length; index += 1) {
    type = typeList[index];
    if ((type.instanceOf || type.predicate) && (!type.instanceOf || typeof object === 'object' && object instanceof type.instanceOf) && (!type.predicate || type.predicate(object))) {
      if (explicit) {
        if (type.multi && type.representName) {
          state.tag = type.representName(object);
        } else {
          state.tag = type.tag;
        }
      } else {
        state.tag = '?';
      }
      if (type.represent) {
        style = state.styleMap[type.tag] || type.defaultStyle;
        if (_toString.call(type.represent) === '[object Function]') {
          _result = type.represent(object, style);
        } else if (_hasOwnProperty.call(type.represent, style)) {
          _result = type.represent[style](object, style);
        } else {
          throw new YAMLException('!<' + type.tag + '> tag resolver accepts not "' + style + '" style');
        }
        state.dump = _result;
      }
      return true;
    }
  }
  return false;
}

// Serializes `object` and writes it to global `result`.
// Returns true on success, or false on invalid object.
//
function writeNode(state, level, object, block, compact, iskey, isblockseq) {
  state.tag = null;
  state.dump = object;
  if (!detectType(state, object, false)) {
    detectType(state, object, true);
  }
  var type = _toString.call(state.dump);
  var inblock = block;
  var tagStr;
  if (block) {
    block = state.flowLevel < 0 || state.flowLevel > level;
  }
  var objectOrArray = type === '[object Object]' || type === '[object Array]',
    duplicateIndex,
    duplicate;
  if (objectOrArray) {
    duplicateIndex = state.duplicates.indexOf(object);
    duplicate = duplicateIndex !== -1;
  }
  if (state.tag !== null && state.tag !== '?' || duplicate || state.indent !== 2 && level > 0) {
    compact = false;
  }
  if (duplicate && state.usedDuplicates[duplicateIndex]) {
    state.dump = '*ref_' + duplicateIndex;
  } else {
    if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
      state.usedDuplicates[duplicateIndex] = true;
    }
    if (type === '[object Object]') {
      if (block && Object.keys(state.dump).length !== 0) {
        writeBlockMapping(state, level, state.dump, compact);
        if (duplicate) {
          state.dump = '&ref_' + duplicateIndex + state.dump;
        }
      } else {
        writeFlowMapping(state, level, state.dump);
        if (duplicate) {
          state.dump = '&ref_' + duplicateIndex + ' ' + state.dump;
        }
      }
    } else if (type === '[object Array]') {
      if (block && state.dump.length !== 0) {
        if (state.noArrayIndent && !isblockseq && level > 0) {
          writeBlockSequence(state, level - 1, state.dump, compact);
        } else {
          writeBlockSequence(state, level, state.dump, compact);
        }
        if (duplicate) {
          state.dump = '&ref_' + duplicateIndex + state.dump;
        }
      } else {
        writeFlowSequence(state, level, state.dump);
        if (duplicate) {
          state.dump = '&ref_' + duplicateIndex + ' ' + state.dump;
        }
      }
    } else if (type === '[object String]') {
      if (state.tag !== '?') {
        writeScalar(state, state.dump, level, iskey, inblock);
      }
    } else if (type === '[object Undefined]') {
      return false;
    } else {
      if (state.skipInvalid) return false;
      throw new YAMLException('unacceptable kind of an object to dump ' + type);
    }
    if (state.tag !== null && state.tag !== '?') {
      // Need to encode all characters except those allowed by the spec:
      //
      // [35] ns-dec-digit    ::=  [#x30-#x39] /* 0-9 */
      // [36] ns-hex-digit    ::=  ns-dec-digit
      //                         | [#x41-#x46] /* A-F */ | [#x61-#x66] /* a-f */
      // [37] ns-ascii-letter ::=  [#x41-#x5A] /* A-Z */ | [#x61-#x7A] /* a-z */
      // [38] ns-word-char    ::=  ns-dec-digit | ns-ascii-letter | “-”
      // [39] ns-uri-char     ::=  “%” ns-hex-digit ns-hex-digit | ns-word-char | “#”
      //                         | “;” | “/” | “?” | “:” | “@” | “&” | “=” | “+” | “$” | “,”
      //                         | “_” | “.” | “!” | “~” | “*” | “'” | “(” | “)” | “[” | “]”
      //
      // Also need to encode '!' because it has special meaning (end of tag prefix).
      //
      tagStr = encodeURI(state.tag[0] === '!' ? state.tag.slice(1) : state.tag).replace(/!/g, '%21');
      if (state.tag[0] === '!') {
        tagStr = '!' + tagStr;
      } else if (tagStr.slice(0, 18) === 'tag:yaml.org,2002:') {
        tagStr = '!!' + tagStr.slice(18);
      } else {
        tagStr = '!<' + tagStr + '>';
      }
      state.dump = tagStr + ' ' + state.dump;
    }
  }
  return true;
}
function getDuplicateReferences(object, state) {
  var objects = [],
    duplicatesIndexes = [],
    index,
    length;
  inspectNode(object, objects, duplicatesIndexes);
  for (index = 0, length = duplicatesIndexes.length; index < length; index += 1) {
    state.duplicates.push(objects[duplicatesIndexes[index]]);
  }
  state.usedDuplicates = new Array(length);
}
function inspectNode(object, objects, duplicatesIndexes) {
  var objectKeyList, index, length;
  if (object !== null && typeof object === 'object') {
    index = objects.indexOf(object);
    if (index !== -1) {
      if (duplicatesIndexes.indexOf(index) === -1) {
        duplicatesIndexes.push(index);
      }
    } else {
      objects.push(object);
      if (Array.isArray(object)) {
        for (index = 0, length = object.length; index < length; index += 1) {
          inspectNode(object[index], objects, duplicatesIndexes);
        }
      } else {
        objectKeyList = Object.keys(object);
        for (index = 0, length = objectKeyList.length; index < length; index += 1) {
          inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
        }
      }
    }
  }
}
function dump(input, options) {
  options = options || {};
  var state = new State(options);
  if (!state.noRefs) getDuplicateReferences(input, state);
  var value = input;
  if (state.replacer) {
    value = state.replacer.call({
      '': value
    }, '', value);
  }
  if (writeNode(state, 0, value, true, true)) return state.dump + '\n';
  return '';
}
module.exports.dump = dump;

/***/ }),

/***/ 9661:
/***/ ((module) => {

"use strict";
// YAML error class. http://stackoverflow.com/questions/8458984
//


function formatError(exception, compact) {
  var where = '',
    message = exception.reason || '(unknown reason)';
  if (!exception.mark) return message;
  if (exception.mark.name) {
    where += 'in "' + exception.mark.name + '" ';
  }
  where += '(' + (exception.mark.line + 1) + ':' + (exception.mark.column + 1) + ')';
  if (!compact && exception.mark.snippet) {
    where += '\n\n' + exception.mark.snippet;
  }
  return message + ' ' + where;
}
function YAMLException(reason, mark) {
  // Super constructor
  Error.call(this);
  this.name = 'YAMLException';
  this.reason = reason;
  this.mark = mark;
  this.message = formatError(this, false);

  // Include stack trace in error object
  if (Error.captureStackTrace) {
    // Chrome and NodeJS
    Error.captureStackTrace(this, this.constructor);
  } else {
    // FF, IE 10+ and Safari 6+. Fallback for others
    this.stack = new Error().stack || '';
  }
}

// Inherit from Error
YAMLException.prototype = Object.create(Error.prototype);
YAMLException.prototype.constructor = YAMLException;
YAMLException.prototype.toString = function toString(compact) {
  return this.name + ': ' + formatError(this, compact);
};
module.exports = YAMLException;

/***/ }),

/***/ 6177:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


/*eslint-disable max-len,no-use-before-define*/
var common = __webpack_require__(8279);
var YAMLException = __webpack_require__(9661);
var makeSnippet = __webpack_require__(5845);
var DEFAULT_SCHEMA = __webpack_require__(9631);
var _hasOwnProperty = Object.prototype.hasOwnProperty;
var CONTEXT_FLOW_IN = 1;
var CONTEXT_FLOW_OUT = 2;
var CONTEXT_BLOCK_IN = 3;
var CONTEXT_BLOCK_OUT = 4;
var CHOMPING_CLIP = 1;
var CHOMPING_STRIP = 2;
var CHOMPING_KEEP = 3;
var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
var PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
var PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
var PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
function _class(obj) {
  return Object.prototype.toString.call(obj);
}
function is_EOL(c) {
  return c === 0x0A /* LF */ || c === 0x0D /* CR */;
}
function is_WHITE_SPACE(c) {
  return c === 0x09 /* Tab */ || c === 0x20 /* Space */;
}
function is_WS_OR_EOL(c) {
  return c === 0x09 /* Tab */ || c === 0x20 /* Space */ || c === 0x0A /* LF */ || c === 0x0D /* CR */;
}
function is_FLOW_INDICATOR(c) {
  return c === 0x2C /* , */ || c === 0x5B /* [ */ || c === 0x5D /* ] */ || c === 0x7B /* { */ || c === 0x7D /* } */;
}
function fromHexCode(c) {
  var lc;
  if (0x30 /* 0 */ <= c && c <= 0x39 /* 9 */) {
    return c - 0x30;
  }

  /*eslint-disable no-bitwise*/
  lc = c | 0x20;
  if (0x61 /* a */ <= lc && lc <= 0x66 /* f */) {
    return lc - 0x61 + 10;
  }
  return -1;
}
function escapedHexLen(c) {
  if (c === 0x78 /* x */) {
    return 2;
  }
  if (c === 0x75 /* u */) {
    return 4;
  }
  if (c === 0x55 /* U */) {
    return 8;
  }
  return 0;
}
function fromDecimalCode(c) {
  if (0x30 /* 0 */ <= c && c <= 0x39 /* 9 */) {
    return c - 0x30;
  }
  return -1;
}
function simpleEscapeSequence(c) {
  /* eslint-disable indent */
  return c === 0x30 /* 0 */ ? '\x00' : c === 0x61 /* a */ ? '\x07' : c === 0x62 /* b */ ? '\x08' : c === 0x74 /* t */ ? '\x09' : c === 0x09 /* Tab */ ? '\x09' : c === 0x6E /* n */ ? '\x0A' : c === 0x76 /* v */ ? '\x0B' : c === 0x66 /* f */ ? '\x0C' : c === 0x72 /* r */ ? '\x0D' : c === 0x65 /* e */ ? '\x1B' : c === 0x20 /* Space */ ? ' ' : c === 0x22 /* " */ ? '\x22' : c === 0x2F /* / */ ? '/' : c === 0x5C /* \ */ ? '\x5C' : c === 0x4E /* N */ ? '\x85' : c === 0x5F /* _ */ ? '\xA0' : c === 0x4C /* L */ ? '\u2028' : c === 0x50 /* P */ ? '\u2029' : '';
}
function charFromCodepoint(c) {
  if (c <= 0xFFFF) {
    return String.fromCharCode(c);
  }
  // Encode UTF-16 surrogate pair
  // https://en.wikipedia.org/wiki/UTF-16#Code_points_U.2B010000_to_U.2B10FFFF
  return String.fromCharCode((c - 0x010000 >> 10) + 0xD800, (c - 0x010000 & 0x03FF) + 0xDC00);
}
var simpleEscapeCheck = new Array(256); // integer, for fast access
var simpleEscapeMap = new Array(256);
for (var i = 0; i < 256; i++) {
  simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
  simpleEscapeMap[i] = simpleEscapeSequence(i);
}
function State(input, options) {
  this.input = input;
  this.filename = options['filename'] || null;
  this.schema = options['schema'] || DEFAULT_SCHEMA;
  this.onWarning = options['onWarning'] || null;
  // (Hidden) Remove? makes the loader to expect YAML 1.1 documents
  // if such documents have no explicit %YAML directive
  this.legacy = options['legacy'] || false;
  this.json = options['json'] || false;
  this.listener = options['listener'] || null;
  this.implicitTypes = this.schema.compiledImplicit;
  this.typeMap = this.schema.compiledTypeMap;
  this.length = input.length;
  this.position = 0;
  this.line = 0;
  this.lineStart = 0;
  this.lineIndent = 0;

  // position of first leading tab in the current line,
  // used to make sure there are no tabs in the indentation
  this.firstTabInLine = -1;
  this.documents = [];

  /*
  this.version;
  this.checkLineBreaks;
  this.tagMap;
  this.anchorMap;
  this.tag;
  this.anchor;
  this.kind;
  this.result;*/
}
function generateError(state, message) {
  var mark = {
    name: state.filename,
    buffer: state.input.slice(0, -1),
    // omit trailing \0
    position: state.position,
    line: state.line,
    column: state.position - state.lineStart
  };
  mark.snippet = makeSnippet(mark);
  return new YAMLException(message, mark);
}
function throwError(state, message) {
  throw generateError(state, message);
}
function throwWarning(state, message) {
  if (state.onWarning) {
    state.onWarning.call(null, generateError(state, message));
  }
}
var directiveHandlers = {
  YAML: function handleYamlDirective(state, name, args) {
    var match, major, minor;
    if (state.version !== null) {
      throwError(state, 'duplication of %YAML directive');
    }
    if (args.length !== 1) {
      throwError(state, 'YAML directive accepts exactly one argument');
    }
    match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
    if (match === null) {
      throwError(state, 'ill-formed argument of the YAML directive');
    }
    major = parseInt(match[1], 10);
    minor = parseInt(match[2], 10);
    if (major !== 1) {
      throwError(state, 'unacceptable YAML version of the document');
    }
    state.version = args[0];
    state.checkLineBreaks = minor < 2;
    if (minor !== 1 && minor !== 2) {
      throwWarning(state, 'unsupported YAML version of the document');
    }
  },
  TAG: function handleTagDirective(state, name, args) {
    var handle, prefix;
    if (args.length !== 2) {
      throwError(state, 'TAG directive accepts exactly two arguments');
    }
    handle = args[0];
    prefix = args[1];
    if (!PATTERN_TAG_HANDLE.test(handle)) {
      throwError(state, 'ill-formed tag handle (first argument) of the TAG directive');
    }
    if (_hasOwnProperty.call(state.tagMap, handle)) {
      throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
    }
    if (!PATTERN_TAG_URI.test(prefix)) {
      throwError(state, 'ill-formed tag prefix (second argument) of the TAG directive');
    }
    try {
      prefix = decodeURIComponent(prefix);
    } catch (err) {
      throwError(state, 'tag prefix is malformed: ' + prefix);
    }
    state.tagMap[handle] = prefix;
  }
};
function captureSegment(state, start, end, checkJson) {
  var _position, _length, _character, _result;
  if (start < end) {
    _result = state.input.slice(start, end);
    if (checkJson) {
      for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
        _character = _result.charCodeAt(_position);
        if (!(_character === 0x09 || 0x20 <= _character && _character <= 0x10FFFF)) {
          throwError(state, 'expected valid JSON character');
        }
      }
    } else if (PATTERN_NON_PRINTABLE.test(_result)) {
      throwError(state, 'the stream contains non-printable characters');
    }
    state.result += _result;
  }
}
function mergeMappings(state, destination, source, overridableKeys) {
  var sourceKeys, key, index, quantity;
  if (!common.isObject(source)) {
    throwError(state, 'cannot merge mappings; the provided source object is unacceptable');
  }
  sourceKeys = Object.keys(source);
  for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
    key = sourceKeys[index];
    if (!_hasOwnProperty.call(destination, key)) {
      destination[key] = source[key];
      overridableKeys[key] = true;
    }
  }
}
function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
  var index, quantity;

  // The output is a plain object here, so keys can only be strings.
  // We need to convert keyNode to a string, but doing so can hang the process
  // (deeply nested arrays that explode exponentially using aliases).
  if (Array.isArray(keyNode)) {
    keyNode = Array.prototype.slice.call(keyNode);
    for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
      if (Array.isArray(keyNode[index])) {
        throwError(state, 'nested arrays are not supported inside keys');
      }
      if (typeof keyNode === 'object' && _class(keyNode[index]) === '[object Object]') {
        keyNode[index] = '[object Object]';
      }
    }
  }

  // Avoid code execution in load() via toString property
  // (still use its own toString for arrays, timestamps,
  // and whatever user schema extensions happen to have @@toStringTag)
  if (typeof keyNode === 'object' && _class(keyNode) === '[object Object]') {
    keyNode = '[object Object]';
  }
  keyNode = String(keyNode);
  if (_result === null) {
    _result = {};
  }
  if (keyTag === 'tag:yaml.org,2002:merge') {
    if (Array.isArray(valueNode)) {
      for (index = 0, quantity = valueNode.length; index < quantity; index += 1) {
        mergeMappings(state, _result, valueNode[index], overridableKeys);
      }
    } else {
      mergeMappings(state, _result, valueNode, overridableKeys);
    }
  } else {
    if (!state.json && !_hasOwnProperty.call(overridableKeys, keyNode) && _hasOwnProperty.call(_result, keyNode)) {
      state.line = startLine || state.line;
      state.lineStart = startLineStart || state.lineStart;
      state.position = startPos || state.position;
      throwError(state, 'duplicated mapping key');
    }

    // used for this specific key only because Object.defineProperty is slow
    if (keyNode === '__proto__') {
      Object.defineProperty(_result, keyNode, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: valueNode
      });
    } else {
      _result[keyNode] = valueNode;
    }
    delete overridableKeys[keyNode];
  }
  return _result;
}
function readLineBreak(state) {
  var ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 0x0A /* LF */) {
    state.position++;
  } else if (ch === 0x0D /* CR */) {
    state.position++;
    if (state.input.charCodeAt(state.position) === 0x0A /* LF */) {
      state.position++;
    }
  } else {
    throwError(state, 'a line break is expected');
  }
  state.line += 1;
  state.lineStart = state.position;
  state.firstTabInLine = -1;
}
function skipSeparationSpace(state, allowComments, checkIndent) {
  var lineBreaks = 0,
    ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    while (is_WHITE_SPACE(ch)) {
      if (ch === 0x09 /* Tab */ && state.firstTabInLine === -1) {
        state.firstTabInLine = state.position;
      }
      ch = state.input.charCodeAt(++state.position);
    }
    if (allowComments && ch === 0x23 /* # */) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 0x0A /* LF */ && ch !== 0x0D /* CR */ && ch !== 0);
    }
    if (is_EOL(ch)) {
      readLineBreak(state);
      ch = state.input.charCodeAt(state.position);
      lineBreaks++;
      state.lineIndent = 0;
      while (ch === 0x20 /* Space */) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
    } else {
      break;
    }
  }
  if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
    throwWarning(state, 'deficient indentation');
  }
  return lineBreaks;
}
function testDocumentSeparator(state) {
  var _position = state.position,
    ch;
  ch = state.input.charCodeAt(_position);

  // Condition state.position === state.lineStart is tested
  // in parent on each call, for efficiency. No needs to test here again.
  if ((ch === 0x2D /* - */ || ch === 0x2E /* . */) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
    _position += 3;
    ch = state.input.charCodeAt(_position);
    if (ch === 0 || is_WS_OR_EOL(ch)) {
      return true;
    }
  }
  return false;
}
function writeFoldedLines(state, count) {
  if (count === 1) {
    state.result += ' ';
  } else if (count > 1) {
    state.result += common.repeat('\n', count - 1);
  }
}
function readPlainScalar(state, nodeIndent, withinFlowCollection) {
  var preceding,
    following,
    captureStart,
    captureEnd,
    hasPendingContent,
    _line,
    _lineStart,
    _lineIndent,
    _kind = state.kind,
    _result = state.result,
    ch;
  ch = state.input.charCodeAt(state.position);
  if (is_WS_OR_EOL(ch) || is_FLOW_INDICATOR(ch) || ch === 0x23 /* # */ || ch === 0x26 /* & */ || ch === 0x2A /* * */ || ch === 0x21 /* ! */ || ch === 0x7C /* | */ || ch === 0x3E /* > */ || ch === 0x27 /* ' */ || ch === 0x22 /* " */ || ch === 0x25 /* % */ || ch === 0x40 /* @ */ || ch === 0x60 /* ` */) {
    return false;
  }
  if (ch === 0x3F /* ? */ || ch === 0x2D /* - */) {
    following = state.input.charCodeAt(state.position + 1);
    if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
      return false;
    }
  }
  state.kind = 'scalar';
  state.result = '';
  captureStart = captureEnd = state.position;
  hasPendingContent = false;
  while (ch !== 0) {
    if (ch === 0x3A /* : */) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
        break;
      }
    } else if (ch === 0x23 /* # */) {
      preceding = state.input.charCodeAt(state.position - 1);
      if (is_WS_OR_EOL(preceding)) {
        break;
      }
    } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && is_FLOW_INDICATOR(ch)) {
      break;
    } else if (is_EOL(ch)) {
      _line = state.line;
      _lineStart = state.lineStart;
      _lineIndent = state.lineIndent;
      skipSeparationSpace(state, false, -1);
      if (state.lineIndent >= nodeIndent) {
        hasPendingContent = true;
        ch = state.input.charCodeAt(state.position);
        continue;
      } else {
        state.position = captureEnd;
        state.line = _line;
        state.lineStart = _lineStart;
        state.lineIndent = _lineIndent;
        break;
      }
    }
    if (hasPendingContent) {
      captureSegment(state, captureStart, captureEnd, false);
      writeFoldedLines(state, state.line - _line);
      captureStart = captureEnd = state.position;
      hasPendingContent = false;
    }
    if (!is_WHITE_SPACE(ch)) {
      captureEnd = state.position + 1;
    }
    ch = state.input.charCodeAt(++state.position);
  }
  captureSegment(state, captureStart, captureEnd, false);
  if (state.result) {
    return true;
  }
  state.kind = _kind;
  state.result = _result;
  return false;
}
function readSingleQuotedScalar(state, nodeIndent) {
  var ch, captureStart, captureEnd;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 0x27 /* ' */) {
    return false;
  }
  state.kind = 'scalar';
  state.result = '';
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 0x27 /* ' */) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (ch === 0x27 /* ' */) {
        captureStart = state.position;
        state.position++;
        captureEnd = state.position;
      } else {
        return true;
      }
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, 'unexpected end of the document within a single quoted scalar');
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, 'unexpected end of the stream within a single quoted scalar');
}
function readDoubleQuotedScalar(state, nodeIndent) {
  var captureStart, captureEnd, hexLength, hexResult, tmp, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 0x22 /* " */) {
    return false;
  }
  state.kind = 'scalar';
  state.result = '';
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 0x22 /* " */) {
      captureSegment(state, captureStart, state.position, true);
      state.position++;
      return true;
    } else if (ch === 0x5C /* \ */) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (is_EOL(ch)) {
        skipSeparationSpace(state, false, nodeIndent);

        // TODO: rework to inline fn with no type cast?
      } else if (ch < 256 && simpleEscapeCheck[ch]) {
        state.result += simpleEscapeMap[ch];
        state.position++;
      } else if ((tmp = escapedHexLen(ch)) > 0) {
        hexLength = tmp;
        hexResult = 0;
        for (; hexLength > 0; hexLength--) {
          ch = state.input.charCodeAt(++state.position);
          if ((tmp = fromHexCode(ch)) >= 0) {
            hexResult = (hexResult << 4) + tmp;
          } else {
            throwError(state, 'expected hexadecimal character');
          }
        }
        state.result += charFromCodepoint(hexResult);
        state.position++;
      } else {
        throwError(state, 'unknown escape sequence');
      }
      captureStart = captureEnd = state.position;
    } else if (is_EOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      throwError(state, 'unexpected end of the document within a double quoted scalar');
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  throwError(state, 'unexpected end of the stream within a double quoted scalar');
}
function readFlowCollection(state, nodeIndent) {
  var readNext = true,
    _line,
    _lineStart,
    _pos,
    _tag = state.tag,
    _result,
    _anchor = state.anchor,
    following,
    terminator,
    isPair,
    isExplicitPair,
    isMapping,
    overridableKeys = Object.create(null),
    keyNode,
    keyTag,
    valueNode,
    ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 0x5B /* [ */) {
    terminator = 0x5D; /* ] */
    isMapping = false;
    _result = [];
  } else if (ch === 0x7B /* { */) {
    terminator = 0x7D; /* } */
    isMapping = true;
    _result = {};
  } else {
    return false;
  }
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(++state.position);
  while (ch !== 0) {
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === terminator) {
      state.position++;
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = isMapping ? 'mapping' : 'sequence';
      state.result = _result;
      return true;
    } else if (!readNext) {
      throwError(state, 'missed comma between flow collection entries');
    } else if (ch === 0x2C /* , */) {
      // "flow collection entries can never be completely empty", as per YAML 1.2, section 7.4
      throwError(state, "expected the node content, but found ','");
    }
    keyTag = keyNode = valueNode = null;
    isPair = isExplicitPair = false;
    if (ch === 0x3F /* ? */) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following)) {
        isPair = isExplicitPair = true;
        state.position++;
        skipSeparationSpace(state, true, nodeIndent);
      }
    }
    _line = state.line; // Save the current line.
    _lineStart = state.lineStart;
    _pos = state.position;
    composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
    keyTag = state.tag;
    keyNode = state.result;
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if ((isExplicitPair || state.line === _line) && ch === 0x3A /* : */) {
      isPair = true;
      ch = state.input.charCodeAt(++state.position);
      skipSeparationSpace(state, true, nodeIndent);
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      valueNode = state.result;
    }
    if (isMapping) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
    } else if (isPair) {
      _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
    } else {
      _result.push(keyNode);
    }
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === 0x2C /* , */) {
      readNext = true;
      ch = state.input.charCodeAt(++state.position);
    } else {
      readNext = false;
    }
  }
  throwError(state, 'unexpected end of the stream within a flow collection');
}
function readBlockScalar(state, nodeIndent) {
  var captureStart,
    folding,
    chomping = CHOMPING_CLIP,
    didReadContent = false,
    detectedIndent = false,
    textIndent = nodeIndent,
    emptyLines = 0,
    atMoreIndented = false,
    tmp,
    ch;
  ch = state.input.charCodeAt(state.position);
  if (ch === 0x7C /* | */) {
    folding = false;
  } else if (ch === 0x3E /* > */) {
    folding = true;
  } else {
    return false;
  }
  state.kind = 'scalar';
  state.result = '';
  while (ch !== 0) {
    ch = state.input.charCodeAt(++state.position);
    if (ch === 0x2B /* + */ || ch === 0x2D /* - */) {
      if (CHOMPING_CLIP === chomping) {
        chomping = ch === 0x2B /* + */ ? CHOMPING_KEEP : CHOMPING_STRIP;
      } else {
        throwError(state, 'repeat of a chomping mode identifier');
      }
    } else if ((tmp = fromDecimalCode(ch)) >= 0) {
      if (tmp === 0) {
        throwError(state, 'bad explicit indentation width of a block scalar; it cannot be less than one');
      } else if (!detectedIndent) {
        textIndent = nodeIndent + tmp - 1;
        detectedIndent = true;
      } else {
        throwError(state, 'repeat of an indentation width identifier');
      }
    } else {
      break;
    }
  }
  if (is_WHITE_SPACE(ch)) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (is_WHITE_SPACE(ch));
    if (ch === 0x23 /* # */) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (!is_EOL(ch) && ch !== 0);
    }
  }
  while (ch !== 0) {
    readLineBreak(state);
    state.lineIndent = 0;
    ch = state.input.charCodeAt(state.position);
    while ((!detectedIndent || state.lineIndent < textIndent) && ch === 0x20 /* Space */) {
      state.lineIndent++;
      ch = state.input.charCodeAt(++state.position);
    }
    if (!detectedIndent && state.lineIndent > textIndent) {
      textIndent = state.lineIndent;
    }
    if (is_EOL(ch)) {
      emptyLines++;
      continue;
    }

    // End of the scalar.
    if (state.lineIndent < textIndent) {
      // Perform the chomping.
      if (chomping === CHOMPING_KEEP) {
        state.result += common.repeat('\n', didReadContent ? 1 + emptyLines : emptyLines);
      } else if (chomping === CHOMPING_CLIP) {
        if (didReadContent) {
          // i.e. only if the scalar is not empty.
          state.result += '\n';
        }
      }

      // Break this `while` cycle and go to the funciton's epilogue.
      break;
    }

    // Folded style: use fancy rules to handle line breaks.
    if (folding) {
      // Lines starting with white space characters (more-indented lines) are not folded.
      if (is_WHITE_SPACE(ch)) {
        atMoreIndented = true;
        // except for the first content line (cf. Example 8.1)
        state.result += common.repeat('\n', didReadContent ? 1 + emptyLines : emptyLines);

        // End of more-indented block.
      } else if (atMoreIndented) {
        atMoreIndented = false;
        state.result += common.repeat('\n', emptyLines + 1);

        // Just one line break - perceive as the same line.
      } else if (emptyLines === 0) {
        if (didReadContent) {
          // i.e. only if we have already read some scalar content.
          state.result += ' ';
        }

        // Several line breaks - perceive as different lines.
      } else {
        state.result += common.repeat('\n', emptyLines);
      }

      // Literal style: just add exact number of line breaks between content lines.
    } else {
      // Keep all line breaks except the header line break.
      state.result += common.repeat('\n', didReadContent ? 1 + emptyLines : emptyLines);
    }
    didReadContent = true;
    detectedIndent = true;
    emptyLines = 0;
    captureStart = state.position;
    while (!is_EOL(ch) && ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, state.position, false);
  }
  return true;
}
function readBlockSequence(state, nodeIndent) {
  var _line,
    _tag = state.tag,
    _anchor = state.anchor,
    _result = [],
    following,
    detected = false,
    ch;

  // there is a leading tab before this token, so it can't be a block sequence/mapping;
  // it can still be flow sequence/mapping or a scalar
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, 'tab characters must not be used in indentation');
    }
    if (ch !== 0x2D /* - */) {
      break;
    }
    following = state.input.charCodeAt(state.position + 1);
    if (!is_WS_OR_EOL(following)) {
      break;
    }
    detected = true;
    state.position++;
    if (skipSeparationSpace(state, true, -1)) {
      if (state.lineIndent <= nodeIndent) {
        _result.push(null);
        ch = state.input.charCodeAt(state.position);
        continue;
      }
    }
    _line = state.line;
    composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
    _result.push(state.result);
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, 'bad indentation of a sequence entry');
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = 'sequence';
    state.result = _result;
    return true;
  }
  return false;
}
function readBlockMapping(state, nodeIndent, flowIndent) {
  var following,
    allowCompact,
    _line,
    _keyLine,
    _keyLineStart,
    _keyPos,
    _tag = state.tag,
    _anchor = state.anchor,
    _result = {},
    overridableKeys = Object.create(null),
    keyTag = null,
    keyNode = null,
    valueNode = null,
    atExplicitKey = false,
    detected = false,
    ch;

  // there is a leading tab before this token, so it can't be a block sequence/mapping;
  // it can still be flow sequence/mapping or a scalar
  if (state.firstTabInLine !== -1) return false;
  if (state.anchor !== null) {
    state.anchorMap[state.anchor] = _result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (!atExplicitKey && state.firstTabInLine !== -1) {
      state.position = state.firstTabInLine;
      throwError(state, 'tab characters must not be used in indentation');
    }
    following = state.input.charCodeAt(state.position + 1);
    _line = state.line; // Save the current line.

    //
    // Explicit notation case. There are two separate blocks:
    // first for the key (denoted by "?") and second for the value (denoted by ":")
    //
    if ((ch === 0x3F /* ? */ || ch === 0x3A /* : */) && is_WS_OR_EOL(following)) {
      if (ch === 0x3F /* ? */) {
        if (atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        detected = true;
        atExplicitKey = true;
        allowCompact = true;
      } else if (atExplicitKey) {
        // i.e. 0x3A/* : */ === character after the explicit key.
        atExplicitKey = false;
        allowCompact = true;
      } else {
        throwError(state, 'incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line');
      }
      state.position += 1;
      ch = following;

      //
      // Implicit notation case. Flow-style node as the key first, then ":", and the value.
      //
    } else {
      _keyLine = state.line;
      _keyLineStart = state.lineStart;
      _keyPos = state.position;
      if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
        // Neither implicit nor explicit notation.
        // Reading is done. Go to the epilogue.
        break;
      }
      if (state.line === _line) {
        ch = state.input.charCodeAt(state.position);
        while (is_WHITE_SPACE(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 0x3A /* : */) {
          ch = state.input.charCodeAt(++state.position);
          if (!is_WS_OR_EOL(ch)) {
            throwError(state, 'a whitespace character is expected after the key-value separator within a block mapping');
          }
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = false;
          allowCompact = false;
          keyTag = state.tag;
          keyNode = state.result;
        } else if (detected) {
          throwError(state, 'can not read an implicit mapping pair; a colon is missed');
        } else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true; // Keep the result of `composeNode`.
        }
      } else if (detected) {
        throwError(state, 'can not read a block mapping entry; a multiline key may not be an implicit key');
      } else {
        state.tag = _tag;
        state.anchor = _anchor;
        return true; // Keep the result of `composeNode`.
      }
    }

    //
    // Common reading code for both explicit and implicit notations.
    //
    if (state.line === _line || state.lineIndent > nodeIndent) {
      if (atExplicitKey) {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
      }
      if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
        if (atExplicitKey) {
          keyNode = state.result;
        } else {
          valueNode = state.result;
        }
      }
      if (!atExplicitKey) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
        keyTag = keyNode = valueNode = null;
      }
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
    }
    if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
      throwError(state, 'bad indentation of a mapping entry');
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }

  //
  // Epilogue.
  //

  // Special case: last mapping's node contains only the key in explicit notation.
  if (atExplicitKey) {
    storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
  }

  // Expose the resulting mapping.
  if (detected) {
    state.tag = _tag;
    state.anchor = _anchor;
    state.kind = 'mapping';
    state.result = _result;
  }
  return detected;
}
function readTagProperty(state) {
  var _position,
    isVerbatim = false,
    isNamed = false,
    tagHandle,
    tagName,
    ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 0x21 /* ! */) return false;
  if (state.tag !== null) {
    throwError(state, 'duplication of a tag property');
  }
  ch = state.input.charCodeAt(++state.position);
  if (ch === 0x3C /* < */) {
    isVerbatim = true;
    ch = state.input.charCodeAt(++state.position);
  } else if (ch === 0x21 /* ! */) {
    isNamed = true;
    tagHandle = '!!';
    ch = state.input.charCodeAt(++state.position);
  } else {
    tagHandle = '!';
  }
  _position = state.position;
  if (isVerbatim) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (ch !== 0 && ch !== 0x3E /* > */);
    if (state.position < state.length) {
      tagName = state.input.slice(_position, state.position);
      ch = state.input.charCodeAt(++state.position);
    } else {
      throwError(state, 'unexpected end of the stream within a verbatim tag');
    }
  } else {
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      if (ch === 0x21 /* ! */) {
        if (!isNamed) {
          tagHandle = state.input.slice(_position - 1, state.position + 1);
          if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
            throwError(state, 'named tag handle cannot contain such characters');
          }
          isNamed = true;
          _position = state.position + 1;
        } else {
          throwError(state, 'tag suffix cannot contain exclamation marks');
        }
      }
      ch = state.input.charCodeAt(++state.position);
    }
    tagName = state.input.slice(_position, state.position);
    if (PATTERN_FLOW_INDICATORS.test(tagName)) {
      throwError(state, 'tag suffix cannot contain flow indicator characters');
    }
  }
  if (tagName && !PATTERN_TAG_URI.test(tagName)) {
    throwError(state, 'tag name cannot contain such characters: ' + tagName);
  }
  try {
    tagName = decodeURIComponent(tagName);
  } catch (err) {
    throwError(state, 'tag name is malformed: ' + tagName);
  }
  if (isVerbatim) {
    state.tag = tagName;
  } else if (_hasOwnProperty.call(state.tagMap, tagHandle)) {
    state.tag = state.tagMap[tagHandle] + tagName;
  } else if (tagHandle === '!') {
    state.tag = '!' + tagName;
  } else if (tagHandle === '!!') {
    state.tag = 'tag:yaml.org,2002:' + tagName;
  } else {
    throwError(state, 'undeclared tag handle "' + tagHandle + '"');
  }
  return true;
}
function readAnchorProperty(state) {
  var _position, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 0x26 /* & */) return false;
  if (state.anchor !== null) {
    throwError(state, 'duplication of an anchor property');
  }
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, 'name of an anchor node must contain at least one character');
  }
  state.anchor = state.input.slice(_position, state.position);
  return true;
}
function readAlias(state) {
  var _position, alias, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 0x2A /* * */) return false;
  ch = state.input.charCodeAt(++state.position);
  _position = state.position;
  while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    throwError(state, 'name of an alias node must contain at least one character');
  }
  alias = state.input.slice(_position, state.position);
  if (!_hasOwnProperty.call(state.anchorMap, alias)) {
    throwError(state, 'unidentified alias "' + alias + '"');
  }
  state.result = state.anchorMap[alias];
  skipSeparationSpace(state, true, -1);
  return true;
}
function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
  var allowBlockStyles,
    allowBlockScalars,
    allowBlockCollections,
    indentStatus = 1,
    // 1: this>parent, 0: this=parent, -1: this<parent
    atNewLine = false,
    hasContent = false,
    typeIndex,
    typeQuantity,
    typeList,
    type,
    flowIndent,
    blockIndent;
  if (state.listener !== null) {
    state.listener('open', state);
  }
  state.tag = null;
  state.anchor = null;
  state.kind = null;
  state.result = null;
  allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
  if (allowToSeek) {
    if (skipSeparationSpace(state, true, -1)) {
      atNewLine = true;
      if (state.lineIndent > parentIndent) {
        indentStatus = 1;
      } else if (state.lineIndent === parentIndent) {
        indentStatus = 0;
      } else if (state.lineIndent < parentIndent) {
        indentStatus = -1;
      }
    }
  }
  if (indentStatus === 1) {
    while (readTagProperty(state) || readAnchorProperty(state)) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        allowBlockCollections = allowBlockStyles;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      } else {
        allowBlockCollections = false;
      }
    }
  }
  if (allowBlockCollections) {
    allowBlockCollections = atNewLine || allowCompact;
  }
  if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
    if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
      flowIndent = parentIndent;
    } else {
      flowIndent = parentIndent + 1;
    }
    blockIndent = state.position - state.lineStart;
    if (indentStatus === 1) {
      if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
        hasContent = true;
      } else {
        if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
          hasContent = true;
        } else if (readAlias(state)) {
          hasContent = true;
          if (state.tag !== null || state.anchor !== null) {
            throwError(state, 'alias node should not have any properties');
          }
        } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
          hasContent = true;
          if (state.tag === null) {
            state.tag = '?';
          }
        }
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
      }
    } else if (indentStatus === 0) {
      // Special case: block sequences are allowed to have same indentation level as the parent.
      // http://www.yaml.org/spec/1.2/spec.html#id2799784
      hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
    }
  }
  if (state.tag === null) {
    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = state.result;
    }
  } else if (state.tag === '?') {
    // Implicit resolving is not allowed for non-scalar types, and '?'
    // non-specific tag is only automatically assigned to plain scalars.
    //
    // We only need to check kind conformity in case user explicitly assigns '?'
    // tag, for example like this: "!<?> [0]"
    //
    if (state.result !== null && state.kind !== 'scalar') {
      throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
    }
    for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
      type = state.implicitTypes[typeIndex];
      if (type.resolve(state.result)) {
        // `state.result` updated in resolver if matched
        state.result = type.construct(state.result);
        state.tag = type.tag;
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
        break;
      }
    }
  } else if (state.tag !== '!') {
    if (_hasOwnProperty.call(state.typeMap[state.kind || 'fallback'], state.tag)) {
      type = state.typeMap[state.kind || 'fallback'][state.tag];
    } else {
      // looking for multi type
      type = null;
      typeList = state.typeMap.multi[state.kind || 'fallback'];
      for (typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
        if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
          type = typeList[typeIndex];
          break;
        }
      }
    }
    if (!type) {
      throwError(state, 'unknown tag !<' + state.tag + '>');
    }
    if (state.result !== null && type.kind !== state.kind) {
      throwError(state, 'unacceptable node kind for !<' + state.tag + '> tag; it should be "' + type.kind + '", not "' + state.kind + '"');
    }
    if (!type.resolve(state.result, state.tag)) {
      // `state.result` updated in resolver if matched
      throwError(state, 'cannot resolve a node with !<' + state.tag + '> explicit tag');
    } else {
      state.result = type.construct(state.result, state.tag);
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = state.result;
      }
    }
  }
  if (state.listener !== null) {
    state.listener('close', state);
  }
  return state.tag !== null || state.anchor !== null || hasContent;
}
function readDocument(state) {
  var documentStart = state.position,
    _position,
    directiveName,
    directiveArgs,
    hasDirectives = false,
    ch;
  state.version = null;
  state.checkLineBreaks = state.legacy;
  state.tagMap = Object.create(null);
  state.anchorMap = Object.create(null);
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if (state.lineIndent > 0 || ch !== 0x25 /* % */) {
      break;
    }
    hasDirectives = true;
    ch = state.input.charCodeAt(++state.position);
    _position = state.position;
    while (ch !== 0 && !is_WS_OR_EOL(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    directiveName = state.input.slice(_position, state.position);
    directiveArgs = [];
    if (directiveName.length < 1) {
      throwError(state, 'directive name must not be less than one character in length');
    }
    while (ch !== 0) {
      while (is_WHITE_SPACE(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      if (ch === 0x23 /* # */) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 0 && !is_EOL(ch));
        break;
      }
      if (is_EOL(ch)) break;
      _position = state.position;
      while (ch !== 0 && !is_WS_OR_EOL(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      directiveArgs.push(state.input.slice(_position, state.position));
    }
    if (ch !== 0) readLineBreak(state);
    if (_hasOwnProperty.call(directiveHandlers, directiveName)) {
      directiveHandlers[directiveName](state, directiveName, directiveArgs);
    } else {
      throwWarning(state, 'unknown document directive "' + directiveName + '"');
    }
  }
  skipSeparationSpace(state, true, -1);
  if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 0x2D /* - */ && state.input.charCodeAt(state.position + 1) === 0x2D /* - */ && state.input.charCodeAt(state.position + 2) === 0x2D /* - */) {
    state.position += 3;
    skipSeparationSpace(state, true, -1);
  } else if (hasDirectives) {
    throwError(state, 'directives end mark is expected');
  }
  composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
  skipSeparationSpace(state, true, -1);
  if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
    throwWarning(state, 'non-ASCII line breaks are interpreted as content');
  }
  state.documents.push(state.result);
  if (state.position === state.lineStart && testDocumentSeparator(state)) {
    if (state.input.charCodeAt(state.position) === 0x2E /* . */) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    }
    return;
  }
  if (state.position < state.length - 1) {
    throwError(state, 'end of the stream or a document separator is expected');
  } else {
    return;
  }
}
function loadDocuments(input, options) {
  input = String(input);
  options = options || {};
  if (input.length !== 0) {
    // Add tailing `\n` if not exists
    if (input.charCodeAt(input.length - 1) !== 0x0A /* LF */ && input.charCodeAt(input.length - 1) !== 0x0D /* CR */) {
      input += '\n';
    }

    // Strip BOM
    if (input.charCodeAt(0) === 0xFEFF) {
      input = input.slice(1);
    }
  }
  var state = new State(input, options);
  var nullpos = input.indexOf('\0');
  if (nullpos !== -1) {
    state.position = nullpos;
    throwError(state, 'null byte is not allowed in input');
  }

  // Use 0 as string terminator. That significantly simplifies bounds check.
  state.input += '\0';
  while (state.input.charCodeAt(state.position) === 0x20 /* Space */) {
    state.lineIndent += 1;
    state.position += 1;
  }
  while (state.position < state.length - 1) {
    readDocument(state);
  }
  return state.documents;
}
function loadAll(input, iterator, options) {
  if (iterator !== null && typeof iterator === 'object' && typeof options === 'undefined') {
    options = iterator;
    iterator = null;
  }
  var documents = loadDocuments(input, options);
  if (typeof iterator !== 'function') {
    return documents;
  }
  for (var index = 0, length = documents.length; index < length; index += 1) {
    iterator(documents[index]);
  }
}
function load(input, options) {
  var documents = loadDocuments(input, options);
  if (documents.length === 0) {
    /*eslint-disable no-undefined*/
    return undefined;
  } else if (documents.length === 1) {
    return documents[0];
  }
  throw new YAMLException('expected a single document in the stream, but found more');
}
module.exports.loadAll = loadAll;
module.exports.load = load;

/***/ }),

/***/ 13:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


/*eslint-disable max-len*/
var YAMLException = __webpack_require__(9661);
var Type = __webpack_require__(666);
function compileList(schema, name) {
  var result = [];
  schema[name].forEach(function (currentType) {
    var newIndex = result.length;
    result.forEach(function (previousType, previousIndex) {
      if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
        newIndex = previousIndex;
      }
    });
    result[newIndex] = currentType;
  });
  return result;
}
function compileMap(/* lists... */
) {
  var result = {
      scalar: {},
      sequence: {},
      mapping: {},
      fallback: {},
      multi: {
        scalar: [],
        sequence: [],
        mapping: [],
        fallback: []
      }
    },
    index,
    length;
  function collectType(type) {
    if (type.multi) {
      result.multi[type.kind].push(type);
      result.multi['fallback'].push(type);
    } else {
      result[type.kind][type.tag] = result['fallback'][type.tag] = type;
    }
  }
  for (index = 0, length = arguments.length; index < length; index += 1) {
    arguments[index].forEach(collectType);
  }
  return result;
}
function Schema(definition) {
  return this.extend(definition);
}
Schema.prototype.extend = function extend(definition) {
  var implicit = [];
  var explicit = [];
  if (definition instanceof Type) {
    // Schema.extend(type)
    explicit.push(definition);
  } else if (Array.isArray(definition)) {
    // Schema.extend([ type1, type2, ... ])
    explicit = explicit.concat(definition);
  } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
    // Schema.extend({ explicit: [ type1, type2, ... ], implicit: [ type1, type2, ... ] })
    if (definition.implicit) implicit = implicit.concat(definition.implicit);
    if (definition.explicit) explicit = explicit.concat(definition.explicit);
  } else {
    throw new YAMLException('Schema.extend argument should be a Type, [ Type ], ' + 'or a schema definition ({ implicit: [...], explicit: [...] })');
  }
  implicit.forEach(function (type) {
    if (!(type instanceof Type)) {
      throw new YAMLException('Specified list of YAML types (or a single Type object) contains a non-Type object.');
    }
    if (type.loadKind && type.loadKind !== 'scalar') {
      throw new YAMLException('There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.');
    }
    if (type.multi) {
      throw new YAMLException('There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.');
    }
  });
  explicit.forEach(function (type) {
    if (!(type instanceof Type)) {
      throw new YAMLException('Specified list of YAML types (or a single Type object) contains a non-Type object.');
    }
  });
  var result = Object.create(Schema.prototype);
  result.implicit = (this.implicit || []).concat(implicit);
  result.explicit = (this.explicit || []).concat(explicit);
  result.compiledImplicit = compileList(result, 'implicit');
  result.compiledExplicit = compileList(result, 'explicit');
  result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
  return result;
};
module.exports = Schema;

/***/ }),

/***/ 9403:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// Standard YAML's Core schema.
// http://www.yaml.org/spec/1.2/spec.html#id2804923
//
// NOTE: JS-YAML does not support schema-specific tag resolution restrictions.
// So, Core schema has no distinctions from JSON schema is JS-YAML.



module.exports = __webpack_require__(1006);

/***/ }),

/***/ 9631:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// JS-YAML's default schema for `safeLoad` function.
// It is not described in the YAML specification.
//
// This schema is based on standard YAML's Core schema and includes most of
// extra types described at YAML tag repository. (http://yaml.org/type/)



module.exports = (__webpack_require__(9403).extend)({
  implicit: [__webpack_require__(6453), __webpack_require__(1997)],
  explicit: [__webpack_require__(7320), __webpack_require__(9564), __webpack_require__(4792), __webpack_require__(3797)]
});

/***/ }),

/***/ 4769:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// Standard YAML's Failsafe schema.
// http://www.yaml.org/spec/1.2/spec.html#id2802346



var Schema = __webpack_require__(13);
module.exports = new Schema({
  explicit: [__webpack_require__(5022), __webpack_require__(7322), __webpack_require__(2955)]
});

/***/ }),

/***/ 1006:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
// Standard YAML's JSON schema.
// http://www.yaml.org/spec/1.2/spec.html#id2803231
//
// NOTE: JS-YAML does not support schema-specific tag resolution restrictions.
// So, this schema is not such strict as defined in the YAML specification.
// It allows numbers in binary notaion, use `Null` and `NULL` as `null`, etc.



module.exports = (__webpack_require__(4769).extend)({
  implicit: [__webpack_require__(5888), __webpack_require__(4777), __webpack_require__(5488), __webpack_require__(9791)]
});

/***/ }),

/***/ 5845:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


var common = __webpack_require__(8279);

// get snippet for a single line, respecting maxLength
function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
  var head = '';
  var tail = '';
  var maxHalfLength = Math.floor(maxLineLength / 2) - 1;
  if (position - lineStart > maxHalfLength) {
    head = ' ... ';
    lineStart = position - maxHalfLength + head.length;
  }
  if (lineEnd - position > maxHalfLength) {
    tail = ' ...';
    lineEnd = position + maxHalfLength - tail.length;
  }
  return {
    str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, '→') + tail,
    pos: position - lineStart + head.length // relative position
  };
}
function padStart(string, max) {
  return common.repeat(' ', max - string.length) + string;
}
function makeSnippet(mark, options) {
  options = Object.create(options || null);
  if (!mark.buffer) return null;
  if (!options.maxLength) options.maxLength = 79;
  if (typeof options.indent !== 'number') options.indent = 1;
  if (typeof options.linesBefore !== 'number') options.linesBefore = 3;
  if (typeof options.linesAfter !== 'number') options.linesAfter = 2;
  var re = /\r?\n|\r|\0/g;
  var lineStarts = [0];
  var lineEnds = [];
  var match;
  var foundLineNo = -1;
  while (match = re.exec(mark.buffer)) {
    lineEnds.push(match.index);
    lineStarts.push(match.index + match[0].length);
    if (mark.position <= match.index && foundLineNo < 0) {
      foundLineNo = lineStarts.length - 2;
    }
  }
  if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
  var result = '',
    i,
    line;
  var lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
  var maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
  for (i = 1; i <= options.linesBefore; i++) {
    if (foundLineNo - i < 0) break;
    line = getLine(mark.buffer, lineStarts[foundLineNo - i], lineEnds[foundLineNo - i], mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]), maxLineLength);
    result = common.repeat(' ', options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + ' | ' + line.str + '\n' + result;
  }
  line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
  result += common.repeat(' ', options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + ' | ' + line.str + '\n';
  result += common.repeat('-', options.indent + lineNoLength + 3 + line.pos) + '^' + '\n';
  for (i = 1; i <= options.linesAfter; i++) {
    if (foundLineNo + i >= lineEnds.length) break;
    line = getLine(mark.buffer, lineStarts[foundLineNo + i], lineEnds[foundLineNo + i], mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]), maxLineLength);
    result += common.repeat(' ', options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + ' | ' + line.str + '\n';
  }
  return result.replace(/\n$/, '');
}
module.exports = makeSnippet;

/***/ }),

/***/ 666:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


var YAMLException = __webpack_require__(9661);
var TYPE_CONSTRUCTOR_OPTIONS = ['kind', 'multi', 'resolve', 'construct', 'instanceOf', 'predicate', 'represent', 'representName', 'defaultStyle', 'styleAliases'];
var YAML_NODE_KINDS = ['scalar', 'sequence', 'mapping'];
function compileStyleAliases(map) {
  var result = {};
  if (map !== null) {
    Object.keys(map).forEach(function (style) {
      map[style].forEach(function (alias) {
        result[String(alias)] = style;
      });
    });
  }
  return result;
}
function Type(tag, options) {
  options = options || {};
  Object.keys(options).forEach(function (name) {
    if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
      throw new YAMLException('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
    }
  });

  // TODO: Add tag format check.
  this.options = options; // keep original options in case user wants to extend this type later
  this.tag = tag;
  this.kind = options['kind'] || null;
  this.resolve = options['resolve'] || function () {
    return true;
  };
  this.construct = options['construct'] || function (data) {
    return data;
  };
  this.instanceOf = options['instanceOf'] || null;
  this.predicate = options['predicate'] || null;
  this.represent = options['represent'] || null;
  this.representName = options['representName'] || null;
  this.defaultStyle = options['defaultStyle'] || null;
  this.multi = options['multi'] || false;
  this.styleAliases = compileStyleAliases(options['styleAliases'] || null);
  if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
    throw new YAMLException('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
  }
}
module.exports = Type;

/***/ }),

/***/ 7320:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


/*eslint-disable no-bitwise*/
var Type = __webpack_require__(666);

// [ 64, 65, 66 ] -> [ padding, CR, LF ]
var BASE64_MAP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r';
function resolveYamlBinary(data) {
  if (data === null) return false;
  var code,
    idx,
    bitlen = 0,
    max = data.length,
    map = BASE64_MAP;

  // Convert one by one.
  for (idx = 0; idx < max; idx++) {
    code = map.indexOf(data.charAt(idx));

    // Skip CR/LF
    if (code > 64) continue;

    // Fail on illegal characters
    if (code < 0) return false;
    bitlen += 6;
  }

  // If there are any bits left, source was corrupted
  return bitlen % 8 === 0;
}
function constructYamlBinary(data) {
  var idx,
    tailbits,
    input = data.replace(/[\r\n=]/g, ''),
    // remove CR/LF & padding to simplify scan
    max = input.length,
    map = BASE64_MAP,
    bits = 0,
    result = [];

  // Collect by 6*4 bits (3 bytes)

  for (idx = 0; idx < max; idx++) {
    if (idx % 4 === 0 && idx) {
      result.push(bits >> 16 & 0xFF);
      result.push(bits >> 8 & 0xFF);
      result.push(bits & 0xFF);
    }
    bits = bits << 6 | map.indexOf(input.charAt(idx));
  }

  // Dump tail

  tailbits = max % 4 * 6;
  if (tailbits === 0) {
    result.push(bits >> 16 & 0xFF);
    result.push(bits >> 8 & 0xFF);
    result.push(bits & 0xFF);
  } else if (tailbits === 18) {
    result.push(bits >> 10 & 0xFF);
    result.push(bits >> 2 & 0xFF);
  } else if (tailbits === 12) {
    result.push(bits >> 4 & 0xFF);
  }
  return new Uint8Array(result);
}
function representYamlBinary(object /*, style*/) {
  var result = '',
    bits = 0,
    idx,
    tail,
    max = object.length,
    map = BASE64_MAP;

  // Convert every three bytes to 4 ASCII characters.

  for (idx = 0; idx < max; idx++) {
    if (idx % 3 === 0 && idx) {
      result += map[bits >> 18 & 0x3F];
      result += map[bits >> 12 & 0x3F];
      result += map[bits >> 6 & 0x3F];
      result += map[bits & 0x3F];
    }
    bits = (bits << 8) + object[idx];
  }

  // Dump tail

  tail = max % 3;
  if (tail === 0) {
    result += map[bits >> 18 & 0x3F];
    result += map[bits >> 12 & 0x3F];
    result += map[bits >> 6 & 0x3F];
    result += map[bits & 0x3F];
  } else if (tail === 2) {
    result += map[bits >> 10 & 0x3F];
    result += map[bits >> 4 & 0x3F];
    result += map[bits << 2 & 0x3F];
    result += map[64];
  } else if (tail === 1) {
    result += map[bits >> 2 & 0x3F];
    result += map[bits << 4 & 0x3F];
    result += map[64];
    result += map[64];
  }
  return result;
}
function isBinary(obj) {
  return Object.prototype.toString.call(obj) === '[object Uint8Array]';
}
module.exports = new Type('tag:yaml.org,2002:binary', {
  kind: 'scalar',
  resolve: resolveYamlBinary,
  construct: constructYamlBinary,
  predicate: isBinary,
  represent: representYamlBinary
});

/***/ }),

/***/ 4777:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


var Type = __webpack_require__(666);
function resolveYamlBoolean(data) {
  if (data === null) return false;
  var max = data.length;
  return max === 4 && (data === 'true' || data === 'True' || data === 'TRUE') || max === 5 && (data === 'false' || data === 'False' || data === 'FALSE');
}
function constructYamlBoolean(data) {
  return data === 'true' || data === 'True' || data === 'TRUE';
}
function isBoolean(object) {
  return Object.prototype.toString.call(object) === '[object Boolean]';
}
module.exports = new Type('tag:yaml.org,2002:bool', {
  kind: 'scalar',
  resolve: resolveYamlBoolean,
  construct: constructYamlBoolean,
  predicate: isBoolean,
  represent: {
    lowercase: function (object) {
      return object ? 'true' : 'false';
    },
    uppercase: function (object) {
      return object ? 'TRUE' : 'FALSE';
    },
    camelcase: function (object) {
      return object ? 'True' : 'False';
    }
  },
  defaultStyle: 'lowercase'
});

/***/ }),

/***/ 9791:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


var common = __webpack_require__(8279);
var Type = __webpack_require__(666);
var YAML_FLOAT_PATTERN = new RegExp(
// 2.5e4, 2.5 and integers
'^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?' +
// .2e4, .2
// special case, seems not from spec
'|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?' +
// .inf
'|[-+]?\\.(?:inf|Inf|INF)' +
// .nan
'|\\.(?:nan|NaN|NAN))$');
function resolveYamlFloat(data) {
  if (data === null) return false;
  if (!YAML_FLOAT_PATTERN.test(data) ||
  // Quick hack to not allow integers end with `_`
  // Probably should update regexp & check speed
  data[data.length - 1] === '_') {
    return false;
  }
  return true;
}
function constructYamlFloat(data) {
  var value, sign;
  value = data.replace(/_/g, '').toLowerCase();
  sign = value[0] === '-' ? -1 : 1;
  if ('+-'.indexOf(value[0]) >= 0) {
    value = value.slice(1);
  }
  if (value === '.inf') {
    return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  } else if (value === '.nan') {
    return NaN;
  }
  return sign * parseFloat(value, 10);
}
var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
function representYamlFloat(object, style) {
  var res;
  if (isNaN(object)) {
    switch (style) {
      case 'lowercase':
        return '.nan';
      case 'uppercase':
        return '.NAN';
      case 'camelcase':
        return '.NaN';
    }
  } else if (Number.POSITIVE_INFINITY === object) {
    switch (style) {
      case 'lowercase':
        return '.inf';
      case 'uppercase':
        return '.INF';
      case 'camelcase':
        return '.Inf';
    }
  } else if (Number.NEGATIVE_INFINITY === object) {
    switch (style) {
      case 'lowercase':
        return '-.inf';
      case 'uppercase':
        return '-.INF';
      case 'camelcase':
        return '-.Inf';
    }
  } else if (common.isNegativeZero(object)) {
    return '-0.0';
  }
  res = object.toString(10);

  // JS stringifier can build scientific format without dots: 5e-100,
  // while YAML requres dot: 5.e-100. Fix it with simple hack

  return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace('e', '.e') : res;
}
function isFloat(object) {
  return Object.prototype.toString.call(object) === '[object Number]' && (object % 1 !== 0 || common.isNegativeZero(object));
}
module.exports = new Type('tag:yaml.org,2002:float', {
  kind: 'scalar',
  resolve: resolveYamlFloat,
  construct: constructYamlFloat,
  predicate: isFloat,
  represent: representYamlFloat,
  defaultStyle: 'lowercase'
});

/***/ }),

/***/ 5488:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


var common = __webpack_require__(8279);
var Type = __webpack_require__(666);
function isHexCode(c) {
  return 0x30 /* 0 */ <= c && c <= 0x39 /* 9 */ || 0x41 /* A */ <= c && c <= 0x46 /* F */ || 0x61 /* a */ <= c && c <= 0x66 /* f */;
}
function isOctCode(c) {
  return 0x30 /* 0 */ <= c && c <= 0x37 /* 7 */;
}
function isDecCode(c) {
  return 0x30 /* 0 */ <= c && c <= 0x39 /* 9 */;
}
function resolveYamlInteger(data) {
  if (data === null) return false;
  var max = data.length,
    index = 0,
    hasDigits = false,
    ch;
  if (!max) return false;
  ch = data[index];

  // sign
  if (ch === '-' || ch === '+') {
    ch = data[++index];
  }
  if (ch === '0') {
    // 0
    if (index + 1 === max) return true;
    ch = data[++index];

    // base 2, base 8, base 16

    if (ch === 'b') {
      // base 2
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === '_') continue;
        if (ch !== '0' && ch !== '1') return false;
        hasDigits = true;
      }
      return hasDigits && ch !== '_';
    }
    if (ch === 'x') {
      // base 16
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === '_') continue;
        if (!isHexCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== '_';
    }
    if (ch === 'o') {
      // base 8
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === '_') continue;
        if (!isOctCode(data.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== '_';
    }
  }

  // base 10 (except 0)

  // value should not start with `_`;
  if (ch === '_') return false;
  for (; index < max; index++) {
    ch = data[index];
    if (ch === '_') continue;
    if (!isDecCode(data.charCodeAt(index))) {
      return false;
    }
    hasDigits = true;
  }

  // Should have digits and should not end with `_`
  if (!hasDigits || ch === '_') return false;
  return true;
}
function constructYamlInteger(data) {
  var value = data,
    sign = 1,
    ch;
  if (value.indexOf('_') !== -1) {
    value = value.replace(/_/g, '');
  }
  ch = value[0];
  if (ch === '-' || ch === '+') {
    if (ch === '-') sign = -1;
    value = value.slice(1);
    ch = value[0];
  }
  if (value === '0') return 0;
  if (ch === '0') {
    if (value[1] === 'b') return sign * parseInt(value.slice(2), 2);
    if (value[1] === 'x') return sign * parseInt(value.slice(2), 16);
    if (value[1] === 'o') return sign * parseInt(value.slice(2), 8);
  }
  return sign * parseInt(value, 10);
}
function isInteger(object) {
  return Object.prototype.toString.call(object) === '[object Number]' && object % 1 === 0 && !common.isNegativeZero(object);
}
module.exports = new Type('tag:yaml.org,2002:int', {
  kind: 'scalar',
  resolve: resolveYamlInteger,
  construct: constructYamlInteger,
  predicate: isInteger,
  represent: {
    binary: function (obj) {
      return obj >= 0 ? '0b' + obj.toString(2) : '-0b' + obj.toString(2).slice(1);
    },
    octal: function (obj) {
      return obj >= 0 ? '0o' + obj.toString(8) : '-0o' + obj.toString(8).slice(1);
    },
    decimal: function (obj) {
      return obj.toString(10);
    },
    /* eslint-disable max-len */
    hexadecimal: function (obj) {
      return obj >= 0 ? '0x' + obj.toString(16).toUpperCase() : '-0x' + obj.toString(16).toUpperCase().slice(1);
    }
  },
  defaultStyle: 'decimal',
  styleAliases: {
    binary: [2, 'bin'],
    octal: [8, 'oct'],
    decimal: [10, 'dec'],
    hexadecimal: [16, 'hex']
  }
});

/***/ }),

/***/ 2955:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


var Type = __webpack_require__(666);
module.exports = new Type('tag:yaml.org,2002:map', {
  kind: 'mapping',
  construct: function (data) {
    return data !== null ? data : {};
  }
});

/***/ }),

/***/ 1997:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


var Type = __webpack_require__(666);
function resolveYamlMerge(data) {
  return data === '<<' || data === null;
}
module.exports = new Type('tag:yaml.org,2002:merge', {
  kind: 'scalar',
  resolve: resolveYamlMerge
});

/***/ }),

/***/ 5888:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


var Type = __webpack_require__(666);
function resolveYamlNull(data) {
  if (data === null) return true;
  var max = data.length;
  return max === 1 && data === '~' || max === 4 && (data === 'null' || data === 'Null' || data === 'NULL');
}
function constructYamlNull() {
  return null;
}
function isNull(object) {
  return object === null;
}
module.exports = new Type('tag:yaml.org,2002:null', {
  kind: 'scalar',
  resolve: resolveYamlNull,
  construct: constructYamlNull,
  predicate: isNull,
  represent: {
    canonical: function () {
      return '~';
    },
    lowercase: function () {
      return 'null';
    },
    uppercase: function () {
      return 'NULL';
    },
    camelcase: function () {
      return 'Null';
    },
    empty: function () {
      return '';
    }
  },
  defaultStyle: 'lowercase'
});

/***/ }),

/***/ 9564:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


var Type = __webpack_require__(666);
var _hasOwnProperty = Object.prototype.hasOwnProperty;
var _toString = Object.prototype.toString;
function resolveYamlOmap(data) {
  if (data === null) return true;
  var objectKeys = [],
    index,
    length,
    pair,
    pairKey,
    pairHasKey,
    object = data;
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    pairHasKey = false;
    if (_toString.call(pair) !== '[object Object]') return false;
    for (pairKey in pair) {
      if (_hasOwnProperty.call(pair, pairKey)) {
        if (!pairHasKey) pairHasKey = true;else return false;
      }
    }
    if (!pairHasKey) return false;
    if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);else return false;
  }
  return true;
}
function constructYamlOmap(data) {
  return data !== null ? data : [];
}
module.exports = new Type('tag:yaml.org,2002:omap', {
  kind: 'sequence',
  resolve: resolveYamlOmap,
  construct: constructYamlOmap
});

/***/ }),

/***/ 4792:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


var Type = __webpack_require__(666);
var _toString = Object.prototype.toString;
function resolveYamlPairs(data) {
  if (data === null) return true;
  var index,
    length,
    pair,
    keys,
    result,
    object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    if (_toString.call(pair) !== '[object Object]') return false;
    keys = Object.keys(pair);
    if (keys.length !== 1) return false;
    result[index] = [keys[0], pair[keys[0]]];
  }
  return true;
}
function constructYamlPairs(data) {
  if (data === null) return [];
  var index,
    length,
    pair,
    keys,
    result,
    object = data;
  result = new Array(object.length);
  for (index = 0, length = object.length; index < length; index += 1) {
    pair = object[index];
    keys = Object.keys(pair);
    result[index] = [keys[0], pair[keys[0]]];
  }
  return result;
}
module.exports = new Type('tag:yaml.org,2002:pairs', {
  kind: 'sequence',
  resolve: resolveYamlPairs,
  construct: constructYamlPairs
});

/***/ }),

/***/ 7322:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


var Type = __webpack_require__(666);
module.exports = new Type('tag:yaml.org,2002:seq', {
  kind: 'sequence',
  construct: function (data) {
    return data !== null ? data : [];
  }
});

/***/ }),

/***/ 3797:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


var Type = __webpack_require__(666);
var _hasOwnProperty = Object.prototype.hasOwnProperty;
function resolveYamlSet(data) {
  if (data === null) return true;
  var key,
    object = data;
  for (key in object) {
    if (_hasOwnProperty.call(object, key)) {
      if (object[key] !== null) return false;
    }
  }
  return true;
}
function constructYamlSet(data) {
  return data !== null ? data : {};
}
module.exports = new Type('tag:yaml.org,2002:set', {
  kind: 'mapping',
  resolve: resolveYamlSet,
  construct: constructYamlSet
});

/***/ }),

/***/ 5022:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


var Type = __webpack_require__(666);
module.exports = new Type('tag:yaml.org,2002:str', {
  kind: 'scalar',
  construct: function (data) {
    return data !== null ? data : '';
  }
});

/***/ }),

/***/ 6453:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


var Type = __webpack_require__(666);
var YAML_DATE_REGEXP = new RegExp('^([0-9][0-9][0-9][0-9])' +
// [1] year
'-([0-9][0-9])' +
// [2] month
'-([0-9][0-9])$'); // [3] day

var YAML_TIMESTAMP_REGEXP = new RegExp('^([0-9][0-9][0-9][0-9])' +
// [1] year
'-([0-9][0-9]?)' +
// [2] month
'-([0-9][0-9]?)' +
// [3] day
'(?:[Tt]|[ \\t]+)' +
// ...
'([0-9][0-9]?)' +
// [4] hour
':([0-9][0-9])' +
// [5] minute
':([0-9][0-9])' +
// [6] second
'(?:\\.([0-9]*))?' +
// [7] fraction
'(?:[ \\t]*(Z|([-+])([0-9][0-9]?)' +
// [8] tz [9] tz_sign [10] tz_hour
'(?::([0-9][0-9]))?))?$'); // [11] tz_minute

function resolveYamlTimestamp(data) {
  if (data === null) return false;
  if (YAML_DATE_REGEXP.exec(data) !== null) return true;
  if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
  return false;
}
function constructYamlTimestamp(data) {
  var match,
    year,
    month,
    day,
    hour,
    minute,
    second,
    fraction = 0,
    delta = null,
    tz_hour,
    tz_minute,
    date;
  match = YAML_DATE_REGEXP.exec(data);
  if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
  if (match === null) throw new Error('Date resolve error');

  // match: [1] year [2] month [3] day

  year = +match[1];
  month = +match[2] - 1; // JS month starts with 0
  day = +match[3];
  if (!match[4]) {
    // no hour
    return new Date(Date.UTC(year, month, day));
  }

  // match: [4] hour [5] minute [6] second [7] fraction

  hour = +match[4];
  minute = +match[5];
  second = +match[6];
  if (match[7]) {
    fraction = match[7].slice(0, 3);
    while (fraction.length < 3) {
      // milli-seconds
      fraction += '0';
    }
    fraction = +fraction;
  }

  // match: [8] tz [9] tz_sign [10] tz_hour [11] tz_minute

  if (match[9]) {
    tz_hour = +match[10];
    tz_minute = +(match[11] || 0);
    delta = (tz_hour * 60 + tz_minute) * 60000; // delta in mili-seconds
    if (match[9] === '-') delta = -delta;
  }
  date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
  if (delta) date.setTime(date.getTime() - delta);
  return date;
}
function representYamlTimestamp(object /*, style*/) {
  return object.toISOString();
}
module.exports = new Type('tag:yaml.org,2002:timestamp', {
  kind: 'scalar',
  resolve: resolveYamlTimestamp,
  construct: constructYamlTimestamp,
  instanceOf: Date,
  represent: representYamlTimestamp
});

/***/ }),

/***/ 6291:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const runtimeRequire =  true ? require : 0; // eslint-disable-line
if (typeof runtimeRequire.addon === 'function') {
  // if the platform supports native resolving prefer that
  module.exports = runtimeRequire.addon.bind(runtimeRequire);
} else {
  // else use the runtime version here
  module.exports = __webpack_require__(5711);
}

/***/ }),

/***/ 5711:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

var fs = __webpack_require__(9896);
var path = __webpack_require__(6928);
var os = __webpack_require__(857);

// Workaround to fix webpack's build warnings: 'the request of a dependency is an expression'
var runtimeRequire =  true ? require : 0; // eslint-disable-line

var vars = process.config && process.config.variables || {};
var prebuildsOnly = !!process.env.PREBUILDS_ONLY;
var abi = process.versions.modules; // TODO: support old node where this is undef
var runtime = isElectron() ? 'electron' : isNwjs() ? 'node-webkit' : 'node';
var arch = process.env.npm_config_arch || os.arch();
var platform = process.env.npm_config_platform || os.platform();
var libc = process.env.LIBC || (isAlpine(platform) ? 'musl' : 'glibc');
var armv = process.env.ARM_VERSION || (arch === 'arm64' ? '8' : vars.arm_version) || '';
var uv = (process.versions.uv || '').split('.')[0];
module.exports = load;
function load(dir) {
  return runtimeRequire(load.resolve(dir));
}
load.resolve = load.path = function (dir) {
  dir = path.resolve(dir || '.');
  try {
    var name = runtimeRequire(path.join(dir, 'package.json')).name.toUpperCase().replace(/-/g, '_');
    if (process.env[name + '_PREBUILD']) dir = process.env[name + '_PREBUILD'];
  } catch (err) {}
  if (!prebuildsOnly) {
    var release = getFirst(path.join(dir, 'build/Release'), matchBuild);
    if (release) return release;
    var debug = getFirst(path.join(dir, 'build/Debug'), matchBuild);
    if (debug) return debug;
  }
  var prebuild = resolve(dir);
  if (prebuild) return prebuild;
  var nearby = resolve(path.dirname(process.execPath));
  if (nearby) return nearby;
  var target = ['platform=' + platform, 'arch=' + arch, 'runtime=' + runtime, 'abi=' + abi, 'uv=' + uv, armv ? 'armv=' + armv : '', 'libc=' + libc, 'node=' + process.versions.node, process.versions.electron ? 'electron=' + process.versions.electron : '',  true ? 'webpack=true' : 0 // eslint-disable-line
  ].filter(Boolean).join(' ');
  throw new Error('No native build was found for ' + target + '\n    loaded from: ' + dir + '\n');
  function resolve(dir) {
    // Find matching "prebuilds/<platform>-<arch>" directory
    var tuples = readdirSync(path.join(dir, 'prebuilds')).map(parseTuple);
    var tuple = tuples.filter(matchTuple(platform, arch)).sort(compareTuples)[0];
    if (!tuple) return;

    // Find most specific flavor first
    var prebuilds = path.join(dir, 'prebuilds', tuple.name);
    var parsed = readdirSync(prebuilds).map(parseTags);
    var candidates = parsed.filter(matchTags(runtime, abi));
    var winner = candidates.sort(compareTags(runtime))[0];
    if (winner) return path.join(prebuilds, winner.file);
  }
};
function readdirSync(dir) {
  try {
    return fs.readdirSync(dir);
  } catch (err) {
    return [];
  }
}
function getFirst(dir, filter) {
  var files = readdirSync(dir).filter(filter);
  return files[0] && path.join(dir, files[0]);
}
function matchBuild(name) {
  return /\.node$/.test(name);
}
function parseTuple(name) {
  // Example: darwin-x64+arm64
  var arr = name.split('-');
  if (arr.length !== 2) return;
  var platform = arr[0];
  var architectures = arr[1].split('+');
  if (!platform) return;
  if (!architectures.length) return;
  if (!architectures.every(Boolean)) return;
  return {
    name,
    platform,
    architectures
  };
}
function matchTuple(platform, arch) {
  return function (tuple) {
    if (tuple == null) return false;
    if (tuple.platform !== platform) return false;
    return tuple.architectures.includes(arch);
  };
}
function compareTuples(a, b) {
  // Prefer single-arch prebuilds over multi-arch
  return a.architectures.length - b.architectures.length;
}
function parseTags(file) {
  var arr = file.split('.');
  var extension = arr.pop();
  var tags = {
    file: file,
    specificity: 0
  };
  if (extension !== 'node') return;
  for (var i = 0; i < arr.length; i++) {
    var tag = arr[i];
    if (tag === 'node' || tag === 'electron' || tag === 'node-webkit') {
      tags.runtime = tag;
    } else if (tag === 'napi') {
      tags.napi = true;
    } else if (tag.slice(0, 3) === 'abi') {
      tags.abi = tag.slice(3);
    } else if (tag.slice(0, 2) === 'uv') {
      tags.uv = tag.slice(2);
    } else if (tag.slice(0, 4) === 'armv') {
      tags.armv = tag.slice(4);
    } else if (tag === 'glibc' || tag === 'musl') {
      tags.libc = tag;
    } else {
      continue;
    }
    tags.specificity++;
  }
  return tags;
}
function matchTags(runtime, abi) {
  return function (tags) {
    if (tags == null) return false;
    if (tags.runtime && tags.runtime !== runtime && !runtimeAgnostic(tags)) return false;
    if (tags.abi && tags.abi !== abi && !tags.napi) return false;
    if (tags.uv && tags.uv !== uv) return false;
    if (tags.armv && tags.armv !== armv) return false;
    if (tags.libc && tags.libc !== libc) return false;
    return true;
  };
}
function runtimeAgnostic(tags) {
  return tags.runtime === 'node' && tags.napi;
}
function compareTags(runtime) {
  // Precedence: non-agnostic runtime, abi over napi, then by specificity.
  return function (a, b) {
    if (a.runtime !== b.runtime) {
      return a.runtime === runtime ? -1 : 1;
    } else if (a.abi !== b.abi) {
      return a.abi ? -1 : 1;
    } else if (a.specificity !== b.specificity) {
      return a.specificity > b.specificity ? -1 : 1;
    } else {
      return 0;
    }
  };
}
function isNwjs() {
  return !!(process.versions && process.versions.nw);
}
function isElectron() {
  if (process.versions && process.versions.electron) return true;
  if (process.env.ELECTRON_RUN_AS_NODE) return true;
  return typeof window !== 'undefined' && window.process && window.process.type === 'renderer';
}
function isAlpine(platform) {
  return platform === 'linux' && fs.existsSync('/etc/alpine-release');
}

// Exposed for unit tests
// TODO: move to lib
load.parseTags = parseTags;
load.matchTags = matchTags;
load.compareTags = compareTags;
load.parseTuple = parseTuple;
load.matchTuple = matchTuple;
load.compareTuples = compareTuples;

/***/ }),

/***/ 3859:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const root = (__webpack_require__(6928).join)(__dirname, "..", "..");
module.exports = __webpack_require__(6291)(root);
try {
  module.exports.nodeTypeInfo = __webpack_require__(3633);
} catch (_) {}

/***/ }),

/***/ 941:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const binding = __webpack_require__(6291)(__dirname);
const {
  Query,
  Parser,
  NodeMethods,
  Tree,
  TreeCursor,
  LookaheadIterator
} = binding;
const util = __webpack_require__(9023);

/*
 * Tree
 */

const {
  rootNode,
  rootNodeWithOffset,
  edit
} = Tree.prototype;
Object.defineProperty(Tree.prototype, 'rootNode', {
  get() {
    /*
      Due to a race condition arising from Jest's worker pool, "this"
      has no knowledge of the native extension if the extension has not
      yet loaded when multiple Jest tests are being run simultaneously.
      If the extension has correctly loaded, "this" should be an instance 
      of the class whose prototype we are acting on (in this case, Tree).
      Furthermore, the race condition sometimes results in the function in 
      question being undefined even when the context is correct, so we also 
      perform a null function check.
    */
    if (this instanceof Tree && rootNode) {
      return unmarshalNode(rootNode.call(this), this);
    }
  },
  // Jest worker pool may attempt to override property due to race condition,
  // we don't want to error on this
  configurable: true
});
Tree.prototype.rootNodeWithOffset = function (offset_bytes, offset_extent) {
  return unmarshalNode(rootNodeWithOffset.call(this, offset_bytes, offset_extent.row, offset_extent.column), this);
};
Tree.prototype.edit = function (arg) {
  if (this instanceof Tree && edit) {
    edit.call(this, arg.startPosition.row, arg.startPosition.column, arg.oldEndPosition.row, arg.oldEndPosition.column, arg.newEndPosition.row, arg.newEndPosition.column, arg.startIndex, arg.oldEndIndex, arg.newEndIndex);
  }
};
Tree.prototype.walk = function () {
  return this.rootNode.walk();
};

/*
 * Node
 */

class SyntaxNode {
  constructor(tree) {
    this.tree = tree;
  }
  [util.inspect.custom]() {
    return this.constructor.name + ' {\n' + '  type: ' + this.type + ',\n' + '  startPosition: ' + pointToString(this.startPosition) + ',\n' + '  endPosition: ' + pointToString(this.endPosition) + ',\n' + '  childCount: ' + this.childCount + ',\n' + '}';
  }
  get id() {
    marshalNode(this);
    return NodeMethods.id(this.tree);
  }
  get typeId() {
    marshalNode(this);
    return NodeMethods.typeId(this.tree);
  }
  get grammarId() {
    marshalNode(this);
    return NodeMethods.grammarId(this.tree);
  }
  get type() {
    marshalNode(this);
    return NodeMethods.type(this.tree);
  }
  get grammarType() {
    marshalNode(this);
    return NodeMethods.grammarType(this.tree);
  }
  get isExtra() {
    marshalNode(this);
    return NodeMethods.isExtra(this.tree);
  }
  get isNamed() {
    marshalNode(this);
    return NodeMethods.isNamed(this.tree);
  }
  get isMissing() {
    marshalNode(this);
    return NodeMethods.isMissing(this.tree);
  }
  get hasChanges() {
    marshalNode(this);
    return NodeMethods.hasChanges(this.tree);
  }
  get hasError() {
    marshalNode(this);
    return NodeMethods.hasError(this.tree);
  }
  get isError() {
    marshalNode(this);
    return NodeMethods.isError(this.tree);
  }
  get text() {
    return this.tree.getText(this);
  }
  get startPosition() {
    marshalNode(this);
    NodeMethods.startPosition(this.tree);
    return unmarshalPoint();
  }
  get endPosition() {
    marshalNode(this);
    NodeMethods.endPosition(this.tree);
    return unmarshalPoint();
  }
  get startIndex() {
    marshalNode(this);
    return NodeMethods.startIndex(this.tree);
  }
  get endIndex() {
    marshalNode(this);
    return NodeMethods.endIndex(this.tree);
  }
  get parent() {
    marshalNode(this);
    return unmarshalNode(NodeMethods.parent(this.tree), this.tree);
  }
  get children() {
    marshalNode(this);
    return unmarshalNodes(NodeMethods.children(this.tree), this.tree);
  }
  get namedChildren() {
    marshalNode(this);
    return unmarshalNodes(NodeMethods.namedChildren(this.tree), this.tree);
  }
  get childCount() {
    marshalNode(this);
    return NodeMethods.childCount(this.tree);
  }
  get namedChildCount() {
    marshalNode(this);
    return NodeMethods.namedChildCount(this.tree);
  }
  get firstChild() {
    marshalNode(this);
    return unmarshalNode(NodeMethods.firstChild(this.tree), this.tree);
  }
  get firstNamedChild() {
    marshalNode(this);
    return unmarshalNode(NodeMethods.firstNamedChild(this.tree), this.tree);
  }
  get lastChild() {
    marshalNode(this);
    return unmarshalNode(NodeMethods.lastChild(this.tree), this.tree);
  }
  get lastNamedChild() {
    marshalNode(this);
    return unmarshalNode(NodeMethods.lastNamedChild(this.tree), this.tree);
  }
  get nextSibling() {
    marshalNode(this);
    return unmarshalNode(NodeMethods.nextSibling(this.tree), this.tree);
  }
  get nextNamedSibling() {
    marshalNode(this);
    return unmarshalNode(NodeMethods.nextNamedSibling(this.tree), this.tree);
  }
  get previousSibling() {
    marshalNode(this);
    return unmarshalNode(NodeMethods.previousSibling(this.tree), this.tree);
  }
  get previousNamedSibling() {
    marshalNode(this);
    return unmarshalNode(NodeMethods.previousNamedSibling(this.tree), this.tree);
  }
  get parseState() {
    marshalNode(this);
    return NodeMethods.parseState(this.tree);
  }
  get nextParseState() {
    marshalNode(this);
    return NodeMethods.nextParseState(this.tree);
  }
  get descendantCount() {
    marshalNode(this);
    return NodeMethods.descendantCount(this.tree);
  }
  toString() {
    marshalNode(this);
    return NodeMethods.toString(this.tree);
  }
  child(index) {
    marshalNode(this);
    return unmarshalNode(NodeMethods.child(this.tree, index), this.tree);
  }
  namedChild(index) {
    marshalNode(this);
    return unmarshalNode(NodeMethods.namedChild(this.tree, index), this.tree);
  }
  childForFieldName(fieldName) {
    marshalNode(this);
    return unmarshalNode(NodeMethods.childForFieldName(this.tree, fieldName), this.tree);
  }
  childForFieldId(fieldId) {
    marshalNode(this);
    return unmarshalNode(NodeMethods.childForFieldId(this.tree, fieldId), this.tree);
  }
  fieldNameForChild(childIndex) {
    marshalNode(this);
    return NodeMethods.fieldNameForChild(this.tree, childIndex);
  }
  childrenForFieldName(fieldName) {
    marshalNode(this);
    return unmarshalNodes(NodeMethods.childrenForFieldName(this.tree, fieldName), this.tree);
  }
  childrenForFieldId(fieldId) {
    marshalNode(this);
    return unmarshalNodes(NodeMethods.childrenForFieldId(this.tree, fieldId), this.tree);
  }
  firstChildForIndex(index) {
    marshalNode(this);
    return unmarshalNode(NodeMethods.firstChildForIndex(this.tree, index), this.tree);
  }
  firstNamedChildForIndex(index) {
    marshalNode(this);
    return unmarshalNode(NodeMethods.firstNamedChildForIndex(this.tree, index), this.tree);
  }
  namedDescendantForIndex(start, end) {
    marshalNode(this);
    if (end == null) end = start;
    return unmarshalNode(NodeMethods.namedDescendantForIndex(this.tree, start, end), this.tree);
  }
  descendantForIndex(start, end) {
    marshalNode(this);
    if (end == null) end = start;
    return unmarshalNode(NodeMethods.descendantForIndex(this.tree, start, end), this.tree);
  }
  descendantsOfType(types, start, end) {
    marshalNode(this);
    if (typeof types === 'string') types = [types];
    return unmarshalNodes(NodeMethods.descendantsOfType(this.tree, types, start, end), this.tree);
  }
  namedDescendantForPosition(start, end) {
    marshalNode(this);
    if (end == null) end = start;
    return unmarshalNode(NodeMethods.namedDescendantForPosition(this.tree, start, end), this.tree);
  }
  descendantForPosition(start, end) {
    marshalNode(this);
    if (end == null) end = start;
    return unmarshalNode(NodeMethods.descendantForPosition(this.tree, start, end), this.tree);
  }
  closest(types) {
    marshalNode(this);
    if (typeof types === 'string') types = [types];
    return unmarshalNode(NodeMethods.closest(this.tree, types), this.tree);
  }
  walk() {
    marshalNode(this);
    const cursor = NodeMethods.walk(this.tree);
    cursor.tree = this.tree;
    unmarshalNode(cursor.currentNode, this.tree);
    return cursor;
  }
}

/*
 * Parser
 */

const {
  parse,
  setLanguage
} = Parser.prototype;
const languageSymbol = Symbol('parser.language');
Parser.prototype.setLanguage = function (language) {
  if (this instanceof Parser && setLanguage) {
    setLanguage.call(this, language);
  }
  this[languageSymbol] = language;
  if (!language.nodeSubclasses) {
    initializeLanguageNodeClasses(language);
  }
  return this;
};
Parser.prototype.getLanguage = function (_language) {
  return this[languageSymbol] || null;
};
Parser.prototype.parse = function (input, oldTree, {
  bufferSize,
  includedRanges
} = {}) {
  let getText,
    treeInput = input;
  if (typeof input === 'string') {
    const inputString = input;
    input = (offset, _position) => inputString.slice(offset);
    getText = getTextFromString;
  } else {
    getText = getTextFromFunction;
  }
  const tree = this instanceof Parser && parse ? parse.call(this, input, oldTree, bufferSize, includedRanges) : undefined;
  if (tree) {
    tree.input = treeInput;
    tree.getText = getText;
    tree.language = this.getLanguage();
  }
  return tree;
};

/*
 * TreeCursor
 */

const {
  startPosition,
  endPosition,
  currentNode
} = TreeCursor.prototype;
Object.defineProperties(TreeCursor.prototype, {
  currentNode: {
    get() {
      if (this instanceof TreeCursor && currentNode) {
        return unmarshalNode(currentNode.call(this), this.tree);
      }
    },
    configurable: true
  },
  startPosition: {
    get() {
      if (this instanceof TreeCursor && startPosition) {
        startPosition.call(this);
        return unmarshalPoint();
      }
    },
    configurable: true
  },
  endPosition: {
    get() {
      if (this instanceof TreeCursor && endPosition) {
        endPosition.call(this);
        return unmarshalPoint();
      }
    },
    configurable: true
  },
  nodeText: {
    get() {
      return this.tree.getText(this);
    },
    configurable: true
  }
});

/*
 * Query
 */

const {
  _matches,
  _captures
} = Query.prototype;
const PREDICATE_STEP_TYPE = {
  DONE: 0,
  CAPTURE: 1,
  STRING: 2
};
const ZERO_POINT = {
  row: 0,
  column: 0
};
Query.prototype._init = function () {
  /*
   * Initialize predicate functions
   * format: [type1, value1, type2, value2, ...]
   */
  const predicateDescriptions = this._getPredicates();
  const patternCount = predicateDescriptions.length;
  const setProperties = new Array(patternCount);
  const assertedProperties = new Array(patternCount);
  const refutedProperties = new Array(patternCount);
  const predicates = new Array(patternCount);
  const FIRST = 0;
  const SECOND = 2;
  const THIRD = 4;
  for (let i = 0; i < predicateDescriptions.length; i++) {
    predicates[i] = [];
    for (let j = 0; j < predicateDescriptions[i].length; j++) {
      const steps = predicateDescriptions[i][j];
      const stepsLength = steps.length / 2;
      if (steps[FIRST] !== PREDICATE_STEP_TYPE.STRING) {
        throw new Error('Predicates must begin with a literal value');
      }
      const operator = steps[FIRST + 1];
      let isPositive = true;
      let matchAll = true;
      let captureName;
      switch (operator) {
        case 'any-not-eq?':
        case 'not-eq?':
          isPositive = false;
        case 'any-eq?':
        case 'eq?':
          if (stepsLength !== 3) throw new Error(`Wrong number of arguments to \`#eq?\` predicate. Expected 2, got ${stepsLength - 1}`);
          if (steps[SECOND] !== PREDICATE_STEP_TYPE.CAPTURE) throw new Error(`First argument of \`#eq?\` predicate must be a capture. Got "${steps[SECOND + 1]}"`);
          matchAll = !operator.startsWith('any-');
          if (steps[THIRD] === PREDICATE_STEP_TYPE.CAPTURE) {
            const captureName1 = steps[SECOND + 1];
            const captureName2 = steps[THIRD + 1];
            predicates[i].push(function (captures) {
              let nodes_1 = [];
              let nodes_2 = [];
              for (const c of captures) {
                if (c.name === captureName1) nodes_1.push(c.node);
                if (c.name === captureName2) nodes_2.push(c.node);
              }
              let compare = (n1, n2, positive) => {
                return positive ? n1.text === n2.text : n1.text !== n2.text;
              };
              return matchAll ? nodes_1.every(n1 => nodes_2.some(n2 => compare(n1, n2, isPositive))) : nodes_1.some(n1 => nodes_2.some(n2 => compare(n1, n2, isPositive)));
            });
          } else {
            captureName = steps[SECOND + 1];
            const stringValue = steps[THIRD + 1];
            let matches = n => n.text === stringValue;
            let doesNotMatch = n => n.text !== stringValue;
            predicates[i].push(function (captures) {
              let nodes = [];
              for (const c of captures) {
                if (c.name === captureName) nodes.push(c.node);
              }
              let test = isPositive ? matches : doesNotMatch;
              return matchAll ? nodes.every(test) : nodes.some(test);
            });
          }
          break;
        case 'any-not-match?':
        case 'not-match?':
          isPositive = false;
        case 'any-match?':
        case 'match?':
          if (stepsLength !== 3) throw new Error(`Wrong number of arguments to \`#match?\` predicate. Expected 2, got ${stepsLength - 1}.`);
          if (steps[SECOND] !== PREDICATE_STEP_TYPE.CAPTURE) throw new Error(`First argument of \`#match?\` predicate must be a capture. Got "${steps[SECOND + 1]}".`);
          if (steps[THIRD] !== PREDICATE_STEP_TYPE.STRING) throw new Error(`Second argument of \`#match?\` predicate must be a string. Got @${steps[THIRD + 1]}.`);
          captureName = steps[SECOND + 1];
          const regex = new RegExp(steps[THIRD + 1]);
          matchAll = !operator.startsWith('any-');
          predicates[i].push(function (captures) {
            const nodes = [];
            for (const c of captures) {
              if (c.name === captureName) nodes.push(c.node.text);
            }
            let test = (text, positive) => {
              return positive ? regex.test(text) : !regex.test(text);
            };
            if (nodes.length === 0) return !isPositive;
            return matchAll ? nodes.every(text => test(text, isPositive)) : nodes.some(text => test(text, isPositive));
          });
          break;
        case 'set!':
          if (stepsLength < 2 || stepsLength > 3) throw new Error(`Wrong number of arguments to \`#set!\` predicate. Expected 1 or 2. Got ${stepsLength - 1}.`);
          if (steps.some((s, i) => i % 2 !== 1 && s !== PREDICATE_STEP_TYPE.STRING)) throw new Error(`Arguments to \`#set!\` predicate must be a strings.".`);
          if (!setProperties[i]) setProperties[i] = {};
          setProperties[i][steps[SECOND + 1]] = steps[THIRD] ? steps[THIRD + 1] : null;
          break;
        case 'is?':
        case 'is-not?':
          if (stepsLength < 2 || stepsLength > 3) throw new Error(`Wrong number of arguments to \`#${operator}\` predicate. Expected 1 or 2. Got ${stepsLength - 1}.`);
          if (steps.some((s, i) => i % 2 !== 1 && s !== PREDICATE_STEP_TYPE.STRING)) throw new Error(`Arguments to \`#${operator}\` predicate must be a strings.".`);
          const properties = operator === 'is?' ? assertedProperties : refutedProperties;
          if (!properties[i]) properties[i] = {};
          properties[i][steps[SECOND + 1]] = steps[THIRD] ? steps[THIRD + 1] : null;
          break;
        case 'not-any-of?':
          isPositive = false;
        case 'any-of?':
          if (stepsLength < 2) throw new Error(`Wrong number of arguments to \`#${operator}\` predicate. Expected at least 1. Got ${stepsLength - 1}.`);
          if (steps[SECOND] !== PREDICATE_STEP_TYPE.CAPTURE) throw new Error(`First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}".`);
          stringValues = [];
          for (let k = THIRD; k < 2 * stepsLength; k += 2) {
            if (steps[k] !== PREDICATE_STEP_TYPE.STRING) throw new Error(`Arguments to \`#${operator}\` predicate must be a strings.".`);
            stringValues.push(steps[k + 1]);
          }
          captureName = steps[SECOND + 1];
          predicates[i].push(function (captures) {
            const nodes = [];
            for (const c of captures) {
              if (c.name === captureName) nodes.push(c.node.text);
            }
            if (nodes.length === 0) return !isPositive;
            return nodes.every(text => stringValues.includes(text)) === isPositive;
          });
          break;
        default:
          throw new Error(`Unknown query predicate \`#${steps[FIRST + 1]}\``);
      }
    }
  }
  this.predicates = Object.freeze(predicates);
  this.setProperties = Object.freeze(setProperties);
  this.assertedProperties = Object.freeze(assertedProperties);
  this.refutedProperties = Object.freeze(refutedProperties);
};
Query.prototype.matches = function (node, {
  startPosition = ZERO_POINT,
  endPosition = ZERO_POINT,
  startIndex = 0,
  endIndex = 0,
  matchLimit = 0xFFFFFFFF,
  maxStartDepth = 0xFFFFFFFF
} = {}) {
  marshalNode(node);
  const [returnedMatches, returnedNodes] = _matches.call(this, node.tree, startPosition.row, startPosition.column, endPosition.row, endPosition.column, startIndex, endIndex, matchLimit, maxStartDepth);
  const nodes = unmarshalNodes(returnedNodes, node.tree);
  const results = [];
  let i = 0;
  let nodeIndex = 0;
  while (i < returnedMatches.length) {
    const patternIndex = returnedMatches[i++];
    const captures = [];
    while (i < returnedMatches.length && typeof returnedMatches[i] === 'string') {
      const captureName = returnedMatches[i++];
      captures.push({
        name: captureName,
        node: nodes[nodeIndex++]
      });
    }
    if (this.predicates[patternIndex].every(p => p(captures))) {
      const result = {
        pattern: patternIndex,
        captures
      };
      const setProperties = this.setProperties[patternIndex];
      const assertedProperties = this.assertedProperties[patternIndex];
      const refutedProperties = this.refutedProperties[patternIndex];
      if (setProperties) result.setProperties = setProperties;
      if (assertedProperties) result.assertedProperties = assertedProperties;
      if (refutedProperties) result.refutedProperties = refutedProperties;
      results.push(result);
    }
  }
  return results;
};
Query.prototype.captures = function (node, {
  startPosition = ZERO_POINT,
  endPosition = ZERO_POINT,
  startIndex = 0,
  endIndex = 0,
  matchLimit = 0xFFFFFFFF,
  maxStartDepth = 0xFFFFFFFF
} = {}) {
  marshalNode(node);
  const [returnedMatches, returnedNodes] = _captures.call(this, node.tree, startPosition.row, startPosition.column, endPosition.row, endPosition.column, startIndex, endIndex, matchLimit, maxStartDepth);
  const nodes = unmarshalNodes(returnedNodes, node.tree);
  const results = [];
  let i = 0;
  let nodeIndex = 0;
  while (i < returnedMatches.length) {
    const patternIndex = returnedMatches[i++];
    const captureIndex = returnedMatches[i++];
    const captures = [];
    while (i < returnedMatches.length && typeof returnedMatches[i] === 'string') {
      const captureName = returnedMatches[i++];
      captures.push({
        name: captureName,
        node: nodes[nodeIndex++]
      });
    }
    if (this.predicates[patternIndex].every(p => p(captures))) {
      const result = captures[captureIndex];
      const setProperties = this.setProperties[patternIndex];
      const assertedProperties = this.assertedProperties[patternIndex];
      const refutedProperties = this.refutedProperties[patternIndex];
      if (setProperties) result.setProperties = setProperties;
      if (assertedProperties) result.assertedProperties = assertedProperties;
      if (refutedProperties) result.refutedProperties = refutedProperties;
      results.push(result);
    }
  }
  return results;
};

/*
 * LookaheadIterator
 */

LookaheadIterator.prototype[Symbol.iterator] = function () {
  const self = this;
  return {
    next() {
      if (self._next()) {
        return {
          done: false,
          value: self.currentType
        };
      }
      return {
        done: true,
        value: ''
      };
    }
  };
};

/*
 * Other functions
 */

function getTextFromString(node) {
  return this.input.substring(node.startIndex, node.endIndex);
}
function getTextFromFunction({
  startIndex,
  endIndex
}) {
  const {
    input
  } = this;
  let result = '';
  const goalLength = endIndex - startIndex;
  while (result.length < goalLength) {
    const text = input(startIndex + result.length);
    result += text;
  }
  return result.slice(0, goalLength);
}
const {
  pointTransferArray
} = binding;
const NODE_FIELD_COUNT = 6;
const ERROR_TYPE_ID = 0xFFFF;
function getID(buffer, offset) {
  const low = BigInt(buffer[offset]);
  const high = BigInt(buffer[offset + 1]);
  return (high << 32n) + low;
}
function unmarshalNode(value, tree, offset = 0, cache = null) {
  /* case 1: node from the tree cache */
  if (typeof value === 'object') {
    const node = value;
    return node;
  }

  /* case 2: node being transferred */
  const nodeTypeId = value;
  const NodeClass = nodeTypeId === ERROR_TYPE_ID ? SyntaxNode : tree.language.nodeSubclasses[nodeTypeId];
  const {
    nodeTransferArray
  } = binding;
  const id = getID(nodeTransferArray, offset);
  if (id === 0n) {
    return null;
  }
  let cachedResult;
  if (cache && (cachedResult = cache.get(id))) return cachedResult;
  const result = new NodeClass(tree);
  for (let i = 0; i < NODE_FIELD_COUNT; i++) {
    result[i] = nodeTransferArray[offset + i];
  }
  if (cache) cache.set(id, result);else tree._cacheNode(result);
  return result;
}
function unmarshalNodes(nodes, tree) {
  const cache = new Map();
  let offset = 0;
  for (let i = 0, {
      length
    } = nodes; i < length; i++) {
    const node = unmarshalNode(nodes[i], tree, offset, cache);
    if (node !== nodes[i]) {
      nodes[i] = node;
      offset += NODE_FIELD_COUNT;
    }
  }
  tree._cacheNodes(Array.from(cache.values()));
  return nodes;
}
function marshalNode(node) {
  if (!(node.tree instanceof Tree)) {
    throw new TypeError("SyntaxNode must belong to a Tree");
  }
  const {
    nodeTransferArray
  } = binding;
  for (let i = 0; i < NODE_FIELD_COUNT; i++) {
    nodeTransferArray[i] = node[i];
  }
}
function unmarshalPoint() {
  return {
    row: pointTransferArray[0],
    column: pointTransferArray[1]
  };
}
function pointToString(point) {
  return `{row: ${point.row}, column: ${point.column}}`;
}
function initializeLanguageNodeClasses(language) {
  const nodeTypeNamesById = binding.getNodeTypeNamesById(language);
  const nodeFieldNamesById = binding.getNodeFieldNamesById(language);
  const nodeTypeInfo = language.nodeTypeInfo || [];
  const nodeSubclasses = [];
  for (let id = 0, n = nodeTypeNamesById.length; id < n; id++) {
    nodeSubclasses[id] = SyntaxNode;
    const typeName = nodeTypeNamesById[id];
    if (!typeName) continue;
    const typeInfo = nodeTypeInfo.find(info => info.named && info.type === typeName);
    if (!typeInfo) continue;
    const fieldNames = [];
    let classBody = '\n';
    if (typeInfo.fields) {
      for (const fieldName in typeInfo.fields) {
        const fieldId = nodeFieldNamesById.indexOf(fieldName);
        if (fieldId === -1) continue;
        if (typeInfo.fields[fieldName].multiple) {
          const getterName = camelCase(fieldName) + 'Nodes';
          fieldNames.push(getterName);
          classBody += `
            get ${getterName}() {
              marshalNode(this);
              return unmarshalNodes(NodeMethods.childNodesForFieldId(this.tree, ${fieldId}), this.tree);
            }
          `.replace(/\s+/g, ' ') + '\n';
        } else {
          const getterName = camelCase(fieldName, false) + 'Node';
          fieldNames.push(getterName);
          classBody += `
            get ${getterName}() {
              marshalNode(this);
              return unmarshalNode(NodeMethods.childNodeForFieldId(this.tree, ${fieldId}), this.tree);
            }
          `.replace(/\s+/g, ' ') + '\n';
        }
      }
    }
    const className = camelCase(typeName, true) + 'Node';
    const nodeSubclass = eval(`class ${className} extends SyntaxNode {${classBody}}; ${className}`);
    nodeSubclass.prototype.type = typeName;
    nodeSubclass.prototype.fields = Object.freeze(fieldNames.sort());
    nodeSubclasses[id] = nodeSubclass;
  }
  language.nodeSubclasses = nodeSubclasses;
}
function camelCase(name, upperCase) {
  name = name.replace(/_(\w)/g, (_match, letter) => letter.toUpperCase());
  if (upperCase) name = name[0].toUpperCase() + name.slice(1);
  return name;
}
module.exports = Parser;
module.exports.Query = Query;
module.exports.Tree = Tree;
module.exports.SyntaxNode = SyntaxNode;
module.exports.TreeCursor = TreeCursor;
module.exports.LookaheadIterator = LookaheadIterator;

/***/ }),

/***/ 6086:
/***/ ((module) => {

"use strict";


/**
 * Checks if a given buffer contains only correct UTF-8.
 * Ported from https://www.cl.cam.ac.uk/%7Emgk25/ucs/utf8_check.c by
 * Markus Kuhn.
 *
 * @param {Buffer} buf The buffer to check
 * @return {Boolean} `true` if `buf` contains only correct UTF-8, else `false`
 * @public
 */
function isValidUTF8(buf) {
  const len = buf.length;
  let i = 0;
  while (i < len) {
    if ((buf[i] & 0x80) === 0x00) {
      // 0xxxxxxx
      i++;
    } else if ((buf[i] & 0xe0) === 0xc0) {
      // 110xxxxx 10xxxxxx
      if (i + 1 === len || (buf[i + 1] & 0xc0) !== 0x80 || (buf[i] & 0xfe) === 0xc0 // overlong
      ) {
        return false;
      }
      i += 2;
    } else if ((buf[i] & 0xf0) === 0xe0) {
      // 1110xxxx 10xxxxxx 10xxxxxx
      if (i + 2 >= len || (buf[i + 1] & 0xc0) !== 0x80 || (buf[i + 2] & 0xc0) !== 0x80 || buf[i] === 0xe0 && (buf[i + 1] & 0xe0) === 0x80 ||
      // overlong
      buf[i] === 0xed && (buf[i + 1] & 0xe0) === 0xa0 // surrogate (U+D800 - U+DFFF)
      ) {
        return false;
      }
      i += 3;
    } else if ((buf[i] & 0xf8) === 0xf0) {
      // 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
      if (i + 3 >= len || (buf[i + 1] & 0xc0) !== 0x80 || (buf[i + 2] & 0xc0) !== 0x80 || (buf[i + 3] & 0xc0) !== 0x80 || buf[i] === 0xf0 && (buf[i + 1] & 0xf0) === 0x80 ||
      // overlong
      buf[i] === 0xf4 && buf[i + 1] > 0x8f || buf[i] > 0xf4 // > U+10FFFF
      ) {
        return false;
      }
      i += 4;
    } else {
      return false;
    }
  }
  return true;
}
module.exports = isValidUTF8;

/***/ }),

/***/ 2726:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


try {
  module.exports = __webpack_require__(6291)(__dirname);
} catch (e) {
  module.exports = __webpack_require__(6086);
}

/***/ }),

/***/ 1085:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


const WebSocket = __webpack_require__(6378);
WebSocket.createWebSocketStream = __webpack_require__(849);
WebSocket.Server = __webpack_require__(5612);
WebSocket.Receiver = __webpack_require__(8992);
WebSocket.Sender = __webpack_require__(6248);
WebSocket.WebSocket = WebSocket;
WebSocket.WebSocketServer = WebSocket.Server;
module.exports = WebSocket;

/***/ }),

/***/ 7992:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


const {
  EMPTY_BUFFER
} = __webpack_require__(6492);
const FastBuffer = Buffer[Symbol.species];

/**
 * Merges an array of buffers into a new buffer.
 *
 * @param {Buffer[]} list The array of buffers to concat
 * @param {Number} totalLength The total length of buffers in the list
 * @return {Buffer} The resulting buffer
 * @public
 */
function concat(list, totalLength) {
  if (list.length === 0) return EMPTY_BUFFER;
  if (list.length === 1) return list[0];
  const target = Buffer.allocUnsafe(totalLength);
  let offset = 0;
  for (let i = 0; i < list.length; i++) {
    const buf = list[i];
    target.set(buf, offset);
    offset += buf.length;
  }
  if (offset < totalLength) {
    return new FastBuffer(target.buffer, target.byteOffset, offset);
  }
  return target;
}

/**
 * Masks a buffer using the given mask.
 *
 * @param {Buffer} source The buffer to mask
 * @param {Buffer} mask The mask to use
 * @param {Buffer} output The buffer where to store the result
 * @param {Number} offset The offset at which to start writing
 * @param {Number} length The number of bytes to mask.
 * @public
 */
function _mask(source, mask, output, offset, length) {
  for (let i = 0; i < length; i++) {
    output[offset + i] = source[i] ^ mask[i & 3];
  }
}

/**
 * Unmasks a buffer using the given mask.
 *
 * @param {Buffer} buffer The buffer to unmask
 * @param {Buffer} mask The mask to use
 * @public
 */
function _unmask(buffer, mask) {
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] ^= mask[i & 3];
  }
}

/**
 * Converts a buffer to an `ArrayBuffer`.
 *
 * @param {Buffer} buf The buffer to convert
 * @return {ArrayBuffer} Converted buffer
 * @public
 */
function toArrayBuffer(buf) {
  if (buf.length === buf.buffer.byteLength) {
    return buf.buffer;
  }
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
}

/**
 * Converts `data` to a `Buffer`.
 *
 * @param {*} data The data to convert
 * @return {Buffer} The buffer
 * @throws {TypeError}
 * @public
 */
function toBuffer(data) {
  toBuffer.readOnly = true;
  if (Buffer.isBuffer(data)) return data;
  let buf;
  if (data instanceof ArrayBuffer) {
    buf = new FastBuffer(data);
  } else if (ArrayBuffer.isView(data)) {
    buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
  } else {
    buf = Buffer.from(data);
    toBuffer.readOnly = false;
  }
  return buf;
}
module.exports = {
  concat,
  mask: _mask,
  toArrayBuffer,
  toBuffer,
  unmask: _unmask
};

/* istanbul ignore else  */
if (!process.env.WS_NO_BUFFER_UTIL) {
  try {
    const bufferUtil = __webpack_require__(7893);
    module.exports.mask = function (source, mask, output, offset, length) {
      if (length < 48) _mask(source, mask, output, offset, length);else bufferUtil.mask(source, mask, output, offset, length);
    };
    module.exports.unmask = function (buffer, mask) {
      if (buffer.length < 32) _unmask(buffer, mask);else bufferUtil.unmask(buffer, mask);
    };
  } catch (e) {
    // Continue regardless of the error.
  }
}

/***/ }),

/***/ 6492:
/***/ ((module) => {

"use strict";


const BINARY_TYPES = ['nodebuffer', 'arraybuffer', 'fragments'];
const hasBlob = typeof Blob !== 'undefined';
if (hasBlob) BINARY_TYPES.push('blob');
module.exports = {
  BINARY_TYPES,
  EMPTY_BUFFER: Buffer.alloc(0),
  GUID: '258EAFA5-E914-47DA-95CA-C5AB0DC85B11',
  hasBlob,
  kForOnEventAttribute: Symbol('kIsForOnEventAttribute'),
  kListener: Symbol('kListener'),
  kStatusCode: Symbol('status-code'),
  kWebSocket: Symbol('websocket'),
  NOOP: () => {}
};

/***/ }),

/***/ 6535:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


const {
  kForOnEventAttribute,
  kListener
} = __webpack_require__(6492);
const kCode = Symbol('kCode');
const kData = Symbol('kData');
const kError = Symbol('kError');
const kMessage = Symbol('kMessage');
const kReason = Symbol('kReason');
const kTarget = Symbol('kTarget');
const kType = Symbol('kType');
const kWasClean = Symbol('kWasClean');

/**
 * Class representing an event.
 */
class Event {
  /**
   * Create a new `Event`.
   *
   * @param {String} type The name of the event
   * @throws {TypeError} If the `type` argument is not specified
   */
  constructor(type) {
    this[kTarget] = null;
    this[kType] = type;
  }

  /**
   * @type {*}
   */
  get target() {
    return this[kTarget];
  }

  /**
   * @type {String}
   */
  get type() {
    return this[kType];
  }
}
Object.defineProperty(Event.prototype, 'target', {
  enumerable: true
});
Object.defineProperty(Event.prototype, 'type', {
  enumerable: true
});

/**
 * Class representing a close event.
 *
 * @extends Event
 */
class CloseEvent extends Event {
  /**
   * Create a new `CloseEvent`.
   *
   * @param {String} type The name of the event
   * @param {Object} [options] A dictionary object that allows for setting
   *     attributes via object members of the same name
   * @param {Number} [options.code=0] The status code explaining why the
   *     connection was closed
   * @param {String} [options.reason=''] A human-readable string explaining why
   *     the connection was closed
   * @param {Boolean} [options.wasClean=false] Indicates whether or not the
   *     connection was cleanly closed
   */
  constructor(type, options = {}) {
    super(type);
    this[kCode] = options.code === undefined ? 0 : options.code;
    this[kReason] = options.reason === undefined ? '' : options.reason;
    this[kWasClean] = options.wasClean === undefined ? false : options.wasClean;
  }

  /**
   * @type {Number}
   */
  get code() {
    return this[kCode];
  }

  /**
   * @type {String}
   */
  get reason() {
    return this[kReason];
  }

  /**
   * @type {Boolean}
   */
  get wasClean() {
    return this[kWasClean];
  }
}
Object.defineProperty(CloseEvent.prototype, 'code', {
  enumerable: true
});
Object.defineProperty(CloseEvent.prototype, 'reason', {
  enumerable: true
});
Object.defineProperty(CloseEvent.prototype, 'wasClean', {
  enumerable: true
});

/**
 * Class representing an error event.
 *
 * @extends Event
 */
class ErrorEvent extends Event {
  /**
   * Create a new `ErrorEvent`.
   *
   * @param {String} type The name of the event
   * @param {Object} [options] A dictionary object that allows for setting
   *     attributes via object members of the same name
   * @param {*} [options.error=null] The error that generated this event
   * @param {String} [options.message=''] The error message
   */
  constructor(type, options = {}) {
    super(type);
    this[kError] = options.error === undefined ? null : options.error;
    this[kMessage] = options.message === undefined ? '' : options.message;
  }

  /**
   * @type {*}
   */
  get error() {
    return this[kError];
  }

  /**
   * @type {String}
   */
  get message() {
    return this[kMessage];
  }
}
Object.defineProperty(ErrorEvent.prototype, 'error', {
  enumerable: true
});
Object.defineProperty(ErrorEvent.prototype, 'message', {
  enumerable: true
});

/**
 * Class representing a message event.
 *
 * @extends Event
 */
class MessageEvent extends Event {
  /**
   * Create a new `MessageEvent`.
   *
   * @param {String} type The name of the event
   * @param {Object} [options] A dictionary object that allows for setting
   *     attributes via object members of the same name
   * @param {*} [options.data=null] The message content
   */
  constructor(type, options = {}) {
    super(type);
    this[kData] = options.data === undefined ? null : options.data;
  }

  /**
   * @type {*}
   */
  get data() {
    return this[kData];
  }
}
Object.defineProperty(MessageEvent.prototype, 'data', {
  enumerable: true
});

/**
 * This provides methods for emulating the `EventTarget` interface. It's not
 * meant to be used directly.
 *
 * @mixin
 */
const EventTarget = {
  /**
   * Register an event listener.
   *
   * @param {String} type A string representing the event type to listen for
   * @param {(Function|Object)} handler The listener to add
   * @param {Object} [options] An options object specifies characteristics about
   *     the event listener
   * @param {Boolean} [options.once=false] A `Boolean` indicating that the
   *     listener should be invoked at most once after being added. If `true`,
   *     the listener would be automatically removed when invoked.
   * @public
   */
  addEventListener(type, handler, options = {}) {
    for (const listener of this.listeners(type)) {
      if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
        return;
      }
    }
    let wrapper;
    if (type === 'message') {
      wrapper = function onMessage(data, isBinary) {
        const event = new MessageEvent('message', {
          data: isBinary ? data : data.toString()
        });
        event[kTarget] = this;
        callListener(handler, this, event);
      };
    } else if (type === 'close') {
      wrapper = function onClose(code, message) {
        const event = new CloseEvent('close', {
          code,
          reason: message.toString(),
          wasClean: this._closeFrameReceived && this._closeFrameSent
        });
        event[kTarget] = this;
        callListener(handler, this, event);
      };
    } else if (type === 'error') {
      wrapper = function onError(error) {
        const event = new ErrorEvent('error', {
          error,
          message: error.message
        });
        event[kTarget] = this;
        callListener(handler, this, event);
      };
    } else if (type === 'open') {
      wrapper = function onOpen() {
        const event = new Event('open');
        event[kTarget] = this;
        callListener(handler, this, event);
      };
    } else {
      return;
    }
    wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
    wrapper[kListener] = handler;
    if (options.once) {
      this.once(type, wrapper);
    } else {
      this.on(type, wrapper);
    }
  },
  /**
   * Remove an event listener.
   *
   * @param {String} type A string representing the event type to remove
   * @param {(Function|Object)} handler The listener to remove
   * @public
   */
  removeEventListener(type, handler) {
    for (const listener of this.listeners(type)) {
      if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
        this.removeListener(type, listener);
        break;
      }
    }
  }
};
module.exports = {
  CloseEvent,
  ErrorEvent,
  Event,
  EventTarget,
  MessageEvent
};

/**
 * Call an event listener
 *
 * @param {(Function|Object)} listener The listener to call
 * @param {*} thisArg The value to use as `this`` when calling the listener
 * @param {Event} event The event to pass to the listener
 * @private
 */
function callListener(listener, thisArg, event) {
  if (typeof listener === 'object' && listener.handleEvent) {
    listener.handleEvent.call(listener, event);
  } else {
    listener.call(thisArg, event);
  }
}

/***/ }),

/***/ 4252:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


const {
  tokenChars
} = __webpack_require__(3630);

/**
 * Adds an offer to the map of extension offers or a parameter to the map of
 * parameters.
 *
 * @param {Object} dest The map of extension offers or parameters
 * @param {String} name The extension or parameter name
 * @param {(Object|Boolean|String)} elem The extension parameters or the
 *     parameter value
 * @private
 */
function push(dest, name, elem) {
  if (dest[name] === undefined) dest[name] = [elem];else dest[name].push(elem);
}

/**
 * Parses the `Sec-WebSocket-Extensions` header into an object.
 *
 * @param {String} header The field value of the header
 * @return {Object} The parsed object
 * @public
 */
function parse(header) {
  const offers = Object.create(null);
  let params = Object.create(null);
  let mustUnescape = false;
  let isEscaping = false;
  let inQuotes = false;
  let extensionName;
  let paramName;
  let start = -1;
  let code = -1;
  let end = -1;
  let i = 0;
  for (; i < header.length; i++) {
    code = header.charCodeAt(i);
    if (extensionName === undefined) {
      if (end === -1 && tokenChars[code] === 1) {
        if (start === -1) start = i;
      } else if (i !== 0 && (code === 0x20 /* ' ' */ || code === 0x09) /* '\t' */) {
        if (end === -1 && start !== -1) end = i;
      } else if (code === 0x3b /* ';' */ || code === 0x2c /* ',' */) {
        if (start === -1) {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
        if (end === -1) end = i;
        const name = header.slice(start, end);
        if (code === 0x2c) {
          push(offers, name, params);
          params = Object.create(null);
        } else {
          extensionName = name;
        }
        start = end = -1;
      } else {
        throw new SyntaxError(`Unexpected character at index ${i}`);
      }
    } else if (paramName === undefined) {
      if (end === -1 && tokenChars[code] === 1) {
        if (start === -1) start = i;
      } else if (code === 0x20 || code === 0x09) {
        if (end === -1 && start !== -1) end = i;
      } else if (code === 0x3b || code === 0x2c) {
        if (start === -1) {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
        if (end === -1) end = i;
        push(params, header.slice(start, end), true);
        if (code === 0x2c) {
          push(offers, extensionName, params);
          params = Object.create(null);
          extensionName = undefined;
        }
        start = end = -1;
      } else if (code === 0x3d /* '=' */ && start !== -1 && end === -1) {
        paramName = header.slice(start, i);
        start = end = -1;
      } else {
        throw new SyntaxError(`Unexpected character at index ${i}`);
      }
    } else {
      //
      // The value of a quoted-string after unescaping must conform to the
      // token ABNF, so only token characters are valid.
      // Ref: https://tools.ietf.org/html/rfc6455#section-9.1
      //
      if (isEscaping) {
        if (tokenChars[code] !== 1) {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
        if (start === -1) start = i;else if (!mustUnescape) mustUnescape = true;
        isEscaping = false;
      } else if (inQuotes) {
        if (tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (code === 0x22 /* '"' */ && start !== -1) {
          inQuotes = false;
          end = i;
        } else if (code === 0x5c /* '\' */) {
          isEscaping = true;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      } else if (code === 0x22 && header.charCodeAt(i - 1) === 0x3d) {
        inQuotes = true;
      } else if (end === -1 && tokenChars[code] === 1) {
        if (start === -1) start = i;
      } else if (start !== -1 && (code === 0x20 || code === 0x09)) {
        if (end === -1) end = i;
      } else if (code === 0x3b || code === 0x2c) {
        if (start === -1) {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
        if (end === -1) end = i;
        let value = header.slice(start, end);
        if (mustUnescape) {
          value = value.replace(/\\/g, '');
          mustUnescape = false;
        }
        push(params, paramName, value);
        if (code === 0x2c) {
          push(offers, extensionName, params);
          params = Object.create(null);
          extensionName = undefined;
        }
        paramName = undefined;
        start = end = -1;
      } else {
        throw new SyntaxError(`Unexpected character at index ${i}`);
      }
    }
  }
  if (start === -1 || inQuotes || code === 0x20 || code === 0x09) {
    throw new SyntaxError('Unexpected end of input');
  }
  if (end === -1) end = i;
  const token = header.slice(start, end);
  if (extensionName === undefined) {
    push(offers, token, params);
  } else {
    if (paramName === undefined) {
      push(params, token, true);
    } else if (mustUnescape) {
      push(params, paramName, token.replace(/\\/g, ''));
    } else {
      push(params, paramName, token);
    }
    push(offers, extensionName, params);
  }
  return offers;
}

/**
 * Builds the `Sec-WebSocket-Extensions` header field value.
 *
 * @param {Object} extensions The map of extensions and parameters to format
 * @return {String} A string representing the given object
 * @public
 */
function format(extensions) {
  return Object.keys(extensions).map(extension => {
    let configurations = extensions[extension];
    if (!Array.isArray(configurations)) configurations = [configurations];
    return configurations.map(params => {
      return [extension].concat(Object.keys(params).map(k => {
        let values = params[k];
        if (!Array.isArray(values)) values = [values];
        return values.map(v => v === true ? k : `${k}=${v}`).join('; ');
      })).join('; ');
    }).join(', ');
  }).join(', ');
}
module.exports = {
  format,
  parse
};

/***/ }),

/***/ 9281:
/***/ ((module) => {

"use strict";


const kDone = Symbol('kDone');
const kRun = Symbol('kRun');

/**
 * A very simple job queue with adjustable concurrency. Adapted from
 * https://github.com/STRML/async-limiter
 */
class Limiter {
  /**
   * Creates a new `Limiter`.
   *
   * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
   *     to run concurrently
   */
  constructor(concurrency) {
    this[kDone] = () => {
      this.pending--;
      this[kRun]();
    };
    this.concurrency = concurrency || Infinity;
    this.jobs = [];
    this.pending = 0;
  }

  /**
   * Adds a job to the queue.
   *
   * @param {Function} job The job to run
   * @public
   */
  add(job) {
    this.jobs.push(job);
    this[kRun]();
  }

  /**
   * Removes a job from the queue and runs it if possible.
   *
   * @private
   */
  [kRun]() {
    if (this.pending === this.concurrency) return;
    if (this.jobs.length) {
      const job = this.jobs.shift();
      this.pending++;
      job(this[kDone]);
    }
  }
}
module.exports = Limiter;

/***/ }),

/***/ 9481:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


const zlib = __webpack_require__(3106);
const bufferUtil = __webpack_require__(7992);
const Limiter = __webpack_require__(9281);
const {
  kStatusCode
} = __webpack_require__(6492);
const FastBuffer = Buffer[Symbol.species];
const TRAILER = Buffer.from([0x00, 0x00, 0xff, 0xff]);
const kPerMessageDeflate = Symbol('permessage-deflate');
const kTotalLength = Symbol('total-length');
const kCallback = Symbol('callback');
const kBuffers = Symbol('buffers');
const kError = Symbol('error');

//
// We limit zlib concurrency, which prevents severe memory fragmentation
// as documented in https://github.com/nodejs/node/issues/8871#issuecomment-250915913
// and https://github.com/websockets/ws/issues/1202
//
// Intentionally global; it's the global thread pool that's an issue.
//
let zlibLimiter;

/**
 * permessage-deflate implementation.
 */
class PerMessageDeflate {
  /**
   * Creates a PerMessageDeflate instance.
   *
   * @param {Object} [options] Configuration options
   * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
   *     for, or request, a custom client window size
   * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
   *     acknowledge disabling of client context takeover
   * @param {Number} [options.concurrencyLimit=10] The number of concurrent
   *     calls to zlib
   * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
   *     use of a custom server window size
   * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
   *     disabling of server context takeover
   * @param {Number} [options.threshold=1024] Size (in bytes) below which
   *     messages should not be compressed if context takeover is disabled
   * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
   *     deflate
   * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
   *     inflate
   * @param {Boolean} [isServer=false] Create the instance in either server or
   *     client mode
   * @param {Number} [maxPayload=0] The maximum allowed message length
   */
  constructor(options, isServer, maxPayload) {
    this._maxPayload = maxPayload | 0;
    this._options = options || {};
    this._threshold = this._options.threshold !== undefined ? this._options.threshold : 1024;
    this._isServer = !!isServer;
    this._deflate = null;
    this._inflate = null;
    this.params = null;
    if (!zlibLimiter) {
      const concurrency = this._options.concurrencyLimit !== undefined ? this._options.concurrencyLimit : 10;
      zlibLimiter = new Limiter(concurrency);
    }
  }

  /**
   * @type {String}
   */
  static get extensionName() {
    return 'permessage-deflate';
  }

  /**
   * Create an extension negotiation offer.
   *
   * @return {Object} Extension parameters
   * @public
   */
  offer() {
    const params = {};
    if (this._options.serverNoContextTakeover) {
      params.server_no_context_takeover = true;
    }
    if (this._options.clientNoContextTakeover) {
      params.client_no_context_takeover = true;
    }
    if (this._options.serverMaxWindowBits) {
      params.server_max_window_bits = this._options.serverMaxWindowBits;
    }
    if (this._options.clientMaxWindowBits) {
      params.client_max_window_bits = this._options.clientMaxWindowBits;
    } else if (this._options.clientMaxWindowBits == null) {
      params.client_max_window_bits = true;
    }
    return params;
  }

  /**
   * Accept an extension negotiation offer/response.
   *
   * @param {Array} configurations The extension negotiation offers/reponse
   * @return {Object} Accepted configuration
   * @public
   */
  accept(configurations) {
    configurations = this.normalizeParams(configurations);
    this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
    return this.params;
  }

  /**
   * Releases all resources used by the extension.
   *
   * @public
   */
  cleanup() {
    if (this._inflate) {
      this._inflate.close();
      this._inflate = null;
    }
    if (this._deflate) {
      const callback = this._deflate[kCallback];
      this._deflate.close();
      this._deflate = null;
      if (callback) {
        callback(new Error('The deflate stream was closed while data was being processed'));
      }
    }
  }

  /**
   *  Accept an extension negotiation offer.
   *
   * @param {Array} offers The extension negotiation offers
   * @return {Object} Accepted configuration
   * @private
   */
  acceptAsServer(offers) {
    const opts = this._options;
    const accepted = offers.find(params => {
      if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === 'number' && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === 'number' && !params.client_max_window_bits) {
        return false;
      }
      return true;
    });
    if (!accepted) {
      throw new Error('None of the extension offers can be accepted');
    }
    if (opts.serverNoContextTakeover) {
      accepted.server_no_context_takeover = true;
    }
    if (opts.clientNoContextTakeover) {
      accepted.client_no_context_takeover = true;
    }
    if (typeof opts.serverMaxWindowBits === 'number') {
      accepted.server_max_window_bits = opts.serverMaxWindowBits;
    }
    if (typeof opts.clientMaxWindowBits === 'number') {
      accepted.client_max_window_bits = opts.clientMaxWindowBits;
    } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
      delete accepted.client_max_window_bits;
    }
    return accepted;
  }

  /**
   * Accept the extension negotiation response.
   *
   * @param {Array} response The extension negotiation response
   * @return {Object} Accepted configuration
   * @private
   */
  acceptAsClient(response) {
    const params = response[0];
    if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
      throw new Error('Unexpected parameter "client_no_context_takeover"');
    }
    if (!params.client_max_window_bits) {
      if (typeof this._options.clientMaxWindowBits === 'number') {
        params.client_max_window_bits = this._options.clientMaxWindowBits;
      }
    } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === 'number' && params.client_max_window_bits > this._options.clientMaxWindowBits) {
      throw new Error('Unexpected or invalid parameter "client_max_window_bits"');
    }
    return params;
  }

  /**
   * Normalize parameters.
   *
   * @param {Array} configurations The extension negotiation offers/reponse
   * @return {Array} The offers/response with normalized parameters
   * @private
   */
  normalizeParams(configurations) {
    configurations.forEach(params => {
      Object.keys(params).forEach(key => {
        let value = params[key];
        if (value.length > 1) {
          throw new Error(`Parameter "${key}" must have only a single value`);
        }
        value = value[0];
        if (key === 'client_max_window_bits') {
          if (value !== true) {
            const num = +value;
            if (!Number.isInteger(num) || num < 8 || num > 15) {
              throw new TypeError(`Invalid value for parameter "${key}": ${value}`);
            }
            value = num;
          } else if (!this._isServer) {
            throw new TypeError(`Invalid value for parameter "${key}": ${value}`);
          }
        } else if (key === 'server_max_window_bits') {
          const num = +value;
          if (!Number.isInteger(num) || num < 8 || num > 15) {
            throw new TypeError(`Invalid value for parameter "${key}": ${value}`);
          }
          value = num;
        } else if (key === 'client_no_context_takeover' || key === 'server_no_context_takeover') {
          if (value !== true) {
            throw new TypeError(`Invalid value for parameter "${key}": ${value}`);
          }
        } else {
          throw new Error(`Unknown parameter "${key}"`);
        }
        params[key] = value;
      });
    });
    return configurations;
  }

  /**
   * Decompress data. Concurrency limited.
   *
   * @param {Buffer} data Compressed data
   * @param {Boolean} fin Specifies whether or not this is the last fragment
   * @param {Function} callback Callback
   * @public
   */
  decompress(data, fin, callback) {
    zlibLimiter.add(done => {
      this._decompress(data, fin, (err, result) => {
        done();
        callback(err, result);
      });
    });
  }

  /**
   * Compress data. Concurrency limited.
   *
   * @param {(Buffer|String)} data Data to compress
   * @param {Boolean} fin Specifies whether or not this is the last fragment
   * @param {Function} callback Callback
   * @public
   */
  compress(data, fin, callback) {
    zlibLimiter.add(done => {
      this._compress(data, fin, (err, result) => {
        done();
        callback(err, result);
      });
    });
  }

  /**
   * Decompress data.
   *
   * @param {Buffer} data Compressed data
   * @param {Boolean} fin Specifies whether or not this is the last fragment
   * @param {Function} callback Callback
   * @private
   */
  _decompress(data, fin, callback) {
    const endpoint = this._isServer ? 'client' : 'server';
    if (!this._inflate) {
      const key = `${endpoint}_max_window_bits`;
      const windowBits = typeof this.params[key] !== 'number' ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
      this._inflate = zlib.createInflateRaw({
        ...this._options.zlibInflateOptions,
        windowBits
      });
      this._inflate[kPerMessageDeflate] = this;
      this._inflate[kTotalLength] = 0;
      this._inflate[kBuffers] = [];
      this._inflate.on('error', inflateOnError);
      this._inflate.on('data', inflateOnData);
    }
    this._inflate[kCallback] = callback;
    this._inflate.write(data);
    if (fin) this._inflate.write(TRAILER);
    this._inflate.flush(() => {
      const err = this._inflate[kError];
      if (err) {
        this._inflate.close();
        this._inflate = null;
        callback(err);
        return;
      }
      const data = bufferUtil.concat(this._inflate[kBuffers], this._inflate[kTotalLength]);
      if (this._inflate._readableState.endEmitted) {
        this._inflate.close();
        this._inflate = null;
      } else {
        this._inflate[kTotalLength] = 0;
        this._inflate[kBuffers] = [];
        if (fin && this.params[`${endpoint}_no_context_takeover`]) {
          this._inflate.reset();
        }
      }
      callback(null, data);
    });
  }

  /**
   * Compress data.
   *
   * @param {(Buffer|String)} data Data to compress
   * @param {Boolean} fin Specifies whether or not this is the last fragment
   * @param {Function} callback Callback
   * @private
   */
  _compress(data, fin, callback) {
    const endpoint = this._isServer ? 'server' : 'client';
    if (!this._deflate) {
      const key = `${endpoint}_max_window_bits`;
      const windowBits = typeof this.params[key] !== 'number' ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
      this._deflate = zlib.createDeflateRaw({
        ...this._options.zlibDeflateOptions,
        windowBits
      });
      this._deflate[kTotalLength] = 0;
      this._deflate[kBuffers] = [];
      this._deflate.on('data', deflateOnData);
    }
    this._deflate[kCallback] = callback;
    this._deflate.write(data);
    this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
      if (!this._deflate) {
        //
        // The deflate stream was closed while data was being processed.
        //
        return;
      }
      let data = bufferUtil.concat(this._deflate[kBuffers], this._deflate[kTotalLength]);
      if (fin) {
        data = new FastBuffer(data.buffer, data.byteOffset, data.length - 4);
      }

      //
      // Ensure that the callback will not be called again in
      // `PerMessageDeflate#cleanup()`.
      //
      this._deflate[kCallback] = null;
      this._deflate[kTotalLength] = 0;
      this._deflate[kBuffers] = [];
      if (fin && this.params[`${endpoint}_no_context_takeover`]) {
        this._deflate.reset();
      }
      callback(null, data);
    });
  }
}
module.exports = PerMessageDeflate;

/**
 * The listener of the `zlib.DeflateRaw` stream `'data'` event.
 *
 * @param {Buffer} chunk A chunk of data
 * @private
 */
function deflateOnData(chunk) {
  this[kBuffers].push(chunk);
  this[kTotalLength] += chunk.length;
}

/**
 * The listener of the `zlib.InflateRaw` stream `'data'` event.
 *
 * @param {Buffer} chunk A chunk of data
 * @private
 */
function inflateOnData(chunk) {
  this[kTotalLength] += chunk.length;
  if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
    this[kBuffers].push(chunk);
    return;
  }
  this[kError] = new RangeError('Max payload size exceeded');
  this[kError].code = 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH';
  this[kError][kStatusCode] = 1009;
  this.removeListener('data', inflateOnData);
  this.reset();
}

/**
 * The listener of the `zlib.InflateRaw` stream `'error'` event.
 *
 * @param {Error} err The emitted error
 * @private
 */
function inflateOnError(err) {
  //
  // There is no need to call `Zlib#close()` as the handle is automatically
  // closed when an error is emitted.
  //
  this[kPerMessageDeflate]._inflate = null;
  err[kStatusCode] = 1007;
  this[kCallback](err);
}

/***/ }),

/***/ 8992:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


const {
  Writable
} = __webpack_require__(2203);
const PerMessageDeflate = __webpack_require__(9481);
const {
  BINARY_TYPES,
  EMPTY_BUFFER,
  kStatusCode,
  kWebSocket
} = __webpack_require__(6492);
const {
  concat,
  toArrayBuffer,
  unmask
} = __webpack_require__(7992);
const {
  isValidStatusCode,
  isValidUTF8
} = __webpack_require__(3630);
const FastBuffer = Buffer[Symbol.species];
const GET_INFO = 0;
const GET_PAYLOAD_LENGTH_16 = 1;
const GET_PAYLOAD_LENGTH_64 = 2;
const GET_MASK = 3;
const GET_DATA = 4;
const INFLATING = 5;
const DEFER_EVENT = 6;

/**
 * HyBi Receiver implementation.
 *
 * @extends Writable
 */
class Receiver extends Writable {
  /**
   * Creates a Receiver instance.
   *
   * @param {Object} [options] Options object
   * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
   *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
   *     multiple times in the same tick
   * @param {String} [options.binaryType=nodebuffer] The type for binary data
   * @param {Object} [options.extensions] An object containing the negotiated
   *     extensions
   * @param {Boolean} [options.isServer=false] Specifies whether to operate in
   *     client or server mode
   * @param {Number} [options.maxPayload=0] The maximum allowed message length
   * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
   *     not to skip UTF-8 validation for text and close messages
   */
  constructor(options = {}) {
    super();
    this._allowSynchronousEvents = options.allowSynchronousEvents !== undefined ? options.allowSynchronousEvents : true;
    this._binaryType = options.binaryType || BINARY_TYPES[0];
    this._extensions = options.extensions || {};
    this._isServer = !!options.isServer;
    this._maxPayload = options.maxPayload | 0;
    this._skipUTF8Validation = !!options.skipUTF8Validation;
    this[kWebSocket] = undefined;
    this._bufferedBytes = 0;
    this._buffers = [];
    this._compressed = false;
    this._payloadLength = 0;
    this._mask = undefined;
    this._fragmented = 0;
    this._masked = false;
    this._fin = false;
    this._opcode = 0;
    this._totalPayloadLength = 0;
    this._messageLength = 0;
    this._fragments = [];
    this._errored = false;
    this._loop = false;
    this._state = GET_INFO;
  }

  /**
   * Implements `Writable.prototype._write()`.
   *
   * @param {Buffer} chunk The chunk of data to write
   * @param {String} encoding The character encoding of `chunk`
   * @param {Function} cb Callback
   * @private
   */
  _write(chunk, encoding, cb) {
    if (this._opcode === 0x08 && this._state == GET_INFO) return cb();
    this._bufferedBytes += chunk.length;
    this._buffers.push(chunk);
    this.startLoop(cb);
  }

  /**
   * Consumes `n` bytes from the buffered data.
   *
   * @param {Number} n The number of bytes to consume
   * @return {Buffer} The consumed bytes
   * @private
   */
  consume(n) {
    this._bufferedBytes -= n;
    if (n === this._buffers[0].length) return this._buffers.shift();
    if (n < this._buffers[0].length) {
      const buf = this._buffers[0];
      this._buffers[0] = new FastBuffer(buf.buffer, buf.byteOffset + n, buf.length - n);
      return new FastBuffer(buf.buffer, buf.byteOffset, n);
    }
    const dst = Buffer.allocUnsafe(n);
    do {
      const buf = this._buffers[0];
      const offset = dst.length - n;
      if (n >= buf.length) {
        dst.set(this._buffers.shift(), offset);
      } else {
        dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
        this._buffers[0] = new FastBuffer(buf.buffer, buf.byteOffset + n, buf.length - n);
      }
      n -= buf.length;
    } while (n > 0);
    return dst;
  }

  /**
   * Starts the parsing loop.
   *
   * @param {Function} cb Callback
   * @private
   */
  startLoop(cb) {
    this._loop = true;
    do {
      switch (this._state) {
        case GET_INFO:
          this.getInfo(cb);
          break;
        case GET_PAYLOAD_LENGTH_16:
          this.getPayloadLength16(cb);
          break;
        case GET_PAYLOAD_LENGTH_64:
          this.getPayloadLength64(cb);
          break;
        case GET_MASK:
          this.getMask();
          break;
        case GET_DATA:
          this.getData(cb);
          break;
        case INFLATING:
        case DEFER_EVENT:
          this._loop = false;
          return;
      }
    } while (this._loop);
    if (!this._errored) cb();
  }

  /**
   * Reads the first two bytes of a frame.
   *
   * @param {Function} cb Callback
   * @private
   */
  getInfo(cb) {
    if (this._bufferedBytes < 2) {
      this._loop = false;
      return;
    }
    const buf = this.consume(2);
    if ((buf[0] & 0x30) !== 0x00) {
      const error = this.createError(RangeError, 'RSV2 and RSV3 must be clear', true, 1002, 'WS_ERR_UNEXPECTED_RSV_2_3');
      cb(error);
      return;
    }
    const compressed = (buf[0] & 0x40) === 0x40;
    if (compressed && !this._extensions[PerMessageDeflate.extensionName]) {
      const error = this.createError(RangeError, 'RSV1 must be clear', true, 1002, 'WS_ERR_UNEXPECTED_RSV_1');
      cb(error);
      return;
    }
    this._fin = (buf[0] & 0x80) === 0x80;
    this._opcode = buf[0] & 0x0f;
    this._payloadLength = buf[1] & 0x7f;
    if (this._opcode === 0x00) {
      if (compressed) {
        const error = this.createError(RangeError, 'RSV1 must be clear', true, 1002, 'WS_ERR_UNEXPECTED_RSV_1');
        cb(error);
        return;
      }
      if (!this._fragmented) {
        const error = this.createError(RangeError, 'invalid opcode 0', true, 1002, 'WS_ERR_INVALID_OPCODE');
        cb(error);
        return;
      }
      this._opcode = this._fragmented;
    } else if (this._opcode === 0x01 || this._opcode === 0x02) {
      if (this._fragmented) {
        const error = this.createError(RangeError, `invalid opcode ${this._opcode}`, true, 1002, 'WS_ERR_INVALID_OPCODE');
        cb(error);
        return;
      }
      this._compressed = compressed;
    } else if (this._opcode > 0x07 && this._opcode < 0x0b) {
      if (!this._fin) {
        const error = this.createError(RangeError, 'FIN must be set', true, 1002, 'WS_ERR_EXPECTED_FIN');
        cb(error);
        return;
      }
      if (compressed) {
        const error = this.createError(RangeError, 'RSV1 must be clear', true, 1002, 'WS_ERR_UNEXPECTED_RSV_1');
        cb(error);
        return;
      }
      if (this._payloadLength > 0x7d || this._opcode === 0x08 && this._payloadLength === 1) {
        const error = this.createError(RangeError, `invalid payload length ${this._payloadLength}`, true, 1002, 'WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH');
        cb(error);
        return;
      }
    } else {
      const error = this.createError(RangeError, `invalid opcode ${this._opcode}`, true, 1002, 'WS_ERR_INVALID_OPCODE');
      cb(error);
      return;
    }
    if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
    this._masked = (buf[1] & 0x80) === 0x80;
    if (this._isServer) {
      if (!this._masked) {
        const error = this.createError(RangeError, 'MASK must be set', true, 1002, 'WS_ERR_EXPECTED_MASK');
        cb(error);
        return;
      }
    } else if (this._masked) {
      const error = this.createError(RangeError, 'MASK must be clear', true, 1002, 'WS_ERR_UNEXPECTED_MASK');
      cb(error);
      return;
    }
    if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;else this.haveLength(cb);
  }

  /**
   * Gets extended payload length (7+16).
   *
   * @param {Function} cb Callback
   * @private
   */
  getPayloadLength16(cb) {
    if (this._bufferedBytes < 2) {
      this._loop = false;
      return;
    }
    this._payloadLength = this.consume(2).readUInt16BE(0);
    this.haveLength(cb);
  }

  /**
   * Gets extended payload length (7+64).
   *
   * @param {Function} cb Callback
   * @private
   */
  getPayloadLength64(cb) {
    if (this._bufferedBytes < 8) {
      this._loop = false;
      return;
    }
    const buf = this.consume(8);
    const num = buf.readUInt32BE(0);

    //
    // The maximum safe integer in JavaScript is 2^53 - 1. An error is returned
    // if payload length is greater than this number.
    //
    if (num > Math.pow(2, 53 - 32) - 1) {
      const error = this.createError(RangeError, 'Unsupported WebSocket frame: payload length > 2^53 - 1', false, 1009, 'WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH');
      cb(error);
      return;
    }
    this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
    this.haveLength(cb);
  }

  /**
   * Payload length has been read.
   *
   * @param {Function} cb Callback
   * @private
   */
  haveLength(cb) {
    if (this._payloadLength && this._opcode < 0x08) {
      this._totalPayloadLength += this._payloadLength;
      if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
        const error = this.createError(RangeError, 'Max payload size exceeded', false, 1009, 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH');
        cb(error);
        return;
      }
    }
    if (this._masked) this._state = GET_MASK;else this._state = GET_DATA;
  }

  /**
   * Reads mask bytes.
   *
   * @private
   */
  getMask() {
    if (this._bufferedBytes < 4) {
      this._loop = false;
      return;
    }
    this._mask = this.consume(4);
    this._state = GET_DATA;
  }

  /**
   * Reads data bytes.
   *
   * @param {Function} cb Callback
   * @private
   */
  getData(cb) {
    let data = EMPTY_BUFFER;
    if (this._payloadLength) {
      if (this._bufferedBytes < this._payloadLength) {
        this._loop = false;
        return;
      }
      data = this.consume(this._payloadLength);
      if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
        unmask(data, this._mask);
      }
    }
    if (this._opcode > 0x07) {
      this.controlMessage(data, cb);
      return;
    }
    if (this._compressed) {
      this._state = INFLATING;
      this.decompress(data, cb);
      return;
    }
    if (data.length) {
      //
      // This message is not compressed so its length is the sum of the payload
      // length of all fragments.
      //
      this._messageLength = this._totalPayloadLength;
      this._fragments.push(data);
    }
    this.dataMessage(cb);
  }

  /**
   * Decompresses data.
   *
   * @param {Buffer} data Compressed data
   * @param {Function} cb Callback
   * @private
   */
  decompress(data, cb) {
    const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
    perMessageDeflate.decompress(data, this._fin, (err, buf) => {
      if (err) return cb(err);
      if (buf.length) {
        this._messageLength += buf.length;
        if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
          const error = this.createError(RangeError, 'Max payload size exceeded', false, 1009, 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH');
          cb(error);
          return;
        }
        this._fragments.push(buf);
      }
      this.dataMessage(cb);
      if (this._state === GET_INFO) this.startLoop(cb);
    });
  }

  /**
   * Handles a data message.
   *
   * @param {Function} cb Callback
   * @private
   */
  dataMessage(cb) {
    if (!this._fin) {
      this._state = GET_INFO;
      return;
    }
    const messageLength = this._messageLength;
    const fragments = this._fragments;
    this._totalPayloadLength = 0;
    this._messageLength = 0;
    this._fragmented = 0;
    this._fragments = [];
    if (this._opcode === 2) {
      let data;
      if (this._binaryType === 'nodebuffer') {
        data = concat(fragments, messageLength);
      } else if (this._binaryType === 'arraybuffer') {
        data = toArrayBuffer(concat(fragments, messageLength));
      } else if (this._binaryType === 'blob') {
        data = new Blob(fragments);
      } else {
        data = fragments;
      }
      if (this._allowSynchronousEvents) {
        this.emit('message', data, true);
        this._state = GET_INFO;
      } else {
        this._state = DEFER_EVENT;
        setImmediate(() => {
          this.emit('message', data, true);
          this._state = GET_INFO;
          this.startLoop(cb);
        });
      }
    } else {
      const buf = concat(fragments, messageLength);
      if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
        const error = this.createError(Error, 'invalid UTF-8 sequence', true, 1007, 'WS_ERR_INVALID_UTF8');
        cb(error);
        return;
      }
      if (this._state === INFLATING || this._allowSynchronousEvents) {
        this.emit('message', buf, false);
        this._state = GET_INFO;
      } else {
        this._state = DEFER_EVENT;
        setImmediate(() => {
          this.emit('message', buf, false);
          this._state = GET_INFO;
          this.startLoop(cb);
        });
      }
    }
  }

  /**
   * Handles a control message.
   *
   * @param {Buffer} data Data to handle
   * @return {(Error|RangeError|undefined)} A possible error
   * @private
   */
  controlMessage(data, cb) {
    if (this._opcode === 0x08) {
      if (data.length === 0) {
        this._loop = false;
        this.emit('conclude', 1005, EMPTY_BUFFER);
        this.end();
      } else {
        const code = data.readUInt16BE(0);
        if (!isValidStatusCode(code)) {
          const error = this.createError(RangeError, `invalid status code ${code}`, true, 1002, 'WS_ERR_INVALID_CLOSE_CODE');
          cb(error);
          return;
        }
        const buf = new FastBuffer(data.buffer, data.byteOffset + 2, data.length - 2);
        if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
          const error = this.createError(Error, 'invalid UTF-8 sequence', true, 1007, 'WS_ERR_INVALID_UTF8');
          cb(error);
          return;
        }
        this._loop = false;
        this.emit('conclude', code, buf);
        this.end();
      }
      this._state = GET_INFO;
      return;
    }
    if (this._allowSynchronousEvents) {
      this.emit(this._opcode === 0x09 ? 'ping' : 'pong', data);
      this._state = GET_INFO;
    } else {
      this._state = DEFER_EVENT;
      setImmediate(() => {
        this.emit(this._opcode === 0x09 ? 'ping' : 'pong', data);
        this._state = GET_INFO;
        this.startLoop(cb);
      });
    }
  }

  /**
   * Builds an error object.
   *
   * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
   * @param {String} message The error message
   * @param {Boolean} prefix Specifies whether or not to add a default prefix to
   *     `message`
   * @param {Number} statusCode The status code
   * @param {String} errorCode The exposed error code
   * @return {(Error|RangeError)} The error
   * @private
   */
  createError(ErrorCtor, message, prefix, statusCode, errorCode) {
    this._loop = false;
    this._errored = true;
    const err = new ErrorCtor(prefix ? `Invalid WebSocket frame: ${message}` : message);
    Error.captureStackTrace(err, this.createError);
    err.code = errorCode;
    err[kStatusCode] = statusCode;
    return err;
  }
}
module.exports = Receiver;

/***/ }),

/***/ 6248:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^Duplex" }] */



const {
  Duplex
} = __webpack_require__(2203);
const {
  randomFillSync
} = __webpack_require__(6982);
const PerMessageDeflate = __webpack_require__(9481);
const {
  EMPTY_BUFFER,
  kWebSocket,
  NOOP
} = __webpack_require__(6492);
const {
  isBlob,
  isValidStatusCode
} = __webpack_require__(3630);
const {
  mask: applyMask,
  toBuffer
} = __webpack_require__(7992);
const kByteLength = Symbol('kByteLength');
const maskBuffer = Buffer.alloc(4);
const RANDOM_POOL_SIZE = 8 * 1024;
let randomPool;
let randomPoolPointer = RANDOM_POOL_SIZE;
const DEFAULT = 0;
const DEFLATING = 1;
const GET_BLOB_DATA = 2;

/**
 * HyBi Sender implementation.
 */
class Sender {
  /**
   * Creates a Sender instance.
   *
   * @param {Duplex} socket The connection socket
   * @param {Object} [extensions] An object containing the negotiated extensions
   * @param {Function} [generateMask] The function used to generate the masking
   *     key
   */
  constructor(socket, extensions, generateMask) {
    this._extensions = extensions || {};
    if (generateMask) {
      this._generateMask = generateMask;
      this._maskBuffer = Buffer.alloc(4);
    }
    this._socket = socket;
    this._firstFragment = true;
    this._compress = false;
    this._bufferedBytes = 0;
    this._queue = [];
    this._state = DEFAULT;
    this.onerror = NOOP;
    this[kWebSocket] = undefined;
  }

  /**
   * Frames a piece of data according to the HyBi WebSocket protocol.
   *
   * @param {(Buffer|String)} data The data to frame
   * @param {Object} options Options object
   * @param {Boolean} [options.fin=false] Specifies whether or not to set the
   *     FIN bit
   * @param {Function} [options.generateMask] The function used to generate the
   *     masking key
   * @param {Boolean} [options.mask=false] Specifies whether or not to mask
   *     `data`
   * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
   *     key
   * @param {Number} options.opcode The opcode
   * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
   *     modified
   * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
   *     RSV1 bit
   * @return {(Buffer|String)[]} The framed data
   * @public
   */
  static frame(data, options) {
    let mask;
    let merge = false;
    let offset = 2;
    let skipMasking = false;
    if (options.mask) {
      mask = options.maskBuffer || maskBuffer;
      if (options.generateMask) {
        options.generateMask(mask);
      } else {
        if (randomPoolPointer === RANDOM_POOL_SIZE) {
          /* istanbul ignore else  */
          if (randomPool === undefined) {
            //
            // This is lazily initialized because server-sent frames must not
            // be masked so it may never be used.
            //
            randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
          }
          randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
          randomPoolPointer = 0;
        }
        mask[0] = randomPool[randomPoolPointer++];
        mask[1] = randomPool[randomPoolPointer++];
        mask[2] = randomPool[randomPoolPointer++];
        mask[3] = randomPool[randomPoolPointer++];
      }
      skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
      offset = 6;
    }
    let dataLength;
    if (typeof data === 'string') {
      if ((!options.mask || skipMasking) && options[kByteLength] !== undefined) {
        dataLength = options[kByteLength];
      } else {
        data = Buffer.from(data);
        dataLength = data.length;
      }
    } else {
      dataLength = data.length;
      merge = options.mask && options.readOnly && !skipMasking;
    }
    let payloadLength = dataLength;
    if (dataLength >= 65536) {
      offset += 8;
      payloadLength = 127;
    } else if (dataLength > 125) {
      offset += 2;
      payloadLength = 126;
    }
    const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
    target[0] = options.fin ? options.opcode | 0x80 : options.opcode;
    if (options.rsv1) target[0] |= 0x40;
    target[1] = payloadLength;
    if (payloadLength === 126) {
      target.writeUInt16BE(dataLength, 2);
    } else if (payloadLength === 127) {
      target[2] = target[3] = 0;
      target.writeUIntBE(dataLength, 4, 6);
    }
    if (!options.mask) return [target, data];
    target[1] |= 0x80;
    target[offset - 4] = mask[0];
    target[offset - 3] = mask[1];
    target[offset - 2] = mask[2];
    target[offset - 1] = mask[3];
    if (skipMasking) return [target, data];
    if (merge) {
      applyMask(data, mask, target, offset, dataLength);
      return [target];
    }
    applyMask(data, mask, data, 0, dataLength);
    return [target, data];
  }

  /**
   * Sends a close message to the other peer.
   *
   * @param {Number} [code] The status code component of the body
   * @param {(String|Buffer)} [data] The message component of the body
   * @param {Boolean} [mask=false] Specifies whether or not to mask the message
   * @param {Function} [cb] Callback
   * @public
   */
  close(code, data, mask, cb) {
    let buf;
    if (code === undefined) {
      buf = EMPTY_BUFFER;
    } else if (typeof code !== 'number' || !isValidStatusCode(code)) {
      throw new TypeError('First argument must be a valid error code number');
    } else if (data === undefined || !data.length) {
      buf = Buffer.allocUnsafe(2);
      buf.writeUInt16BE(code, 0);
    } else {
      const length = Buffer.byteLength(data);
      if (length > 123) {
        throw new RangeError('The message must not be greater than 123 bytes');
      }
      buf = Buffer.allocUnsafe(2 + length);
      buf.writeUInt16BE(code, 0);
      if (typeof data === 'string') {
        buf.write(data, 2);
      } else {
        buf.set(data, 2);
      }
    }
    const options = {
      [kByteLength]: buf.length,
      fin: true,
      generateMask: this._generateMask,
      mask,
      maskBuffer: this._maskBuffer,
      opcode: 0x08,
      readOnly: false,
      rsv1: false
    };
    if (this._state !== DEFAULT) {
      this.enqueue([this.dispatch, buf, false, options, cb]);
    } else {
      this.sendFrame(Sender.frame(buf, options), cb);
    }
  }

  /**
   * Sends a ping message to the other peer.
   *
   * @param {*} data The message to send
   * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
   * @param {Function} [cb] Callback
   * @public
   */
  ping(data, mask, cb) {
    let byteLength;
    let readOnly;
    if (typeof data === 'string') {
      byteLength = Buffer.byteLength(data);
      readOnly = false;
    } else if (isBlob(data)) {
      byteLength = data.size;
      readOnly = false;
    } else {
      data = toBuffer(data);
      byteLength = data.length;
      readOnly = toBuffer.readOnly;
    }
    if (byteLength > 125) {
      throw new RangeError('The data size must not be greater than 125 bytes');
    }
    const options = {
      [kByteLength]: byteLength,
      fin: true,
      generateMask: this._generateMask,
      mask,
      maskBuffer: this._maskBuffer,
      opcode: 0x09,
      readOnly,
      rsv1: false
    };
    if (isBlob(data)) {
      if (this._state !== DEFAULT) {
        this.enqueue([this.getBlobData, data, false, options, cb]);
      } else {
        this.getBlobData(data, false, options, cb);
      }
    } else if (this._state !== DEFAULT) {
      this.enqueue([this.dispatch, data, false, options, cb]);
    } else {
      this.sendFrame(Sender.frame(data, options), cb);
    }
  }

  /**
   * Sends a pong message to the other peer.
   *
   * @param {*} data The message to send
   * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
   * @param {Function} [cb] Callback
   * @public
   */
  pong(data, mask, cb) {
    let byteLength;
    let readOnly;
    if (typeof data === 'string') {
      byteLength = Buffer.byteLength(data);
      readOnly = false;
    } else if (isBlob(data)) {
      byteLength = data.size;
      readOnly = false;
    } else {
      data = toBuffer(data);
      byteLength = data.length;
      readOnly = toBuffer.readOnly;
    }
    if (byteLength > 125) {
      throw new RangeError('The data size must not be greater than 125 bytes');
    }
    const options = {
      [kByteLength]: byteLength,
      fin: true,
      generateMask: this._generateMask,
      mask,
      maskBuffer: this._maskBuffer,
      opcode: 0x0a,
      readOnly,
      rsv1: false
    };
    if (isBlob(data)) {
      if (this._state !== DEFAULT) {
        this.enqueue([this.getBlobData, data, false, options, cb]);
      } else {
        this.getBlobData(data, false, options, cb);
      }
    } else if (this._state !== DEFAULT) {
      this.enqueue([this.dispatch, data, false, options, cb]);
    } else {
      this.sendFrame(Sender.frame(data, options), cb);
    }
  }

  /**
   * Sends a data message to the other peer.
   *
   * @param {*} data The message to send
   * @param {Object} options Options object
   * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
   *     or text
   * @param {Boolean} [options.compress=false] Specifies whether or not to
   *     compress `data`
   * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
   *     last one
   * @param {Boolean} [options.mask=false] Specifies whether or not to mask
   *     `data`
   * @param {Function} [cb] Callback
   * @public
   */
  send(data, options, cb) {
    const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
    let opcode = options.binary ? 2 : 1;
    let rsv1 = options.compress;
    let byteLength;
    let readOnly;
    if (typeof data === 'string') {
      byteLength = Buffer.byteLength(data);
      readOnly = false;
    } else if (isBlob(data)) {
      byteLength = data.size;
      readOnly = false;
    } else {
      data = toBuffer(data);
      byteLength = data.length;
      readOnly = toBuffer.readOnly;
    }
    if (this._firstFragment) {
      this._firstFragment = false;
      if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? 'server_no_context_takeover' : 'client_no_context_takeover']) {
        rsv1 = byteLength >= perMessageDeflate._threshold;
      }
      this._compress = rsv1;
    } else {
      rsv1 = false;
      opcode = 0;
    }
    if (options.fin) this._firstFragment = true;
    const opts = {
      [kByteLength]: byteLength,
      fin: options.fin,
      generateMask: this._generateMask,
      mask: options.mask,
      maskBuffer: this._maskBuffer,
      opcode,
      readOnly,
      rsv1
    };
    if (isBlob(data)) {
      if (this._state !== DEFAULT) {
        this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
      } else {
        this.getBlobData(data, this._compress, opts, cb);
      }
    } else if (this._state !== DEFAULT) {
      this.enqueue([this.dispatch, data, this._compress, opts, cb]);
    } else {
      this.dispatch(data, this._compress, opts, cb);
    }
  }

  /**
   * Gets the contents of a blob as binary data.
   *
   * @param {Blob} blob The blob
   * @param {Boolean} [compress=false] Specifies whether or not to compress
   *     the data
   * @param {Object} options Options object
   * @param {Boolean} [options.fin=false] Specifies whether or not to set the
   *     FIN bit
   * @param {Function} [options.generateMask] The function used to generate the
   *     masking key
   * @param {Boolean} [options.mask=false] Specifies whether or not to mask
   *     `data`
   * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
   *     key
   * @param {Number} options.opcode The opcode
   * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
   *     modified
   * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
   *     RSV1 bit
   * @param {Function} [cb] Callback
   * @private
   */
  getBlobData(blob, compress, options, cb) {
    this._bufferedBytes += options[kByteLength];
    this._state = GET_BLOB_DATA;
    blob.arrayBuffer().then(arrayBuffer => {
      if (this._socket.destroyed) {
        const err = new Error('The socket was closed while the blob was being read');

        //
        // `callCallbacks` is called in the next tick to ensure that errors
        // that might be thrown in the callbacks behave like errors thrown
        // outside the promise chain.
        //
        process.nextTick(callCallbacks, this, err, cb);
        return;
      }
      this._bufferedBytes -= options[kByteLength];
      const data = toBuffer(arrayBuffer);
      if (!compress) {
        this._state = DEFAULT;
        this.sendFrame(Sender.frame(data, options), cb);
        this.dequeue();
      } else {
        this.dispatch(data, compress, options, cb);
      }
    }).catch(err => {
      //
      // `onError` is called in the next tick for the same reason that
      // `callCallbacks` above is.
      //
      process.nextTick(onError, this, err, cb);
    });
  }

  /**
   * Dispatches a message.
   *
   * @param {(Buffer|String)} data The message to send
   * @param {Boolean} [compress=false] Specifies whether or not to compress
   *     `data`
   * @param {Object} options Options object
   * @param {Boolean} [options.fin=false] Specifies whether or not to set the
   *     FIN bit
   * @param {Function} [options.generateMask] The function used to generate the
   *     masking key
   * @param {Boolean} [options.mask=false] Specifies whether or not to mask
   *     `data`
   * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
   *     key
   * @param {Number} options.opcode The opcode
   * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
   *     modified
   * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
   *     RSV1 bit
   * @param {Function} [cb] Callback
   * @private
   */
  dispatch(data, compress, options, cb) {
    if (!compress) {
      this.sendFrame(Sender.frame(data, options), cb);
      return;
    }
    const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
    this._bufferedBytes += options[kByteLength];
    this._state = DEFLATING;
    perMessageDeflate.compress(data, options.fin, (_, buf) => {
      if (this._socket.destroyed) {
        const err = new Error('The socket was closed while data was being compressed');
        callCallbacks(this, err, cb);
        return;
      }
      this._bufferedBytes -= options[kByteLength];
      this._state = DEFAULT;
      options.readOnly = false;
      this.sendFrame(Sender.frame(buf, options), cb);
      this.dequeue();
    });
  }

  /**
   * Executes queued send operations.
   *
   * @private
   */
  dequeue() {
    while (this._state === DEFAULT && this._queue.length) {
      const params = this._queue.shift();
      this._bufferedBytes -= params[3][kByteLength];
      Reflect.apply(params[0], this, params.slice(1));
    }
  }

  /**
   * Enqueues a send operation.
   *
   * @param {Array} params Send operation parameters.
   * @private
   */
  enqueue(params) {
    this._bufferedBytes += params[3][kByteLength];
    this._queue.push(params);
  }

  /**
   * Sends a frame.
   *
   * @param {Buffer[]} list The frame to send
   * @param {Function} [cb] Callback
   * @private
   */
  sendFrame(list, cb) {
    if (list.length === 2) {
      this._socket.cork();
      this._socket.write(list[0]);
      this._socket.write(list[1], cb);
      this._socket.uncork();
    } else {
      this._socket.write(list[0], cb);
    }
  }
}
module.exports = Sender;

/**
 * Calls queued callbacks with an error.
 *
 * @param {Sender} sender The `Sender` instance
 * @param {Error} err The error to call the callbacks with
 * @param {Function} [cb] The first callback
 * @private
 */
function callCallbacks(sender, err, cb) {
  if (typeof cb === 'function') cb(err);
  for (let i = 0; i < sender._queue.length; i++) {
    const params = sender._queue[i];
    const callback = params[params.length - 1];
    if (typeof callback === 'function') callback(err);
  }
}

/**
 * Handles a `Sender` error.
 *
 * @param {Sender} sender The `Sender` instance
 * @param {Error} err The error
 * @param {Function} [cb] The first pending callback
 * @private
 */
function onError(sender, err, cb) {
  callCallbacks(sender, err, cb);
  sender.onerror(err);
}

/***/ }),

/***/ 849:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


const {
  Duplex
} = __webpack_require__(2203);

/**
 * Emits the `'close'` event on a stream.
 *
 * @param {Duplex} stream The stream.
 * @private
 */
function emitClose(stream) {
  stream.emit('close');
}

/**
 * The listener of the `'end'` event.
 *
 * @private
 */
function duplexOnEnd() {
  if (!this.destroyed && this._writableState.finished) {
    this.destroy();
  }
}

/**
 * The listener of the `'error'` event.
 *
 * @param {Error} err The error
 * @private
 */
function duplexOnError(err) {
  this.removeListener('error', duplexOnError);
  this.destroy();
  if (this.listenerCount('error') === 0) {
    // Do not suppress the throwing behavior.
    this.emit('error', err);
  }
}

/**
 * Wraps a `WebSocket` in a duplex stream.
 *
 * @param {WebSocket} ws The `WebSocket` to wrap
 * @param {Object} [options] The options for the `Duplex` constructor
 * @return {Duplex} The duplex stream
 * @public
 */
function createWebSocketStream(ws, options) {
  let terminateOnDestroy = true;
  const duplex = new Duplex({
    ...options,
    autoDestroy: false,
    emitClose: false,
    objectMode: false,
    writableObjectMode: false
  });
  ws.on('message', function message(msg, isBinary) {
    const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
    if (!duplex.push(data)) ws.pause();
  });
  ws.once('error', function error(err) {
    if (duplex.destroyed) return;

    // Prevent `ws.terminate()` from being called by `duplex._destroy()`.
    //
    // - If the `'error'` event is emitted before the `'open'` event, then
    //   `ws.terminate()` is a noop as no socket is assigned.
    // - Otherwise, the error is re-emitted by the listener of the `'error'`
    //   event of the `Receiver` object. The listener already closes the
    //   connection by calling `ws.close()`. This allows a close frame to be
    //   sent to the other peer. If `ws.terminate()` is called right after this,
    //   then the close frame might not be sent.
    terminateOnDestroy = false;
    duplex.destroy(err);
  });
  ws.once('close', function close() {
    if (duplex.destroyed) return;
    duplex.push(null);
  });
  duplex._destroy = function (err, callback) {
    if (ws.readyState === ws.CLOSED) {
      callback(err);
      process.nextTick(emitClose, duplex);
      return;
    }
    let called = false;
    ws.once('error', function error(err) {
      called = true;
      callback(err);
    });
    ws.once('close', function close() {
      if (!called) callback(err);
      process.nextTick(emitClose, duplex);
    });
    if (terminateOnDestroy) ws.terminate();
  };
  duplex._final = function (callback) {
    if (ws.readyState === ws.CONNECTING) {
      ws.once('open', function open() {
        duplex._final(callback);
      });
      return;
    }

    // If the value of the `_socket` property is `null` it means that `ws` is a
    // client websocket and the handshake failed. In fact, when this happens, a
    // socket is never assigned to the websocket. Wait for the `'error'` event
    // that will be emitted by the websocket.
    if (ws._socket === null) return;
    if (ws._socket._writableState.finished) {
      callback();
      if (duplex._readableState.endEmitted) duplex.destroy();
    } else {
      ws._socket.once('finish', function finish() {
        // `duplex` is not destroyed here because the `'end'` event will be
        // emitted on `duplex` after this `'finish'` event. The EOF signaling
        // `null` chunk is, in fact, pushed when the websocket emits `'close'`.
        callback();
      });
      ws.close();
    }
  };
  duplex._read = function () {
    if (ws.isPaused) ws.resume();
  };
  duplex._write = function (chunk, encoding, callback) {
    if (ws.readyState === ws.CONNECTING) {
      ws.once('open', function open() {
        duplex._write(chunk, encoding, callback);
      });
      return;
    }
    ws.send(chunk, callback);
  };
  duplex.on('end', duplexOnEnd);
  duplex.on('error', duplexOnError);
  return duplex;
}
module.exports = createWebSocketStream;

/***/ }),

/***/ 3775:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


const {
  tokenChars
} = __webpack_require__(3630);

/**
 * Parses the `Sec-WebSocket-Protocol` header into a set of subprotocol names.
 *
 * @param {String} header The field value of the header
 * @return {Set} The subprotocol names
 * @public
 */
function parse(header) {
  const protocols = new Set();
  let start = -1;
  let end = -1;
  let i = 0;
  for (i; i < header.length; i++) {
    const code = header.charCodeAt(i);
    if (end === -1 && tokenChars[code] === 1) {
      if (start === -1) start = i;
    } else if (i !== 0 && (code === 0x20 /* ' ' */ || code === 0x09) /* '\t' */) {
      if (end === -1 && start !== -1) end = i;
    } else if (code === 0x2c /* ',' */) {
      if (start === -1) {
        throw new SyntaxError(`Unexpected character at index ${i}`);
      }
      if (end === -1) end = i;
      const protocol = header.slice(start, end);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      start = end = -1;
    } else {
      throw new SyntaxError(`Unexpected character at index ${i}`);
    }
  }
  if (start === -1 || end !== -1) {
    throw new SyntaxError('Unexpected end of input');
  }
  const protocol = header.slice(start, i);
  if (protocols.has(protocol)) {
    throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
  }
  protocols.add(protocol);
  return protocols;
}
module.exports = {
  parse
};

/***/ }),

/***/ 3630:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";


const {
  isUtf8
} = __webpack_require__(181);
const {
  hasBlob
} = __webpack_require__(6492);

//
// Allowed token characters:
//
// '!', '#', '$', '%', '&', ''', '*', '+', '-',
// '.', 0-9, A-Z, '^', '_', '`', a-z, '|', '~'
//
// tokenChars[32] === 0 // ' '
// tokenChars[33] === 1 // '!'
// tokenChars[34] === 0 // '"'
// ...
//
// prettier-ignore
const tokenChars = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
// 0 - 15
0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
// 16 - 31
0, 1, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 1, 1, 0,
// 32 - 47
1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0,
// 48 - 63
0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
// 64 - 79
1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1,
// 80 - 95
1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
// 96 - 111
1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0 // 112 - 127
];

/**
 * Checks if a status code is allowed in a close frame.
 *
 * @param {Number} code The status code
 * @return {Boolean} `true` if the status code is valid, else `false`
 * @public
 */
function isValidStatusCode(code) {
  return code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3000 && code <= 4999;
}

/**
 * Checks if a given buffer contains only correct UTF-8.
 * Ported from https://www.cl.cam.ac.uk/%7Emgk25/ucs/utf8_check.c by
 * Markus Kuhn.
 *
 * @param {Buffer} buf The buffer to check
 * @return {Boolean} `true` if `buf` contains only correct UTF-8, else `false`
 * @public
 */
function _isValidUTF8(buf) {
  const len = buf.length;
  let i = 0;
  while (i < len) {
    if ((buf[i] & 0x80) === 0) {
      // 0xxxxxxx
      i++;
    } else if ((buf[i] & 0xe0) === 0xc0) {
      // 110xxxxx 10xxxxxx
      if (i + 1 === len || (buf[i + 1] & 0xc0) !== 0x80 || (buf[i] & 0xfe) === 0xc0 // Overlong
      ) {
        return false;
      }
      i += 2;
    } else if ((buf[i] & 0xf0) === 0xe0) {
      // 1110xxxx 10xxxxxx 10xxxxxx
      if (i + 2 >= len || (buf[i + 1] & 0xc0) !== 0x80 || (buf[i + 2] & 0xc0) !== 0x80 || buf[i] === 0xe0 && (buf[i + 1] & 0xe0) === 0x80 ||
      // Overlong
      buf[i] === 0xed && (buf[i + 1] & 0xe0) === 0xa0 // Surrogate (U+D800 - U+DFFF)
      ) {
        return false;
      }
      i += 3;
    } else if ((buf[i] & 0xf8) === 0xf0) {
      // 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
      if (i + 3 >= len || (buf[i + 1] & 0xc0) !== 0x80 || (buf[i + 2] & 0xc0) !== 0x80 || (buf[i + 3] & 0xc0) !== 0x80 || buf[i] === 0xf0 && (buf[i + 1] & 0xf0) === 0x80 ||
      // Overlong
      buf[i] === 0xf4 && buf[i + 1] > 0x8f || buf[i] > 0xf4 // > U+10FFFF
      ) {
        return false;
      }
      i += 4;
    } else {
      return false;
    }
  }
  return true;
}

/**
 * Determines whether a value is a `Blob`.
 *
 * @param {*} value The value to be tested
 * @return {Boolean} `true` if `value` is a `Blob`, else `false`
 * @private
 */
function isBlob(value) {
  return hasBlob && typeof value === 'object' && typeof value.arrayBuffer === 'function' && typeof value.type === 'string' && typeof value.stream === 'function' && (value[Symbol.toStringTag] === 'Blob' || value[Symbol.toStringTag] === 'File');
}
module.exports = {
  isBlob,
  isValidStatusCode,
  isValidUTF8: _isValidUTF8,
  tokenChars
};
if (isUtf8) {
  module.exports.isValidUTF8 = function (buf) {
    return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
  };
} /* istanbul ignore else  */else if (!process.env.WS_NO_UTF_8_VALIDATE) {
  try {
    const isValidUTF8 = __webpack_require__(2726);
    module.exports.isValidUTF8 = function (buf) {
      return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
    };
  } catch (e) {
    // Continue regardless of the error.
  }
}

/***/ }),

/***/ 5612:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^Duplex$", "caughtErrors": "none" }] */



const EventEmitter = __webpack_require__(4434);
const http = __webpack_require__(8611);
const {
  Duplex
} = __webpack_require__(2203);
const {
  createHash
} = __webpack_require__(6982);
const extension = __webpack_require__(4252);
const PerMessageDeflate = __webpack_require__(9481);
const subprotocol = __webpack_require__(3775);
const WebSocket = __webpack_require__(6378);
const {
  GUID,
  kWebSocket
} = __webpack_require__(6492);
const keyRegex = /^[+/0-9A-Za-z]{22}==$/;
const RUNNING = 0;
const CLOSING = 1;
const CLOSED = 2;

/**
 * Class representing a WebSocket server.
 *
 * @extends EventEmitter
 */
class WebSocketServer extends EventEmitter {
  /**
   * Create a `WebSocketServer` instance.
   *
   * @param {Object} options Configuration options
   * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
   *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
   *     multiple times in the same tick
   * @param {Boolean} [options.autoPong=true] Specifies whether or not to
   *     automatically send a pong in response to a ping
   * @param {Number} [options.backlog=511] The maximum length of the queue of
   *     pending connections
   * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
   *     track clients
   * @param {Function} [options.handleProtocols] A hook to handle protocols
   * @param {String} [options.host] The hostname where to bind the server
   * @param {Number} [options.maxPayload=104857600] The maximum allowed message
   *     size
   * @param {Boolean} [options.noServer=false] Enable no server mode
   * @param {String} [options.path] Accept only connections matching this path
   * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
   *     permessage-deflate
   * @param {Number} [options.port] The port where to bind the server
   * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
   *     server to use
   * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
   *     not to skip UTF-8 validation for text and close messages
   * @param {Function} [options.verifyClient] A hook to reject connections
   * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
   *     class to use. It must be the `WebSocket` class or class that extends it
   * @param {Function} [callback] A listener for the `listening` event
   */
  constructor(options, callback) {
    super();
    options = {
      allowSynchronousEvents: true,
      autoPong: true,
      maxPayload: 100 * 1024 * 1024,
      skipUTF8Validation: false,
      perMessageDeflate: false,
      handleProtocols: null,
      clientTracking: true,
      verifyClient: null,
      noServer: false,
      backlog: null,
      // use default (511 as implemented in net.js)
      server: null,
      host: null,
      path: null,
      port: null,
      WebSocket,
      ...options
    };
    if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
      throw new TypeError('One and only one of the "port", "server", or "noServer" options ' + 'must be specified');
    }
    if (options.port != null) {
      this._server = http.createServer((req, res) => {
        const body = http.STATUS_CODES[426];
        res.writeHead(426, {
          'Content-Length': body.length,
          'Content-Type': 'text/plain'
        });
        res.end(body);
      });
      this._server.listen(options.port, options.host, options.backlog, callback);
    } else if (options.server) {
      this._server = options.server;
    }
    if (this._server) {
      const emitConnection = this.emit.bind(this, 'connection');
      this._removeListeners = addListeners(this._server, {
        listening: this.emit.bind(this, 'listening'),
        error: this.emit.bind(this, 'error'),
        upgrade: (req, socket, head) => {
          this.handleUpgrade(req, socket, head, emitConnection);
        }
      });
    }
    if (options.perMessageDeflate === true) options.perMessageDeflate = {};
    if (options.clientTracking) {
      this.clients = new Set();
      this._shouldEmitClose = false;
    }
    this.options = options;
    this._state = RUNNING;
  }

  /**
   * Returns the bound address, the address family name, and port of the server
   * as reported by the operating system if listening on an IP socket.
   * If the server is listening on a pipe or UNIX domain socket, the name is
   * returned as a string.
   *
   * @return {(Object|String|null)} The address of the server
   * @public
   */
  address() {
    if (this.options.noServer) {
      throw new Error('The server is operating in "noServer" mode');
    }
    if (!this._server) return null;
    return this._server.address();
  }

  /**
   * Stop the server from accepting new connections and emit the `'close'` event
   * when all existing connections are closed.
   *
   * @param {Function} [cb] A one-time listener for the `'close'` event
   * @public
   */
  close(cb) {
    if (this._state === CLOSED) {
      if (cb) {
        this.once('close', () => {
          cb(new Error('The server is not running'));
        });
      }
      process.nextTick(emitClose, this);
      return;
    }
    if (cb) this.once('close', cb);
    if (this._state === CLOSING) return;
    this._state = CLOSING;
    if (this.options.noServer || this.options.server) {
      if (this._server) {
        this._removeListeners();
        this._removeListeners = this._server = null;
      }
      if (this.clients) {
        if (!this.clients.size) {
          process.nextTick(emitClose, this);
        } else {
          this._shouldEmitClose = true;
        }
      } else {
        process.nextTick(emitClose, this);
      }
    } else {
      const server = this._server;
      this._removeListeners();
      this._removeListeners = this._server = null;

      //
      // The HTTP/S server was created internally. Close it, and rely on its
      // `'close'` event.
      //
      server.close(() => {
        emitClose(this);
      });
    }
  }

  /**
   * See if a given request should be handled by this server instance.
   *
   * @param {http.IncomingMessage} req Request object to inspect
   * @return {Boolean} `true` if the request is valid, else `false`
   * @public
   */
  shouldHandle(req) {
    if (this.options.path) {
      const index = req.url.indexOf('?');
      const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
      if (pathname !== this.options.path) return false;
    }
    return true;
  }

  /**
   * Handle a HTTP Upgrade request.
   *
   * @param {http.IncomingMessage} req The request object
   * @param {Duplex} socket The network socket between the server and client
   * @param {Buffer} head The first packet of the upgraded stream
   * @param {Function} cb Callback
   * @public
   */
  handleUpgrade(req, socket, head, cb) {
    socket.on('error', socketOnError);
    const key = req.headers['sec-websocket-key'];
    const upgrade = req.headers.upgrade;
    const version = +req.headers['sec-websocket-version'];
    if (req.method !== 'GET') {
      const message = 'Invalid HTTP method';
      abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
      return;
    }
    if (upgrade === undefined || upgrade.toLowerCase() !== 'websocket') {
      const message = 'Invalid Upgrade header';
      abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
      return;
    }
    if (key === undefined || !keyRegex.test(key)) {
      const message = 'Missing or invalid Sec-WebSocket-Key header';
      abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
      return;
    }
    if (version !== 8 && version !== 13) {
      const message = 'Missing or invalid Sec-WebSocket-Version header';
      abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
      return;
    }
    if (!this.shouldHandle(req)) {
      abortHandshake(socket, 400);
      return;
    }
    const secWebSocketProtocol = req.headers['sec-websocket-protocol'];
    let protocols = new Set();
    if (secWebSocketProtocol !== undefined) {
      try {
        protocols = subprotocol.parse(secWebSocketProtocol);
      } catch (err) {
        const message = 'Invalid Sec-WebSocket-Protocol header';
        abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
        return;
      }
    }
    const secWebSocketExtensions = req.headers['sec-websocket-extensions'];
    const extensions = {};
    if (this.options.perMessageDeflate && secWebSocketExtensions !== undefined) {
      const perMessageDeflate = new PerMessageDeflate(this.options.perMessageDeflate, true, this.options.maxPayload);
      try {
        const offers = extension.parse(secWebSocketExtensions);
        if (offers[PerMessageDeflate.extensionName]) {
          perMessageDeflate.accept(offers[PerMessageDeflate.extensionName]);
          extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
        }
      } catch (err) {
        const message = 'Invalid or unacceptable Sec-WebSocket-Extensions header';
        abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
        return;
      }
    }

    //
    // Optionally call external client verification handler.
    //
    if (this.options.verifyClient) {
      const info = {
        origin: req.headers[`${version === 8 ? 'sec-websocket-origin' : 'origin'}`],
        secure: !!(req.socket.authorized || req.socket.encrypted),
        req
      };
      if (this.options.verifyClient.length === 2) {
        this.options.verifyClient(info, (verified, code, message, headers) => {
          if (!verified) {
            return abortHandshake(socket, code || 401, message, headers);
          }
          this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
        });
        return;
      }
      if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
    }
    this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
  }

  /**
   * Upgrade the connection to WebSocket.
   *
   * @param {Object} extensions The accepted extensions
   * @param {String} key The value of the `Sec-WebSocket-Key` header
   * @param {Set} protocols The subprotocols
   * @param {http.IncomingMessage} req The request object
   * @param {Duplex} socket The network socket between the server and client
   * @param {Buffer} head The first packet of the upgraded stream
   * @param {Function} cb Callback
   * @throws {Error} If called more than once with the same socket
   * @private
   */
  completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
    //
    // Destroy the socket if the client has already sent a FIN packet.
    //
    if (!socket.readable || !socket.writable) return socket.destroy();
    if (socket[kWebSocket]) {
      throw new Error('server.handleUpgrade() was called more than once with the same ' + 'socket, possibly due to a misconfiguration');
    }
    if (this._state > RUNNING) return abortHandshake(socket, 503);
    const digest = createHash('sha1').update(key + GUID).digest('base64');
    const headers = ['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${digest}`];
    const ws = new this.options.WebSocket(null, undefined, this.options);
    if (protocols.size) {
      //
      // Optionally call external protocol selection handler.
      //
      const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
      if (protocol) {
        headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
        ws._protocol = protocol;
      }
    }
    if (extensions[PerMessageDeflate.extensionName]) {
      const params = extensions[PerMessageDeflate.extensionName].params;
      const value = extension.format({
        [PerMessageDeflate.extensionName]: [params]
      });
      headers.push(`Sec-WebSocket-Extensions: ${value}`);
      ws._extensions = extensions;
    }

    //
    // Allow external modification/inspection of handshake headers.
    //
    this.emit('headers', headers, req);
    socket.write(headers.concat('\r\n').join('\r\n'));
    socket.removeListener('error', socketOnError);
    ws.setSocket(socket, head, {
      allowSynchronousEvents: this.options.allowSynchronousEvents,
      maxPayload: this.options.maxPayload,
      skipUTF8Validation: this.options.skipUTF8Validation
    });
    if (this.clients) {
      this.clients.add(ws);
      ws.on('close', () => {
        this.clients.delete(ws);
        if (this._shouldEmitClose && !this.clients.size) {
          process.nextTick(emitClose, this);
        }
      });
    }
    cb(ws, req);
  }
}
module.exports = WebSocketServer;

/**
 * Add event listeners on an `EventEmitter` using a map of <event, listener>
 * pairs.
 *
 * @param {EventEmitter} server The event emitter
 * @param {Object.<String, Function>} map The listeners to add
 * @return {Function} A function that will remove the added listeners when
 *     called
 * @private
 */
function addListeners(server, map) {
  for (const event of Object.keys(map)) server.on(event, map[event]);
  return function removeListeners() {
    for (const event of Object.keys(map)) {
      server.removeListener(event, map[event]);
    }
  };
}

/**
 * Emit a `'close'` event on an `EventEmitter`.
 *
 * @param {EventEmitter} server The event emitter
 * @private
 */
function emitClose(server) {
  server._state = CLOSED;
  server.emit('close');
}

/**
 * Handle socket errors.
 *
 * @private
 */
function socketOnError() {
  this.destroy();
}

/**
 * Close the connection when preconditions are not fulfilled.
 *
 * @param {Duplex} socket The socket of the upgrade request
 * @param {Number} code The HTTP response status code
 * @param {String} [message] The HTTP response body
 * @param {Object} [headers] Additional HTTP response headers
 * @private
 */
function abortHandshake(socket, code, message, headers) {
  //
  // The socket is writable unless the user destroyed or ended it before calling
  // `server.handleUpgrade()` or in the `verifyClient` function, which is a user
  // error. Handling this does not make much sense as the worst that can happen
  // is that some of the data written by the user might be discarded due to the
  // call to `socket.end()` below, which triggers an `'error'` event that in
  // turn causes the socket to be destroyed.
  //
  message = message || http.STATUS_CODES[code];
  headers = {
    Connection: 'close',
    'Content-Type': 'text/html',
    'Content-Length': Buffer.byteLength(message),
    ...headers
  };
  socket.once('finish', socket.destroy);
  socket.end(`HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r\n` + Object.keys(headers).map(h => `${h}: ${headers[h]}`).join('\r\n') + '\r\n\r\n' + message);
}

/**
 * Emit a `'wsClientError'` event on a `WebSocketServer` if there is at least
 * one listener for it, otherwise call `abortHandshake()`.
 *
 * @param {WebSocketServer} server The WebSocket server
 * @param {http.IncomingMessage} req The request object
 * @param {Duplex} socket The socket of the upgrade request
 * @param {Number} code The HTTP response status code
 * @param {String} message The HTTP response body
 * @private
 */
function abortHandshakeOrEmitwsClientError(server, req, socket, code, message) {
  if (server.listenerCount('wsClientError')) {
    const err = new Error(message);
    Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
    server.emit('wsClientError', err, socket, req);
  } else {
    abortHandshake(socket, code, message);
  }
}

/***/ }),

/***/ 6378:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

"use strict";
/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^Duplex|Readable$", "caughtErrors": "none" }] */



const EventEmitter = __webpack_require__(4434);
const https = __webpack_require__(5692);
const http = __webpack_require__(8611);
const net = __webpack_require__(9278);
const tls = __webpack_require__(4756);
const {
  randomBytes,
  createHash
} = __webpack_require__(6982);
const {
  Duplex,
  Readable
} = __webpack_require__(2203);
const {
  URL
} = __webpack_require__(7016);
const PerMessageDeflate = __webpack_require__(9481);
const Receiver = __webpack_require__(8992);
const Sender = __webpack_require__(6248);
const {
  isBlob
} = __webpack_require__(3630);
const {
  BINARY_TYPES,
  EMPTY_BUFFER,
  GUID,
  kForOnEventAttribute,
  kListener,
  kStatusCode,
  kWebSocket,
  NOOP
} = __webpack_require__(6492);
const {
  EventTarget: {
    addEventListener,
    removeEventListener
  }
} = __webpack_require__(6535);
const {
  format,
  parse
} = __webpack_require__(4252);
const {
  toBuffer
} = __webpack_require__(7992);
const closeTimeout = 30 * 1000;
const kAborted = Symbol('kAborted');
const protocolVersions = [8, 13];
const readyStates = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
const subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;

/**
 * Class representing a WebSocket.
 *
 * @extends EventEmitter
 */
class WebSocket extends EventEmitter {
  /**
   * Create a new `WebSocket`.
   *
   * @param {(String|URL)} address The URL to which to connect
   * @param {(String|String[])} [protocols] The subprotocols
   * @param {Object} [options] Connection options
   */
  constructor(address, protocols, options) {
    super();
    this._binaryType = BINARY_TYPES[0];
    this._closeCode = 1006;
    this._closeFrameReceived = false;
    this._closeFrameSent = false;
    this._closeMessage = EMPTY_BUFFER;
    this._closeTimer = null;
    this._errorEmitted = false;
    this._extensions = {};
    this._paused = false;
    this._protocol = '';
    this._readyState = WebSocket.CONNECTING;
    this._receiver = null;
    this._sender = null;
    this._socket = null;
    if (address !== null) {
      this._bufferedAmount = 0;
      this._isServer = false;
      this._redirects = 0;
      if (protocols === undefined) {
        protocols = [];
      } else if (!Array.isArray(protocols)) {
        if (typeof protocols === 'object' && protocols !== null) {
          options = protocols;
          protocols = [];
        } else {
          protocols = [protocols];
        }
      }
      initAsClient(this, address, protocols, options);
    } else {
      this._autoPong = options.autoPong;
      this._isServer = true;
    }
  }

  /**
   * For historical reasons, the custom "nodebuffer" type is used by the default
   * instead of "blob".
   *
   * @type {String}
   */
  get binaryType() {
    return this._binaryType;
  }
  set binaryType(type) {
    if (!BINARY_TYPES.includes(type)) return;
    this._binaryType = type;

    //
    // Allow to change `binaryType` on the fly.
    //
    if (this._receiver) this._receiver._binaryType = type;
  }

  /**
   * @type {Number}
   */
  get bufferedAmount() {
    if (!this._socket) return this._bufferedAmount;
    return this._socket._writableState.length + this._sender._bufferedBytes;
  }

  /**
   * @type {String}
   */
  get extensions() {
    return Object.keys(this._extensions).join();
  }

  /**
   * @type {Boolean}
   */
  get isPaused() {
    return this._paused;
  }

  /**
   * @type {Function}
   */
  /* istanbul ignore next */
  get onclose() {
    return null;
  }

  /**
   * @type {Function}
   */
  /* istanbul ignore next */
  get onerror() {
    return null;
  }

  /**
   * @type {Function}
   */
  /* istanbul ignore next */
  get onopen() {
    return null;
  }

  /**
   * @type {Function}
   */
  /* istanbul ignore next */
  get onmessage() {
    return null;
  }

  /**
   * @type {String}
   */
  get protocol() {
    return this._protocol;
  }

  /**
   * @type {Number}
   */
  get readyState() {
    return this._readyState;
  }

  /**
   * @type {String}
   */
  get url() {
    return this._url;
  }

  /**
   * Set up the socket and the internal resources.
   *
   * @param {Duplex} socket The network socket between the server and client
   * @param {Buffer} head The first packet of the upgraded stream
   * @param {Object} options Options object
   * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
   *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
   *     multiple times in the same tick
   * @param {Function} [options.generateMask] The function used to generate the
   *     masking key
   * @param {Number} [options.maxPayload=0] The maximum allowed message size
   * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
   *     not to skip UTF-8 validation for text and close messages
   * @private
   */
  setSocket(socket, head, options) {
    const receiver = new Receiver({
      allowSynchronousEvents: options.allowSynchronousEvents,
      binaryType: this.binaryType,
      extensions: this._extensions,
      isServer: this._isServer,
      maxPayload: options.maxPayload,
      skipUTF8Validation: options.skipUTF8Validation
    });
    const sender = new Sender(socket, this._extensions, options.generateMask);
    this._receiver = receiver;
    this._sender = sender;
    this._socket = socket;
    receiver[kWebSocket] = this;
    sender[kWebSocket] = this;
    socket[kWebSocket] = this;
    receiver.on('conclude', receiverOnConclude);
    receiver.on('drain', receiverOnDrain);
    receiver.on('error', receiverOnError);
    receiver.on('message', receiverOnMessage);
    receiver.on('ping', receiverOnPing);
    receiver.on('pong', receiverOnPong);
    sender.onerror = senderOnError;

    //
    // These methods may not be available if `socket` is just a `Duplex`.
    //
    if (socket.setTimeout) socket.setTimeout(0);
    if (socket.setNoDelay) socket.setNoDelay();
    if (head.length > 0) socket.unshift(head);
    socket.on('close', socketOnClose);
    socket.on('data', socketOnData);
    socket.on('end', socketOnEnd);
    socket.on('error', socketOnError);
    this._readyState = WebSocket.OPEN;
    this.emit('open');
  }

  /**
   * Emit the `'close'` event.
   *
   * @private
   */
  emitClose() {
    if (!this._socket) {
      this._readyState = WebSocket.CLOSED;
      this.emit('close', this._closeCode, this._closeMessage);
      return;
    }
    if (this._extensions[PerMessageDeflate.extensionName]) {
      this._extensions[PerMessageDeflate.extensionName].cleanup();
    }
    this._receiver.removeAllListeners();
    this._readyState = WebSocket.CLOSED;
    this.emit('close', this._closeCode, this._closeMessage);
  }

  /**
   * Start a closing handshake.
   *
   *          +----------+   +-----------+   +----------+
   *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
   *    |     +----------+   +-----------+   +----------+     |
   *          +----------+   +-----------+         |
   * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
   *          +----------+   +-----------+   |
   *    |           |                        |   +---+        |
   *                +------------------------+-->|fin| - - - -
   *    |         +---+                      |   +---+
   *     - - - - -|fin|<---------------------+
   *              +---+
   *
   * @param {Number} [code] Status code explaining why the connection is closing
   * @param {(String|Buffer)} [data] The reason why the connection is
   *     closing
   * @public
   */
  close(code, data) {
    if (this.readyState === WebSocket.CLOSED) return;
    if (this.readyState === WebSocket.CONNECTING) {
      const msg = 'WebSocket was closed before the connection was established';
      abortHandshake(this, this._req, msg);
      return;
    }
    if (this.readyState === WebSocket.CLOSING) {
      if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
        this._socket.end();
      }
      return;
    }
    this._readyState = WebSocket.CLOSING;
    this._sender.close(code, data, !this._isServer, err => {
      //
      // This error is handled by the `'error'` listener on the socket. We only
      // want to know if the close frame has been sent here.
      //
      if (err) return;
      this._closeFrameSent = true;
      if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
        this._socket.end();
      }
    });
    setCloseTimer(this);
  }

  /**
   * Pause the socket.
   *
   * @public
   */
  pause() {
    if (this.readyState === WebSocket.CONNECTING || this.readyState === WebSocket.CLOSED) {
      return;
    }
    this._paused = true;
    this._socket.pause();
  }

  /**
   * Send a ping.
   *
   * @param {*} [data] The data to send
   * @param {Boolean} [mask] Indicates whether or not to mask `data`
   * @param {Function} [cb] Callback which is executed when the ping is sent
   * @public
   */
  ping(data, mask, cb) {
    if (this.readyState === WebSocket.CONNECTING) {
      throw new Error('WebSocket is not open: readyState 0 (CONNECTING)');
    }
    if (typeof data === 'function') {
      cb = data;
      data = mask = undefined;
    } else if (typeof mask === 'function') {
      cb = mask;
      mask = undefined;
    }
    if (typeof data === 'number') data = data.toString();
    if (this.readyState !== WebSocket.OPEN) {
      sendAfterClose(this, data, cb);
      return;
    }
    if (mask === undefined) mask = !this._isServer;
    this._sender.ping(data || EMPTY_BUFFER, mask, cb);
  }

  /**
   * Send a pong.
   *
   * @param {*} [data] The data to send
   * @param {Boolean} [mask] Indicates whether or not to mask `data`
   * @param {Function} [cb] Callback which is executed when the pong is sent
   * @public
   */
  pong(data, mask, cb) {
    if (this.readyState === WebSocket.CONNECTING) {
      throw new Error('WebSocket is not open: readyState 0 (CONNECTING)');
    }
    if (typeof data === 'function') {
      cb = data;
      data = mask = undefined;
    } else if (typeof mask === 'function') {
      cb = mask;
      mask = undefined;
    }
    if (typeof data === 'number') data = data.toString();
    if (this.readyState !== WebSocket.OPEN) {
      sendAfterClose(this, data, cb);
      return;
    }
    if (mask === undefined) mask = !this._isServer;
    this._sender.pong(data || EMPTY_BUFFER, mask, cb);
  }

  /**
   * Resume the socket.
   *
   * @public
   */
  resume() {
    if (this.readyState === WebSocket.CONNECTING || this.readyState === WebSocket.CLOSED) {
      return;
    }
    this._paused = false;
    if (!this._receiver._writableState.needDrain) this._socket.resume();
  }

  /**
   * Send a data message.
   *
   * @param {*} data The message to send
   * @param {Object} [options] Options object
   * @param {Boolean} [options.binary] Specifies whether `data` is binary or
   *     text
   * @param {Boolean} [options.compress] Specifies whether or not to compress
   *     `data`
   * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
   *     last one
   * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
   * @param {Function} [cb] Callback which is executed when data is written out
   * @public
   */
  send(data, options, cb) {
    if (this.readyState === WebSocket.CONNECTING) {
      throw new Error('WebSocket is not open: readyState 0 (CONNECTING)');
    }
    if (typeof options === 'function') {
      cb = options;
      options = {};
    }
    if (typeof data === 'number') data = data.toString();
    if (this.readyState !== WebSocket.OPEN) {
      sendAfterClose(this, data, cb);
      return;
    }
    const opts = {
      binary: typeof data !== 'string',
      mask: !this._isServer,
      compress: true,
      fin: true,
      ...options
    };
    if (!this._extensions[PerMessageDeflate.extensionName]) {
      opts.compress = false;
    }
    this._sender.send(data || EMPTY_BUFFER, opts, cb);
  }

  /**
   * Forcibly close the connection.
   *
   * @public
   */
  terminate() {
    if (this.readyState === WebSocket.CLOSED) return;
    if (this.readyState === WebSocket.CONNECTING) {
      const msg = 'WebSocket was closed before the connection was established';
      abortHandshake(this, this._req, msg);
      return;
    }
    if (this._socket) {
      this._readyState = WebSocket.CLOSING;
      this._socket.destroy();
    }
  }
}

/**
 * @constant {Number} CONNECTING
 * @memberof WebSocket
 */
Object.defineProperty(WebSocket, 'CONNECTING', {
  enumerable: true,
  value: readyStates.indexOf('CONNECTING')
});

/**
 * @constant {Number} CONNECTING
 * @memberof WebSocket.prototype
 */
Object.defineProperty(WebSocket.prototype, 'CONNECTING', {
  enumerable: true,
  value: readyStates.indexOf('CONNECTING')
});

/**
 * @constant {Number} OPEN
 * @memberof WebSocket
 */
Object.defineProperty(WebSocket, 'OPEN', {
  enumerable: true,
  value: readyStates.indexOf('OPEN')
});

/**
 * @constant {Number} OPEN
 * @memberof WebSocket.prototype
 */
Object.defineProperty(WebSocket.prototype, 'OPEN', {
  enumerable: true,
  value: readyStates.indexOf('OPEN')
});

/**
 * @constant {Number} CLOSING
 * @memberof WebSocket
 */
Object.defineProperty(WebSocket, 'CLOSING', {
  enumerable: true,
  value: readyStates.indexOf('CLOSING')
});

/**
 * @constant {Number} CLOSING
 * @memberof WebSocket.prototype
 */
Object.defineProperty(WebSocket.prototype, 'CLOSING', {
  enumerable: true,
  value: readyStates.indexOf('CLOSING')
});

/**
 * @constant {Number} CLOSED
 * @memberof WebSocket
 */
Object.defineProperty(WebSocket, 'CLOSED', {
  enumerable: true,
  value: readyStates.indexOf('CLOSED')
});

/**
 * @constant {Number} CLOSED
 * @memberof WebSocket.prototype
 */
Object.defineProperty(WebSocket.prototype, 'CLOSED', {
  enumerable: true,
  value: readyStates.indexOf('CLOSED')
});
['binaryType', 'bufferedAmount', 'extensions', 'isPaused', 'protocol', 'readyState', 'url'].forEach(property => {
  Object.defineProperty(WebSocket.prototype, property, {
    enumerable: true
  });
});

//
// Add the `onopen`, `onerror`, `onclose`, and `onmessage` attributes.
// See https://html.spec.whatwg.org/multipage/comms.html#the-websocket-interface
//
['open', 'error', 'close', 'message'].forEach(method => {
  Object.defineProperty(WebSocket.prototype, `on${method}`, {
    enumerable: true,
    get() {
      for (const listener of this.listeners(method)) {
        if (listener[kForOnEventAttribute]) return listener[kListener];
      }
      return null;
    },
    set(handler) {
      for (const listener of this.listeners(method)) {
        if (listener[kForOnEventAttribute]) {
          this.removeListener(method, listener);
          break;
        }
      }
      if (typeof handler !== 'function') return;
      this.addEventListener(method, handler, {
        [kForOnEventAttribute]: true
      });
    }
  });
});
WebSocket.prototype.addEventListener = addEventListener;
WebSocket.prototype.removeEventListener = removeEventListener;
module.exports = WebSocket;

/**
 * Initialize a WebSocket client.
 *
 * @param {WebSocket} websocket The client to initialize
 * @param {(String|URL)} address The URL to which to connect
 * @param {Array} protocols The subprotocols
 * @param {Object} [options] Connection options
 * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether any
 *     of the `'message'`, `'ping'`, and `'pong'` events can be emitted multiple
 *     times in the same tick
 * @param {Boolean} [options.autoPong=true] Specifies whether or not to
 *     automatically send a pong in response to a ping
 * @param {Function} [options.finishRequest] A function which can be used to
 *     customize the headers of each http request before it is sent
 * @param {Boolean} [options.followRedirects=false] Whether or not to follow
 *     redirects
 * @param {Function} [options.generateMask] The function used to generate the
 *     masking key
 * @param {Number} [options.handshakeTimeout] Timeout in milliseconds for the
 *     handshake request
 * @param {Number} [options.maxPayload=104857600] The maximum allowed message
 *     size
 * @param {Number} [options.maxRedirects=10] The maximum number of redirects
 *     allowed
 * @param {String} [options.origin] Value of the `Origin` or
 *     `Sec-WebSocket-Origin` header
 * @param {(Boolean|Object)} [options.perMessageDeflate=true] Enable/disable
 *     permessage-deflate
 * @param {Number} [options.protocolVersion=13] Value of the
 *     `Sec-WebSocket-Version` header
 * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
 *     not to skip UTF-8 validation for text and close messages
 * @private
 */
function initAsClient(websocket, address, protocols, options) {
  const opts = {
    allowSynchronousEvents: true,
    autoPong: true,
    protocolVersion: protocolVersions[1],
    maxPayload: 100 * 1024 * 1024,
    skipUTF8Validation: false,
    perMessageDeflate: true,
    followRedirects: false,
    maxRedirects: 10,
    ...options,
    socketPath: undefined,
    hostname: undefined,
    protocol: undefined,
    timeout: undefined,
    method: 'GET',
    host: undefined,
    path: undefined,
    port: undefined
  };
  websocket._autoPong = opts.autoPong;
  if (!protocolVersions.includes(opts.protocolVersion)) {
    throw new RangeError(`Unsupported protocol version: ${opts.protocolVersion} ` + `(supported versions: ${protocolVersions.join(', ')})`);
  }
  let parsedUrl;
  if (address instanceof URL) {
    parsedUrl = address;
  } else {
    try {
      parsedUrl = new URL(address);
    } catch (e) {
      throw new SyntaxError(`Invalid URL: ${address}`);
    }
  }
  if (parsedUrl.protocol === 'http:') {
    parsedUrl.protocol = 'ws:';
  } else if (parsedUrl.protocol === 'https:') {
    parsedUrl.protocol = 'wss:';
  }
  websocket._url = parsedUrl.href;
  const isSecure = parsedUrl.protocol === 'wss:';
  const isIpcUrl = parsedUrl.protocol === 'ws+unix:';
  let invalidUrlMessage;
  if (parsedUrl.protocol !== 'ws:' && !isSecure && !isIpcUrl) {
    invalidUrlMessage = 'The URL\'s protocol must be one of "ws:", "wss:", ' + '"http:", "https", or "ws+unix:"';
  } else if (isIpcUrl && !parsedUrl.pathname) {
    invalidUrlMessage = "The URL's pathname is empty";
  } else if (parsedUrl.hash) {
    invalidUrlMessage = 'The URL contains a fragment identifier';
  }
  if (invalidUrlMessage) {
    const err = new SyntaxError(invalidUrlMessage);
    if (websocket._redirects === 0) {
      throw err;
    } else {
      emitErrorAndClose(websocket, err);
      return;
    }
  }
  const defaultPort = isSecure ? 443 : 80;
  const key = randomBytes(16).toString('base64');
  const request = isSecure ? https.request : http.request;
  const protocolSet = new Set();
  let perMessageDeflate;
  opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
  opts.defaultPort = opts.defaultPort || defaultPort;
  opts.port = parsedUrl.port || defaultPort;
  opts.host = parsedUrl.hostname.startsWith('[') ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
  opts.headers = {
    ...opts.headers,
    'Sec-WebSocket-Version': opts.protocolVersion,
    'Sec-WebSocket-Key': key,
    Connection: 'Upgrade',
    Upgrade: 'websocket'
  };
  opts.path = parsedUrl.pathname + parsedUrl.search;
  opts.timeout = opts.handshakeTimeout;
  if (opts.perMessageDeflate) {
    perMessageDeflate = new PerMessageDeflate(opts.perMessageDeflate !== true ? opts.perMessageDeflate : {}, false, opts.maxPayload);
    opts.headers['Sec-WebSocket-Extensions'] = format({
      [PerMessageDeflate.extensionName]: perMessageDeflate.offer()
    });
  }
  if (protocols.length) {
    for (const protocol of protocols) {
      if (typeof protocol !== 'string' || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
        throw new SyntaxError('An invalid or duplicated subprotocol was specified');
      }
      protocolSet.add(protocol);
    }
    opts.headers['Sec-WebSocket-Protocol'] = protocols.join(',');
  }
  if (opts.origin) {
    if (opts.protocolVersion < 13) {
      opts.headers['Sec-WebSocket-Origin'] = opts.origin;
    } else {
      opts.headers.Origin = opts.origin;
    }
  }
  if (parsedUrl.username || parsedUrl.password) {
    opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
  }
  if (isIpcUrl) {
    const parts = opts.path.split(':');
    opts.socketPath = parts[0];
    opts.path = parts[1];
  }
  let req;
  if (opts.followRedirects) {
    if (websocket._redirects === 0) {
      websocket._originalIpc = isIpcUrl;
      websocket._originalSecure = isSecure;
      websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
      const headers = options && options.headers;

      //
      // Shallow copy the user provided options so that headers can be changed
      // without mutating the original object.
      //
      options = {
        ...options,
        headers: {}
      };
      if (headers) {
        for (const [key, value] of Object.entries(headers)) {
          options.headers[key.toLowerCase()] = value;
        }
      }
    } else if (websocket.listenerCount('redirect') === 0) {
      const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
      if (!isSameHost || websocket._originalSecure && !isSecure) {
        //
        // Match curl 7.77.0 behavior and drop the following headers. These
        // headers are also dropped when following a redirect to a subdomain.
        //
        delete opts.headers.authorization;
        delete opts.headers.cookie;
        if (!isSameHost) delete opts.headers.host;
        opts.auth = undefined;
      }
    }

    //
    // Match curl 7.77.0 behavior and make the first `Authorization` header win.
    // If the `Authorization` header is set, then there is nothing to do as it
    // will take precedence.
    //
    if (opts.auth && !options.headers.authorization) {
      options.headers.authorization = 'Basic ' + Buffer.from(opts.auth).toString('base64');
    }
    req = websocket._req = request(opts);
    if (websocket._redirects) {
      //
      // Unlike what is done for the `'upgrade'` event, no early exit is
      // triggered here if the user calls `websocket.close()` or
      // `websocket.terminate()` from a listener of the `'redirect'` event. This
      // is because the user can also call `request.destroy()` with an error
      // before calling `websocket.close()` or `websocket.terminate()` and this
      // would result in an error being emitted on the `request` object with no
      // `'error'` event listeners attached.
      //
      websocket.emit('redirect', websocket.url, req);
    }
  } else {
    req = websocket._req = request(opts);
  }
  if (opts.timeout) {
    req.on('timeout', () => {
      abortHandshake(websocket, req, 'Opening handshake has timed out');
    });
  }
  req.on('error', err => {
    if (req === null || req[kAborted]) return;
    req = websocket._req = null;
    emitErrorAndClose(websocket, err);
  });
  req.on('response', res => {
    const location = res.headers.location;
    const statusCode = res.statusCode;
    if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
      if (++websocket._redirects > opts.maxRedirects) {
        abortHandshake(websocket, req, 'Maximum redirects exceeded');
        return;
      }
      req.abort();
      let addr;
      try {
        addr = new URL(location, address);
      } catch (e) {
        const err = new SyntaxError(`Invalid URL: ${location}`);
        emitErrorAndClose(websocket, err);
        return;
      }
      initAsClient(websocket, addr, protocols, options);
    } else if (!websocket.emit('unexpected-response', req, res)) {
      abortHandshake(websocket, req, `Unexpected server response: ${res.statusCode}`);
    }
  });
  req.on('upgrade', (res, socket, head) => {
    websocket.emit('upgrade', res);

    //
    // The user may have closed the connection from a listener of the
    // `'upgrade'` event.
    //
    if (websocket.readyState !== WebSocket.CONNECTING) return;
    req = websocket._req = null;
    const upgrade = res.headers.upgrade;
    if (upgrade === undefined || upgrade.toLowerCase() !== 'websocket') {
      abortHandshake(websocket, socket, 'Invalid Upgrade header');
      return;
    }
    const digest = createHash('sha1').update(key + GUID).digest('base64');
    if (res.headers['sec-websocket-accept'] !== digest) {
      abortHandshake(websocket, socket, 'Invalid Sec-WebSocket-Accept header');
      return;
    }
    const serverProt = res.headers['sec-websocket-protocol'];
    let protError;
    if (serverProt !== undefined) {
      if (!protocolSet.size) {
        protError = 'Server sent a subprotocol but none was requested';
      } else if (!protocolSet.has(serverProt)) {
        protError = 'Server sent an invalid subprotocol';
      }
    } else if (protocolSet.size) {
      protError = 'Server sent no subprotocol';
    }
    if (protError) {
      abortHandshake(websocket, socket, protError);
      return;
    }
    if (serverProt) websocket._protocol = serverProt;
    const secWebSocketExtensions = res.headers['sec-websocket-extensions'];
    if (secWebSocketExtensions !== undefined) {
      if (!perMessageDeflate) {
        const message = 'Server sent a Sec-WebSocket-Extensions header but no extension ' + 'was requested';
        abortHandshake(websocket, socket, message);
        return;
      }
      let extensions;
      try {
        extensions = parse(secWebSocketExtensions);
      } catch (err) {
        const message = 'Invalid Sec-WebSocket-Extensions header';
        abortHandshake(websocket, socket, message);
        return;
      }
      const extensionNames = Object.keys(extensions);
      if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate.extensionName) {
        const message = 'Server indicated an extension that was not requested';
        abortHandshake(websocket, socket, message);
        return;
      }
      try {
        perMessageDeflate.accept(extensions[PerMessageDeflate.extensionName]);
      } catch (err) {
        const message = 'Invalid Sec-WebSocket-Extensions header';
        abortHandshake(websocket, socket, message);
        return;
      }
      websocket._extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
    }
    websocket.setSocket(socket, head, {
      allowSynchronousEvents: opts.allowSynchronousEvents,
      generateMask: opts.generateMask,
      maxPayload: opts.maxPayload,
      skipUTF8Validation: opts.skipUTF8Validation
    });
  });
  if (opts.finishRequest) {
    opts.finishRequest(req, websocket);
  } else {
    req.end();
  }
}

/**
 * Emit the `'error'` and `'close'` events.
 *
 * @param {WebSocket} websocket The WebSocket instance
 * @param {Error} The error to emit
 * @private
 */
function emitErrorAndClose(websocket, err) {
  websocket._readyState = WebSocket.CLOSING;
  //
  // The following assignment is practically useless and is done only for
  // consistency.
  //
  websocket._errorEmitted = true;
  websocket.emit('error', err);
  websocket.emitClose();
}

/**
 * Create a `net.Socket` and initiate a connection.
 *
 * @param {Object} options Connection options
 * @return {net.Socket} The newly created socket used to start the connection
 * @private
 */
function netConnect(options) {
  options.path = options.socketPath;
  return net.connect(options);
}

/**
 * Create a `tls.TLSSocket` and initiate a connection.
 *
 * @param {Object} options Connection options
 * @return {tls.TLSSocket} The newly created socket used to start the connection
 * @private
 */
function tlsConnect(options) {
  options.path = undefined;
  if (!options.servername && options.servername !== '') {
    options.servername = net.isIP(options.host) ? '' : options.host;
  }
  return tls.connect(options);
}

/**
 * Abort the handshake and emit an error.
 *
 * @param {WebSocket} websocket The WebSocket instance
 * @param {(http.ClientRequest|net.Socket|tls.Socket)} stream The request to
 *     abort or the socket to destroy
 * @param {String} message The error message
 * @private
 */
function abortHandshake(websocket, stream, message) {
  websocket._readyState = WebSocket.CLOSING;
  const err = new Error(message);
  Error.captureStackTrace(err, abortHandshake);
  if (stream.setHeader) {
    stream[kAborted] = true;
    stream.abort();
    if (stream.socket && !stream.socket.destroyed) {
      //
      // On Node.js >= 14.3.0 `request.abort()` does not destroy the socket if
      // called after the request completed. See
      // https://github.com/websockets/ws/issues/1869.
      //
      stream.socket.destroy();
    }
    process.nextTick(emitErrorAndClose, websocket, err);
  } else {
    stream.destroy(err);
    stream.once('error', websocket.emit.bind(websocket, 'error'));
    stream.once('close', websocket.emitClose.bind(websocket));
  }
}

/**
 * Handle cases where the `ping()`, `pong()`, or `send()` methods are called
 * when the `readyState` attribute is `CLOSING` or `CLOSED`.
 *
 * @param {WebSocket} websocket The WebSocket instance
 * @param {*} [data] The data to send
 * @param {Function} [cb] Callback
 * @private
 */
function sendAfterClose(websocket, data, cb) {
  if (data) {
    const length = isBlob(data) ? data.size : toBuffer(data).length;

    //
    // The `_bufferedAmount` property is used only when the peer is a client and
    // the opening handshake fails. Under these circumstances, in fact, the
    // `setSocket()` method is not called, so the `_socket` and `_sender`
    // properties are set to `null`.
    //
    if (websocket._socket) websocket._sender._bufferedBytes += length;else websocket._bufferedAmount += length;
  }
  if (cb) {
    const err = new Error(`WebSocket is not open: readyState ${websocket.readyState} ` + `(${readyStates[websocket.readyState]})`);
    process.nextTick(cb, err);
  }
}

/**
 * The listener of the `Receiver` `'conclude'` event.
 *
 * @param {Number} code The status code
 * @param {Buffer} reason The reason for closing
 * @private
 */
function receiverOnConclude(code, reason) {
  const websocket = this[kWebSocket];
  websocket._closeFrameReceived = true;
  websocket._closeMessage = reason;
  websocket._closeCode = code;
  if (websocket._socket[kWebSocket] === undefined) return;
  websocket._socket.removeListener('data', socketOnData);
  process.nextTick(resume, websocket._socket);
  if (code === 1005) websocket.close();else websocket.close(code, reason);
}

/**
 * The listener of the `Receiver` `'drain'` event.
 *
 * @private
 */
function receiverOnDrain() {
  const websocket = this[kWebSocket];
  if (!websocket.isPaused) websocket._socket.resume();
}

/**
 * The listener of the `Receiver` `'error'` event.
 *
 * @param {(RangeError|Error)} err The emitted error
 * @private
 */
function receiverOnError(err) {
  const websocket = this[kWebSocket];
  if (websocket._socket[kWebSocket] !== undefined) {
    websocket._socket.removeListener('data', socketOnData);

    //
    // On Node.js < 14.0.0 the `'error'` event is emitted synchronously. See
    // https://github.com/websockets/ws/issues/1940.
    //
    process.nextTick(resume, websocket._socket);
    websocket.close(err[kStatusCode]);
  }
  if (!websocket._errorEmitted) {
    websocket._errorEmitted = true;
    websocket.emit('error', err);
  }
}

/**
 * The listener of the `Receiver` `'finish'` event.
 *
 * @private
 */
function receiverOnFinish() {
  this[kWebSocket].emitClose();
}

/**
 * The listener of the `Receiver` `'message'` event.
 *
 * @param {Buffer|ArrayBuffer|Buffer[])} data The message
 * @param {Boolean} isBinary Specifies whether the message is binary or not
 * @private
 */
function receiverOnMessage(data, isBinary) {
  this[kWebSocket].emit('message', data, isBinary);
}

/**
 * The listener of the `Receiver` `'ping'` event.
 *
 * @param {Buffer} data The data included in the ping frame
 * @private
 */
function receiverOnPing(data) {
  const websocket = this[kWebSocket];
  if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
  websocket.emit('ping', data);
}

/**
 * The listener of the `Receiver` `'pong'` event.
 *
 * @param {Buffer} data The data included in the pong frame
 * @private
 */
function receiverOnPong(data) {
  this[kWebSocket].emit('pong', data);
}

/**
 * Resume a readable stream
 *
 * @param {Readable} stream The readable stream
 * @private
 */
function resume(stream) {
  stream.resume();
}

/**
 * The `Sender` error event handler.
 *
 * @param {Error} The error
 * @private
 */
function senderOnError(err) {
  const websocket = this[kWebSocket];
  if (websocket.readyState === WebSocket.CLOSED) return;
  if (websocket.readyState === WebSocket.OPEN) {
    websocket._readyState = WebSocket.CLOSING;
    setCloseTimer(websocket);
  }

  //
  // `socket.end()` is used instead of `socket.destroy()` to allow the other
  // peer to finish sending queued data. There is no need to set a timer here
  // because `CLOSING` means that it is already set or not needed.
  //
  this._socket.end();
  if (!websocket._errorEmitted) {
    websocket._errorEmitted = true;
    websocket.emit('error', err);
  }
}

/**
 * Set a timer to destroy the underlying raw socket of a WebSocket.
 *
 * @param {WebSocket} websocket The WebSocket instance
 * @private
 */
function setCloseTimer(websocket) {
  websocket._closeTimer = setTimeout(websocket._socket.destroy.bind(websocket._socket), closeTimeout);
}

/**
 * The listener of the socket `'close'` event.
 *
 * @private
 */
function socketOnClose() {
  const websocket = this[kWebSocket];
  this.removeListener('close', socketOnClose);
  this.removeListener('data', socketOnData);
  this.removeListener('end', socketOnEnd);
  websocket._readyState = WebSocket.CLOSING;
  let chunk;

  //
  // The close frame might not have been received or the `'end'` event emitted,
  // for example, if the socket was destroyed due to an error. Ensure that the
  // `receiver` stream is closed after writing any remaining buffered data to
  // it. If the readable side of the socket is in flowing mode then there is no
  // buffered data as everything has been already written and `readable.read()`
  // will return `null`. If instead, the socket is paused, any possible buffered
  // data will be read as a single chunk.
  //
  if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && (chunk = websocket._socket.read()) !== null) {
    websocket._receiver.write(chunk);
  }
  websocket._receiver.end();
  this[kWebSocket] = undefined;
  clearTimeout(websocket._closeTimer);
  if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
    websocket.emitClose();
  } else {
    websocket._receiver.on('error', receiverOnFinish);
    websocket._receiver.on('finish', receiverOnFinish);
  }
}

/**
 * The listener of the socket `'data'` event.
 *
 * @param {Buffer} chunk A chunk of data
 * @private
 */
function socketOnData(chunk) {
  if (!this[kWebSocket]._receiver.write(chunk)) {
    this.pause();
  }
}

/**
 * The listener of the socket `'end'` event.
 *
 * @private
 */
function socketOnEnd() {
  const websocket = this[kWebSocket];
  websocket._readyState = WebSocket.CLOSING;
  websocket._receiver.end();
  this.end();
}

/**
 * The listener of the socket `'error'` event.
 *
 * @private
 */
function socketOnError() {
  const websocket = this[kWebSocket];
  this.removeListener('error', socketOnError);
  this.on('error', NOOP);
  if (websocket) {
    websocket._readyState = WebSocket.CLOSING;
    this.destroy();
  }
}

/***/ }),

/***/ 7097:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const fs = __webpack_require__(1943);
const os = __webpack_require__(857);
const getSystemPrompt = async cwd => {
  return `You are Codebolt Dev, a highly skilled software developer with extensive knowledge in many programming languages, frameworks, design patterns, and best practices.

====
 
CAPABILITIES

- You can read and analyze code in various programming languages, and can write clean, efficient, and well-documented code.
- You can debug complex issues and providing detailed explanations, offering architectural insights and design patterns.
- You have access to tools that let you execute CLI commands on the user's computer, list files in a directory (top level or recursively), extract source code definitions, read and write files, and ask follow-up questions. These tools help you effectively accomplish a wide range of tasks, such as writing code, making edits or improvements to existing files, understanding the current state of a project, performing system operations, and much more.
- When the user initially gives you a task, a recursive list of all filepaths in the current working directory ('${cwd}') will be included in environment_details. This provides an overview of the project's file structure, offering key insights into the project from directory/file names (how developers conceptualize and organize their code) and file extensions (the language used). This can also guide decision-making on which files to explore further. If you need to further explore directories such as outside the current working directory, you can use the list_files tool. If you pass 'true' for the recursive parameter, it will list files recursively. Otherwise, it will list files at the top level, which is better suited for generic directories where you don't necessarily need the nested structure, like the Desktop.
- You can use search_files to perform regex searches across files in a specified directory, outputting context-rich results that include surrounding lines. This is particularly useful for understanding code patterns, finding specific implementations, or identifying areas that need refactoring.
- You can use the list_code_definition_names tool to get an overview of source code definitions for all files at the top level of a specified directory. This can be particularly useful when you need to understand the broader context and relationships between certain parts of the code. You may need to call this tool multiple times to understand various parts of the codebase related to the task.
	- For example, when asked to make edits or improvements you might analyze the file structure in the initial environment_details to get an overview of the project, then use list_code_definition_names to get further insight using source code definitions for files located in relevant directories, then read_file to examine the contents of relevant files, analyze the code and suggest improvements or make necessary edits, then use the write_to_file tool to implement changes. If you refactored code that could affect other parts of the codebase, you could use search_files to ensure you update other files as needed.
- The execute_command tool lets you run commands on the user's computer and should be used whenever you feel it can help accomplish the user's task. When you need to execute a CLI command, you must provide a clear explanation of what the command does. Prefer to execute complex CLI commands over creating executable scripts, since they are more flexible and easier to run. Interactive and long-running commands are allowed, since the commands are run in the user's VSCode terminal. The user may keep commands running in the background and you will be kept updated on their status along the way. Each command you execute is run in a new terminal instance.

====

RULES

- Your current working project is: ${cwd}
- Blank Project is already created keep this in mind
- You cannot \`cd\` into a different directory to complete a task. You are stuck operating from '${cwd}', so be sure to pass in the correct 'path' parameter when using tools that require a path.
- Do not use the ~ character or $HOME to refer to the home directory.
- Before using the execute_command tool, you must first think about the SYSTEM INFORMATION context provided to understand the user's environment and tailor your commands to ensure they are compatible with their system. You must also consider if the command you need to run should be executed in a specific directory outside of the current working directory '${cwd}', and if so prepend with \`cd\`'ing into that directory && then executing the command (as one command since you are stuck operating from '${cwd}'). For example, if you needed to run \`npm install\` in a project outside of '${cwd}', you would need to prepend with a \`cd\` i.e. pseudocode for this would be \`cd (path to project) && (command, in this case npm install)\`.
- When using the search_files tool, craft your regex patterns carefully to balance specificity and flexibility. Based on the user's task you may use it to find code patterns, TODO comments, function definitions, or any text-based information across the project. The results include context, so analyze the surrounding code to better understand the matches. Leverage the search_files tool in combination with other tools for more comprehensive analysis. For example, use it to find specific code patterns, then use read_file to examine the full context of interesting matches before using write_to_file to make informed changes.
- When creating a new project (such as an app, website, or any software project), organize all new files within a dedicated project directory unless the user specifies otherwise. Use appropriate file paths when writing files, as the write_to_file tool will automatically create any necessary directories. Structure the project logically, adhering to best practices for the specific type of project being created. Unless otherwise specified, new projects should be easily run without additional setup, for example most projects can be built in HTML, CSS, and JavaScript - which you can open in a browser.
- You must try to use multiple tools in one request when possible. For example if you were to create a website, you would use the write_to_file tool to create the necessary files with their appropriate contents all at once. Or if you wanted to analyze a project, you could use the read_file tool multiple times to look at several key files. This will help you accomplish the user's task more efficiently.
- Be sure to consider the type of project (e.g. Python, JavaScript, web application) when determining the appropriate structure and files to include. Also consider what files may be most relevant to accomplishing the task, for example looking at a project's manifest file would help you understand the project's dependencies, which you could incorporate into any code you write.
- When making changes to code, always consider the context in which the code is being used. Ensure that your changes are compatible with the existing codebase and that they follow the project's coding standards and best practices.
- Do not ask for more information than necessary. Use the tools provided to accomplish the user's request efficiently and effectively. When you've completed your task, you must use the attempt_completion tool to present the result to the user. The user may provide feedback, which you can use to make improvements and try again.
- You are only allowed to ask the user questions using the ask_followup_question tool. Use this tool only when you need additional details to complete a task, and be sure to use a clear and concise question that will help you move forward with the task. However if you can use the available tools to avoid having to ask the user questions, you should do so. For example, if the user mentions a file that may be in an outside directory like the Desktop, you should use the list_files tool to list the files in the Desktop and check if the file they are talking about is there, rather than asking the user to provide the file path themselves.
- Your goal is to try to accomplish the user's task, NOT engage in a back and forth conversation.
- NEVER end completion_attempt with a question or request to engage in further conversation! Formulate the end of your result in a way that is final and does not require further input from the user. 
- NEVER start your responses with affirmations like "Certainly", "Okay", "Sure", "Great", etc. You should NOT be conversational in your responses, but rather direct and to the point.
- Feel free to use markdown as much as you'd like in your responses. When using code blocks, always include a language specifier.
- When presented with images, utilize your vision capabilities to thoroughly examine them and extract meaningful information. Incorporate these insights into your thought process as you accomplish the user's task.
- At the end of each user message, you will automatically receive environment_details. This information is not written by the user themselves, but is auto-generated to provide potentially relevant context about the project structure and environment. While this information can be valuable for understanding the project context, do not treat it as a direct part of the user's request or response. Use it to inform your actions and decisions, but don't assume the user is explicitly asking about or referring to this information unless they clearly do so in their message. When using environment_details, explain your actions clearly to ensure the user understands, as they may not be aware of these details.
- CRITICAL: When editing files with write_to_file, ALWAYS provide the COMPLETE file content in your response. This is NON-NEGOTIABLE. Partial updates or placeholders like '// rest of code unchanged' are STRICTLY FORBIDDEN. You MUST include ALL parts of the file, even if they haven't been modified. Failure to do so will result in incomplete or broken code, severely impacting the user's project.
- Do not use the 'open' command to run the project. Instead, use 'npx http-server' to serve static HTML files.
====

OBJECTIVE

You accomplish a given task iteratively, breaking it down into clear steps and working through them methodically.

1. Analyze the user's task and set clear, achievable goals to accomplish it. Prioritize these goals in a logical order.
2. Work through these goals sequentially, utilizing available tools as necessary. Each goal should correspond to a distinct step in your problem-solving process. It is okay for certain steps to take multiple iterations, i.e. if you need to create many files but are limited by your max output limitations, it's okay to create a few files at a time as each subsequent iteration will keep you informed on the work completed and what's remaining. 
3. Remember, you have extensive capabilities with access to a wide range of tools that can be used in powerful and clever ways as necessary to accomplish each goal. Before calling a tool, do some analysis within <thinking></thinking> tags. First, analyze the file structure provided in environment_details to gain context and insights for proceeding effectively. Then, think about which of the provided tools is the most relevant tool to accomplish the user's task. Next, go through each of the required parameters of the relevant tool and determine if the user has directly provided or given enough information to infer a value. When deciding if the parameter can be inferred, carefully consider all the context to see if it supports a specific value. If all of the required parameters are present or can be reasonably inferred, close the thinking tag and proceed with the tool call. BUT, if one of the values for a required parameter is missing, DO NOT invoke the function (not even with fillers for the missing params) and instead, ask the user to provide the missing parameters using the ask_followup_question tool. DO NOT ask for more information on optional parameters if it is not provided.
4. Once you've completed the user's task, you must use the attempt_completion tool to present the result of the task to the user. You may also provide a CLI command to showcase the result of your task; this can be particularly useful for web development tasks, where you can run e.g. \`open index.html\` to show the website you've built.
5. The user may provide feedback, which you can use to make improvements and try again. But DO NOT continue in pointless back and forth conversations, i.e. don't end your responses with questions or offers for further assistance.

====

SYSTEM INFORMATION

Operating System: ${os.type}
Default Shell: 
Home Directory: ${os.homedir()}
Current Working Directory: ${cwd}
`;
};
function getTools(cwd) {
  return [{
    type: "function",
    function: {
      name: "execute_command",
      description: "Execute a CLI command on the system. Use this when you need to perform system operations or run specific commands to accomplish any step in the user's task.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The CLI command to execute. This should be valid for the current operating system and properly formatted."
          }
        },
        required: ["command"]
      }
    }
  }, {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file at the specified path. Suitable for examining file contents, such as code or text files.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The path of the file to read (relative to the current working directory)."
          }
        },
        required: ["path"]
      }
    }
  }, {
    type: "function",
    function: {
      name: "write_to_file",
      description: "Write content to a file at the specified path. If the file exists, it will be overwritten; if not, it will be created.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The path of the file to write to (relative to the current working directory)."
          },
          content: {
            type: "string",
            description: "The full content to write to the file."
          }
        },
        required: ["path", "content"]
      }
    }
  }, {
    type: "function",
    function: {
      name: "search_files",
      description: "Perform a regex search across files in a specified directory, providing context-rich results.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The path of the directory to search in (relative to the current working directory). This directory will be recursively searched."
          },
          regex: {
            type: "string",
            description: "The regular expression pattern to search for. Uses Rust regex syntax."
          },
          filePattern: {
            type: "string",
            description: "Optional glob pattern to filter files (e.g., '*.ts' for TypeScript files)."
          }
        },
        required: ["path", "regex"]
      }
    }
  }, {
    type: "function",
    function: {
      name: "list_files",
      description: "List files and directories within the specified directory. Optionally recursive.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The path of the directory to list contents for (relative to the current working directory)."
          },
          recursive: {
            type: "boolean",
            description: "Whether to list files recursively (true for recursive listing)."
          }
        },
        required: ["path"]
      }
    }
  }, {
    type: "function",
    function: {
      name: "list_code_definition_names",
      description: "Lists definition names (classes, functions, methods, etc.) in source code files at the top level of the specified directory.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The path of the directory (relative to the current working directory) to list top-level source code definitions for."
          }
        },
        required: ["path"]
      }
    }
  }, {
    type: "function",
    function: {
      name: "ask_followup_question",
      description: "Ask the user a question to gather additional information needed to complete the task.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The question to ask the user for clarification or additional information."
          }
        },
        required: ["question"]
      }
    }
  }, {
    type: "function",
    function: {
      name: "attempt_completion",
      description: "Present the result of the task to the user, allowing them to review the outcome.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Optional CLI command to execute to show a live demo of the result to the user."
          },
          result: {
            type: "string",
            description: "The result of the task. This should be presented as final, without requiring further input."
          }
        },
        required: ["result"]
      }
    }
  }];
  ;
}
module.exports = {
  getSystemPrompt,
  getTools
};

/***/ }),

/***/ 4420:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const codebolt = (__webpack_require__(7601)["default"]);
let projectPath;
const fs = (__webpack_require__(9896).promises);
const path = __webpack_require__(6928);
/**
 * Sends a message to the user interface.
 * @param {string} message - The message to be sent to the UI.
 */
const COMMAND_OUTPUT_STRING = "Output:";
async function send_message_to_ui(message, type) {
  await codebolt.waitForConnection();
  let paylod = {};
  let agentMessage;
  switch (type) {
    case "tool":
      const tool = JSON.parse(message || "{}");
      switch (tool.tool) {
        case "readFile":
          paylod.type = "file";
          agentMessage = "Codebolt read this file:";
          paylod.content = tool.content;
          paylod.path = tool.path;
          break;
        case "listFilesTopLevel":
          paylod.type = "file";
          agentMessage = "Codebolt viewed the top level files in this directory:";
          paylod.content = tool.content;
          paylod.path = tool.path;
          break;
        case "listFilesRecursive":
          paylod.type = "file";
          agentMessage = "Codebolt recursively viewed all files in this directory:";
          paylod.content = tool.content;
          paylod.path = tool.path;
          break;
        case "listCodeDefinitionNames":
          paylod.type = "file";
          paylod.content = tool.content;
          paylod.path = tool.path;
          agentMessage = "Codebolt viewed source code definition names used in this directory:";
          break;
        case "searchFiles":
          paylod.type = "file";
          paylod.content = tool.content;
          paylod.path = tool.path + (tool.filePattern ? `/(${tool.filePattern})` : "");
          agentMessage = `Codebolt searched this directory for <code>{tool.regex}</code>:`;
          break;
        default:
          agentMessage = message;
          break;
      }
    default:
      agentMessage = message;
      break;
  }
  await send_message(agentMessage, paylod);
}
async function ask_question(question, type) {
  let buttons = [{
    text: "Yes",
    value: "yes"
  }, {
    text: "No",
    value: "no"
  }];
  let paylod = {
    type: "",
    path: "",
    content: ""
  };
  let agentMessage = "";
  function setPrimaryButtonText(text) {
    if (text === undefined) {
      buttons.splice(0, 1); // Remove the second button from the array
    } else {
      buttons[0].text = text;
      buttons[0].value = text;
    }
  }
  function setSecondaryButtonText(text) {
    if (text === undefined) {
      buttons.splice(1, 1); // Remove the second button from the array
    } else {
      buttons[1].value = text;
      buttons[1].text = text;
    }
  }
  switch (type) {
    case "api_req_failed":
      setPrimaryButtonText("Retry");
      setSecondaryButtonText("Start New Task");
      break;
    case "mistake_limit_reached":
      setPrimaryButtonText("Proceed Anyways");
      setSecondaryButtonText("Start New Task");
      break;
    case "followup":
      setPrimaryButtonText(undefined);
      setSecondaryButtonText(undefined);
      break;
    case "tool":
      const tool = JSON.parse(question || "{}");
      switch (tool.tool) {
        case "editedExistingFile":
          agentMessage = "Codebolt wants to edit this file";
          paylod.content = tool.diff;
          paylod.path = tool.path;
          paylod.type = "file";
          setPrimaryButtonText("Save");
          setSecondaryButtonText("Reject");
          break;
        case "newFileCreated":
          agentMessage = "Codebolt wants to create a new file:";
          setPrimaryButtonText("Save");
          paylod.content = tool.content;
          paylod.path = tool.path;
          paylod.type = "file";
          setSecondaryButtonText("Reject");
          break;
        case "readFile":
          agentMessage = "Codebolt wants to read this file:";
          paylod.content = tool.content;
          paylod.path = tool.path;
          setPrimaryButtonText("Approve");
          setSecondaryButtonText("Reject");
          paylod.type = "file";
          break;
        case "listFilesTopLevel":
          agentMessage = "Codebolt wants to view the top level files in this directory:";
          paylod.content = tool.content;
          paylod.path = tool.path;
          setPrimaryButtonText("Approve");
          setSecondaryButtonText("Reject");
          paylod.type = "file";
          break;
        case "listFilesRecursive":
          paylod.content = tool.content;
          paylod.path = tool.path;
          agentMessage = "Codebolt wants to recursively view all files in this directory:";
          setPrimaryButtonText("Approve");
          setSecondaryButtonText("Reject");
          paylod.type = "file";
          break;
        case "listCodeDefinitionNames":
          paylod.content = tool.content;
          paylod.path = tool.path;
          agentMessage = "Codebolt wants to view source code definition names used in this directory:";
          setPrimaryButtonText("Approve");
          setSecondaryButtonText("Reject");
          paylod.type = "file";
          break;
        case "searchFiles":
          paylod.content = tool.content;
          paylod.path = tool.path + (tool.filePattern ? `/(${tool.filePattern})` : "");
          agentMessage = `Codebolt wants to search this directory for ${tool.regex}:`;
          setPrimaryButtonText("Approve");
          setSecondaryButtonText("Reject");
          paylod.type = "file";
          break;
        default:
          return null;
          break;
      }
      question = undefined;
      await send_message(agentMessage, paylod);
      break;
    case "command":
      paylod.type = "command";
      const splitMessage = text => {
        const outputIndex = text.indexOf(COMMAND_OUTPUT_STRING);
        if (outputIndex === -1) {
          return {
            command: text,
            output: ""
          };
        }
        return {
          command: text.slice(0, outputIndex).trim(),
          output: text.slice(outputIndex + COMMAND_OUTPUT_STRING.length).trim().split("").map(char => {
            switch (char) {
              case "\t":
                return "→   ";
              case "\b":
                return "⌫";
              case "\f":
                return "⏏";
              case "\v":
                return "⇳";
              default:
                return char;
            }
          }).join("")
        };
      };
      const {
        command,
        output
      } = splitMessage(question || "");
      paylod.command = command;
      agentMessage = "Codebolt wants to execute this command:";
      await send_message(agentMessage, paylod);
      question = undefined;
      setPrimaryButtonText("Run Command");
      setSecondaryButtonText("Reject");
      break;
    case "command_output":
      setPrimaryButtonText("Proceed While Running");
      setSecondaryButtonText(undefined);
      break;
    case "completion_result":
      setPrimaryButtonText("Start New Task");
      setSecondaryButtonText(undefined);
      break;
    case "resume_task":
      setPrimaryButtonText("Resume Task");
      setSecondaryButtonText(undefined);
      break;
    case "resume_completed_task":
      setPrimaryButtonText("Start New Task");
      setSecondaryButtonText(undefined);
      break;
  }
  // console.log("sending message ", question, buttons)
  const response = await codebolt.chat.sendConfirmationRequest(question, buttons, true);
  // console.log(message.userMessage);
  return response;
}
async function send_message(message, paylod) {
  console.log(JSON.stringify(message, paylod));
  codebolt.chat.sendMessage(message, paylod);
}
async function readFile(filePath) {
  try {
    let {
      success,
      result
    } = await codebolt.fs.readFile(filePath);
    console.log("response", success, result);
    return [success, result];
  } catch (error) {
    console.error(`Failed to read file at ${filePath}:`, error);
    throw error;
  }
}
async function writeToFile(filePath, content) {
  try {
    let {
      success,
      result
    } = await codebolt.fs.writeToFile(filePath, content);
    console.log("response", success, result);
    return [success, result];
  } catch (error) {
    console.error(`Failed to write to file at ${filePath}:`, error);
    throw error;
  }
}
async function listFiles(directoryPath, recursive = false) {
  try {
    let {
      success,
      result
    } = await codebolt.fs.listFile(directoryPath, recursive);
    return [success, result];
  } catch (error) {
    console.error(`Failed to list files in directory ${directoryPath}:`, error);
    throw error;
  }
}
async function listCodeDefinitionNames(filePath) {
  try {
    let {
      success,
      result
    } = await codebolt.fs.listCodeDefinitionNames(filePath);
    return [success, result];
  } catch (error) {
    console.error(`Failed to list code definitions in file ${filePath}:`, error);
    throw error;
  }
}
async function searchFiles(directoryPath, regex, filePattern) {
  try {
    let {
      success,
      result
    } = await codebolt.fs.searchFiles(directoryPath, regex, filePattern);
    return [success, result];
  } catch (error) {
    console.error(`Failed to search files in directory ${directoryPath}:`, error);
    throw error;
  }
}
async function sendNotification(type, message) {
  codebolt.chat.sendNotificationEvent(message, type);
}
async function executeCommand(command, returnEmptyStringOnSuccess) {
  let {
    success,
    result
  } = await codebolt.terminal.executeCommand(command, returnEmptyStringOnSuccess);
  return [success, result];
}

/**
 * Sends a message to the Language Learning Model (LLM).
 * @param {string} message - The message to be sent to the LLM.
 * @param {string} model - The LLM model to use (e.g., GPT-4, Codebolt-3).
 */
async function send_message_to_llm(prompt) {
  let {
    completion
  } = await codebolt.llm.inference(prompt);
  return completion;
}
async function get_default_llm() {
  try {
    await codebolt.waitForConnection();
    let {
      state
    } = await codebolt.cbstate.getApplicationState();
    console.log(state);
    if (state.appState && state.appState.defaultApplicationLLM) {
      return state.appState.defaultApplicationLLM.name.replace(/\s+/g, '').toLowerCase();
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }
}
async function currentProjectPath() {
  await codebolt.waitForConnection();
  if (projectPath) {
    return projectPath;
  } else {
    // Call a function or handle the case when projectPath is not available
    // For example, you might want to throw an error or return a default value
    let {
      projectPath
    } = await codebolt.project.getProjectPath();
    console.log(projectPath);
    let _currentProjectPath = projectPath;
    return _currentProjectPath;
  }
}
async function getProjectState() {
  try {
    let {
      state
    } = await codebolt.cbstate.getApplicationState();
    return state.projectState.state;
  } catch (error) {
    return {};
  }
}
async function getInstructionsForAgent() {
  if (projectPath) {
    const filePath = path.join(projectPath, 'codebltInstruction.md');
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      return fileContent;
    } catch (error) {
      console.error('Error reading codebltInstruction.md:', error);
      return '';
    }
  } else {
    let projectPath = await currentProjectPath();
    const filePath = path.join(projectPath, 'codebltInstruction.md');
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      return fileContent;
    } catch (error) {
      console.error('Error reading codebltInstruction.md:', error);
      return '';
    }
  }
}
function formatAIMessage(completion) {
  const openAiMessage = completion.choices[0].message;
  const anthropicMessage = {
    id: completion.id,
    type: "message",
    role: openAiMessage.role,
    content: [{
      type: "text",
      text: openAiMessage.content || ""
    }],
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
      output_tokens: completion.usage?.completion_tokens || 0
    }
  };
  if (openAiMessage.tool_calls && openAiMessage.tool_calls.length > 0) {
    anthropicMessage.content.push(...openAiMessage.tool_calls.map(toolCall => {
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
        input: parsedInput
      };
    }));
  }
  return anthropicMessage;
}
module.exports = {
  send_message_to_ui,
  send_message_to_llm,
  getInstructionsForAgent,
  get_default_llm,
  ask_question,
  executeCommand,
  currentProjectPath,
  sendNotification,
  writeToFile,
  readFile,
  listFiles,
  searchFiles,
  listCodeDefinitionNames,
  getProjectState,
  formatAIMessage
};

/***/ }),

/***/ 2849:
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

const os = __webpack_require__(857);
const path = __webpack_require__(6928);
// import * as vscode from "vscode";

function downloadTask(dateTs, conversationHistory) {
  // File name
  const date = new Date(dateTs);
  const month = date.toLocaleString("en-US", {
    month: "short"
  }).toLowerCase();
  const day = date.getDate();
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  const fileName = `claude_dev_task_${month}-${day}-${year}_${hours}-${minutes}-${seconds}-${ampm}.md`;

  // Generate markdown
  const markdownContent = conversationHistory.map(message => {
    const role = message.role === "user" ? "**User:**" : "**Assistant:**";
    const content = Array.isArray(message.content) ? message.content.map(block => formatContentBlockToMarkdown(block, conversationHistory)).join("\n") : message.content;
    return `${role}\n\n${content}\n\n`;
  }).join("---\n\n");

  // Prompt user for save location
  // const saveUri = await vscode.window.showSaveDialog({
  // 	filters: { Markdown: ["md"] },
  // 	defaultUri: vscode.Uri.file(path.join(os.homedir(), "Downloads", fileName)),
  // });

  // if (saveUri) {
  // 	// Write content to the selected location
  // 	await vscode.workspace.fs.writeFile(saveUri, Buffer.from(markdownContent));
  // 	vscode.window.showTextDocument(saveUri, { preview: true });
  // }
}
function formatContentBlockToMarkdown(block, messages) {
  switch (block.type) {
    case "text":
      return block.text || "";
    case "image":
      return `[Image]`;
    case "tool_use":
      let input;
      if (typeof block.input === "object" && block.input !== null) {
        input = Object.entries(block.input).map(([key, value]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`).join("\n");
      } else {
        input = String(block.input);
      }
      return `[Tool Use: ${block.name}]\n${input}`;
    case "tool_result":
      const toolName = findToolName(block.tool_use_id, messages);
      if (typeof block.content === "string") {
        return `[${toolName}${block.is_error ? " (Error)" : ""}]\n${block.content}`;
      } else if (Array.isArray(block.content)) {
        return `[${toolName}${block.is_error ? " (Error)" : ""}]\n${block.content.map(contentBlock => formatContentBlockToMarkdown(contentBlock, messages)).join("\n")}`;
      } else {
        return `[${toolName}${block.is_error ? " (Error)" : ""}]`;
      }
    default:
      return "[Unexpected content type]";
  }
}
function findToolName(toolCallId, messages) {
  for (const message of messages) {
    if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.type === "tool_use" && block.id === toolCallId) {
          return block.name || "Unknown Tool";
        }
      }
    }
  }
  return "Unknown Tool";
}
function convertToOpenAiMessages(anthropicMessages) {
  const openAiMessages = [];
  for (const anthropicMessage of anthropicMessages) {
    if (typeof anthropicMessage.content === "string") {
      openAiMessages.push({
        role: anthropicMessage.role,
        content: anthropicMessage.content
      });
    } else {
      if (anthropicMessage.role === "user") {
        const {
          nonToolMessages,
          toolMessages
        } = anthropicMessage.content.reduce((acc, part) => {
          if (part.type === "tool_result") {
            acc.toolMessages.push(part);
          } else if (part.type === "text" || part.type === "image") {
            acc.nonToolMessages.push(part);
          }
          return acc;
        }, {
          nonToolMessages: [],
          toolMessages: []
        });
        let toolResultImages = [];
        toolMessages.forEach(toolMessage => {
          let content;
          if (typeof toolMessage.content === "string") {
            content = toolMessage.content;
          } else {
            content = toolMessage.content.map(part => {
              if (part.type === "image") {
                toolResultImages.push(part);
                return "(see following user message for image)";
              }
              return part.text || "";
            }).join("\n") || "";
          }
          openAiMessages.push({
            role: "tool",
            tool_call_id: toolMessage.tool_use_id,
            content: content
          });
        });
        if (toolResultImages.length > 0) {
          openAiMessages.push({
            role: "user",
            content: toolResultImages.map(part => ({
              type: "image_url",
              image_url: {
                url: `data:${part.image_url?.url};base64,${part.image_url?.url}`
              }
            }))
          });
        }
        if (nonToolMessages.length > 0) {
          openAiMessages.push({
            role: "user",
            content: nonToolMessages.map(part => {
              if (part.type === "image") {
                return {
                  type: "image_url",
                  image_url: {
                    url: `data:${part.image_url?.url};base64,${part.image_url?.url}`
                  }
                };
              }
              return {
                type: "text",
                text: part.text || ""
              };
            })
          });
        }
      } else if (anthropicMessage.role === "assistant") {
        const {
          nonToolMessages,
          toolMessages
        } = anthropicMessage.content.reduce((acc, part) => {
          if (part.type === "tool_use") {
            acc.toolMessages.push(part);
          } else if (part.type === "text" || part.type === "image") {
            acc.nonToolMessages.push(part);
          }
          return acc;
        }, {
          nonToolMessages: [],
          toolMessages: []
        });
        let content;
        if (nonToolMessages.length > 0) {
          content = nonToolMessages.map(part => {
            if (part.type === "image") {
              return "";
            }
            return part.text || "";
          }).join("\n");
        }
        let tool_calls = toolMessages.map(toolMessage => ({
          id: toolMessage.id,
          type: "function",
          function: {
            name: toolMessage.name,
            arguments: JSON.stringify(toolMessage.input)
          }
        }));
        openAiMessages.push({
          role: "assistant",
          content,
          tool_calls: tool_calls.length > 0 ? tool_calls : undefined
        });
      }
    }
  }
  return openAiMessages;
}
function convertToAnthropicMessage(completion) {
  const openAiMessage = completion.choices[0].message;
  const anthropicMessage = {
    id: completion.id,
    type: "message",
    role: openAiMessage.role,
    content: [{
      type: "text",
      text: openAiMessage.content || ""
    }],
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
      output_tokens: completion.usage?.completion_tokens || 0
    }
  };
  if (openAiMessage.tool_calls && openAiMessage.tool_calls.length > 0) {
    anthropicMessage.content.push(...openAiMessage.tool_calls.map(toolCall => {
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
        input: parsedInput
      };
    }));
  }
  return anthropicMessage;
}
module.exports = {
  downloadTask,
  formatContentBlockToMarkdown,
  convertToAnthropicMessage,
  findToolName,
  convertToOpenAiMessages
};

/***/ }),

/***/ 181:
/***/ ((module) => {

"use strict";
module.exports = require("buffer");

/***/ }),

/***/ 6982:
/***/ ((module) => {

"use strict";
module.exports = require("crypto");

/***/ }),

/***/ 4434:
/***/ ((module) => {

"use strict";
module.exports = require("events");

/***/ }),

/***/ 9896:
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ }),

/***/ 1943:
/***/ ((module) => {

"use strict";
module.exports = require("fs/promises");

/***/ }),

/***/ 8611:
/***/ ((module) => {

"use strict";
module.exports = require("http");

/***/ }),

/***/ 5692:
/***/ ((module) => {

"use strict";
module.exports = require("https");

/***/ }),

/***/ 9278:
/***/ ((module) => {

"use strict";
module.exports = require("net");

/***/ }),

/***/ 857:
/***/ ((module) => {

"use strict";
module.exports = require("os");

/***/ }),

/***/ 6928:
/***/ ((module) => {

"use strict";
module.exports = require("path");

/***/ }),

/***/ 2203:
/***/ ((module) => {

"use strict";
module.exports = require("stream");

/***/ }),

/***/ 4756:
/***/ ((module) => {

"use strict";
module.exports = require("tls");

/***/ }),

/***/ 7016:
/***/ ((module) => {

"use strict";
module.exports = require("url");

/***/ }),

/***/ 9023:
/***/ ((module) => {

"use strict";
module.exports = require("util");

/***/ }),

/***/ 3106:
/***/ ((module) => {

"use strict";
module.exports = require("zlib");

/***/ }),

/***/ 3633:
/***/ ((module) => {

"use strict";
module.exports = /*#__PURE__*/JSON.parse('[{"type":"declaration","named":true,"subtypes":[{"type":"class_declaration","named":true},{"type":"function_declaration","named":true},{"type":"generator_function_declaration","named":true},{"type":"lexical_declaration","named":true},{"type":"variable_declaration","named":true}]},{"type":"expression","named":true,"subtypes":[{"type":"assignment_expression","named":true},{"type":"augmented_assignment_expression","named":true},{"type":"await_expression","named":true},{"type":"binary_expression","named":true},{"type":"glimmer_template","named":true},{"type":"jsx_element","named":true},{"type":"jsx_self_closing_element","named":true},{"type":"new_expression","named":true},{"type":"primary_expression","named":true},{"type":"ternary_expression","named":true},{"type":"unary_expression","named":true},{"type":"update_expression","named":true},{"type":"yield_expression","named":true}]},{"type":"pattern","named":true,"subtypes":[{"type":"array_pattern","named":true},{"type":"identifier","named":true},{"type":"member_expression","named":true},{"type":"object_pattern","named":true},{"type":"rest_pattern","named":true},{"type":"subscript_expression","named":true},{"type":"undefined","named":true}]},{"type":"primary_expression","named":true,"subtypes":[{"type":"array","named":true},{"type":"arrow_function","named":true},{"type":"call_expression","named":true},{"type":"class","named":true},{"type":"false","named":true},{"type":"function_expression","named":true},{"type":"generator_function","named":true},{"type":"identifier","named":true},{"type":"member_expression","named":true},{"type":"meta_property","named":true},{"type":"null","named":true},{"type":"number","named":true},{"type":"object","named":true},{"type":"parenthesized_expression","named":true},{"type":"regex","named":true},{"type":"string","named":true},{"type":"subscript_expression","named":true},{"type":"super","named":true},{"type":"template_string","named":true},{"type":"this","named":true},{"type":"true","named":true},{"type":"undefined","named":true}]},{"type":"statement","named":true,"subtypes":[{"type":"break_statement","named":true},{"type":"continue_statement","named":true},{"type":"debugger_statement","named":true},{"type":"declaration","named":true},{"type":"do_statement","named":true},{"type":"empty_statement","named":true},{"type":"export_statement","named":true},{"type":"expression_statement","named":true},{"type":"for_in_statement","named":true},{"type":"for_statement","named":true},{"type":"if_statement","named":true},{"type":"import_statement","named":true},{"type":"labeled_statement","named":true},{"type":"return_statement","named":true},{"type":"statement_block","named":true},{"type":"switch_statement","named":true},{"type":"throw_statement","named":true},{"type":"try_statement","named":true},{"type":"while_statement","named":true},{"type":"with_statement","named":true}]},{"type":"arguments","named":true,"fields":{},"children":{"multiple":true,"required":false,"types":[{"type":"expression","named":true},{"type":"spread_element","named":true}]}},{"type":"array","named":true,"fields":{},"children":{"multiple":true,"required":false,"types":[{"type":"expression","named":true},{"type":"spread_element","named":true}]}},{"type":"array_pattern","named":true,"fields":{},"children":{"multiple":true,"required":false,"types":[{"type":"assignment_pattern","named":true},{"type":"pattern","named":true}]}},{"type":"arrow_function","named":true,"fields":{"body":{"multiple":false,"required":true,"types":[{"type":"expression","named":true},{"type":"statement_block","named":true}]},"parameter":{"multiple":false,"required":false,"types":[{"type":"identifier","named":true}]},"parameters":{"multiple":false,"required":false,"types":[{"type":"formal_parameters","named":true}]}}},{"type":"assignment_expression","named":true,"fields":{"left":{"multiple":false,"required":true,"types":[{"type":"array_pattern","named":true},{"type":"identifier","named":true},{"type":"member_expression","named":true},{"type":"object_pattern","named":true},{"type":"parenthesized_expression","named":true},{"type":"subscript_expression","named":true},{"type":"undefined","named":true}]},"right":{"multiple":false,"required":true,"types":[{"type":"expression","named":true}]}}},{"type":"assignment_pattern","named":true,"fields":{"left":{"multiple":false,"required":true,"types":[{"type":"pattern","named":true}]},"right":{"multiple":false,"required":true,"types":[{"type":"expression","named":true}]}}},{"type":"augmented_assignment_expression","named":true,"fields":{"left":{"multiple":false,"required":true,"types":[{"type":"identifier","named":true},{"type":"member_expression","named":true},{"type":"parenthesized_expression","named":true},{"type":"subscript_expression","named":true}]},"operator":{"multiple":false,"required":true,"types":[{"type":"%=","named":false},{"type":"&&=","named":false},{"type":"&=","named":false},{"type":"**=","named":false},{"type":"*=","named":false},{"type":"+=","named":false},{"type":"-=","named":false},{"type":"/=","named":false},{"type":"<<=","named":false},{"type":">>=","named":false},{"type":">>>=","named":false},{"type":"??=","named":false},{"type":"^=","named":false},{"type":"|=","named":false},{"type":"||=","named":false}]},"right":{"multiple":false,"required":true,"types":[{"type":"expression","named":true}]}}},{"type":"await_expression","named":true,"fields":{},"children":{"multiple":false,"required":true,"types":[{"type":"expression","named":true}]}},{"type":"binary_expression","named":true,"fields":{"left":{"multiple":false,"required":true,"types":[{"type":"expression","named":true},{"type":"private_property_identifier","named":true}]},"operator":{"multiple":false,"required":true,"types":[{"type":"!=","named":false},{"type":"!==","named":false},{"type":"%","named":false},{"type":"&","named":false},{"type":"&&","named":false},{"type":"*","named":false},{"type":"**","named":false},{"type":"+","named":false},{"type":"-","named":false},{"type":"/","named":false},{"type":"<","named":false},{"type":"<<","named":false},{"type":"<=","named":false},{"type":"==","named":false},{"type":"===","named":false},{"type":">","named":false},{"type":">=","named":false},{"type":">>","named":false},{"type":">>>","named":false},{"type":"??","named":false},{"type":"^","named":false},{"type":"in","named":false},{"type":"instanceof","named":false},{"type":"|","named":false},{"type":"||","named":false}]},"right":{"multiple":false,"required":true,"types":[{"type":"expression","named":true}]}}},{"type":"break_statement","named":true,"fields":{"label":{"multiple":false,"required":false,"types":[{"type":"statement_identifier","named":true}]}}},{"type":"call_expression","named":true,"fields":{"arguments":{"multiple":false,"required":true,"types":[{"type":"arguments","named":true},{"type":"template_string","named":true}]},"function":{"multiple":false,"required":true,"types":[{"type":"expression","named":true},{"type":"import","named":true}]},"optional_chain":{"multiple":false,"required":false,"types":[{"type":"optional_chain","named":true}]}}},{"type":"catch_clause","named":true,"fields":{"body":{"multiple":false,"required":true,"types":[{"type":"statement_block","named":true}]},"parameter":{"multiple":false,"required":false,"types":[{"type":"array_pattern","named":true},{"type":"identifier","named":true},{"type":"object_pattern","named":true}]}}},{"type":"class","named":true,"fields":{"body":{"multiple":false,"required":true,"types":[{"type":"class_body","named":true}]},"decorator":{"multiple":true,"required":false,"types":[{"type":"decorator","named":true}]},"name":{"multiple":false,"required":false,"types":[{"type":"identifier","named":true}]}},"children":{"multiple":false,"required":false,"types":[{"type":"class_heritage","named":true}]}},{"type":"class_body","named":true,"fields":{"member":{"multiple":true,"required":false,"types":[{"type":"class_static_block","named":true},{"type":"field_definition","named":true},{"type":"method_definition","named":true}]},"template":{"multiple":true,"required":false,"types":[{"type":"glimmer_template","named":true}]}}},{"type":"class_declaration","named":true,"fields":{"body":{"multiple":false,"required":true,"types":[{"type":"class_body","named":true}]},"decorator":{"multiple":true,"required":false,"types":[{"type":"decorator","named":true}]},"name":{"multiple":false,"required":true,"types":[{"type":"identifier","named":true}]}},"children":{"multiple":false,"required":false,"types":[{"type":"class_heritage","named":true}]}},{"type":"class_heritage","named":true,"fields":{},"children":{"multiple":false,"required":true,"types":[{"type":"expression","named":true}]}},{"type":"class_static_block","named":true,"fields":{"body":{"multiple":false,"required":true,"types":[{"type":"statement_block","named":true}]}}},{"type":"computed_property_name","named":true,"fields":{},"children":{"multiple":false,"required":true,"types":[{"type":"expression","named":true}]}},{"type":"continue_statement","named":true,"fields":{"label":{"multiple":false,"required":false,"types":[{"type":"statement_identifier","named":true}]}}},{"type":"debugger_statement","named":true,"fields":{}},{"type":"decorator","named":true,"fields":{},"children":{"multiple":false,"required":true,"types":[{"type":"call_expression","named":true},{"type":"identifier","named":true},{"type":"member_expression","named":true}]}},{"type":"do_statement","named":true,"fields":{"body":{"multiple":false,"required":true,"types":[{"type":"statement","named":true}]},"condition":{"multiple":false,"required":true,"types":[{"type":"parenthesized_expression","named":true}]}}},{"type":"else_clause","named":true,"fields":{},"children":{"multiple":false,"required":true,"types":[{"type":"statement","named":true}]}},{"type":"empty_statement","named":true,"fields":{}},{"type":"export_clause","named":true,"fields":{},"children":{"multiple":true,"required":false,"types":[{"type":"export_specifier","named":true}]}},{"type":"export_specifier","named":true,"fields":{"alias":{"multiple":false,"required":false,"types":[{"type":"identifier","named":true},{"type":"string","named":true}]},"name":{"multiple":false,"required":true,"types":[{"type":"identifier","named":true},{"type":"string","named":true}]}}},{"type":"export_statement","named":true,"fields":{"declaration":{"multiple":false,"required":false,"types":[{"type":"declaration","named":true}]},"decorator":{"multiple":true,"required":false,"types":[{"type":"decorator","named":true}]},"source":{"multiple":false,"required":false,"types":[{"type":"string","named":true}]},"value":{"multiple":false,"required":false,"types":[{"type":"expression","named":true}]}},"children":{"multiple":false,"required":false,"types":[{"type":"export_clause","named":true},{"type":"namespace_export","named":true}]}},{"type":"expression_statement","named":true,"fields":{},"children":{"multiple":false,"required":true,"types":[{"type":"expression","named":true},{"type":"sequence_expression","named":true}]}},{"type":"field_definition","named":true,"fields":{"decorator":{"multiple":true,"required":false,"types":[{"type":"decorator","named":true}]},"property":{"multiple":false,"required":true,"types":[{"type":"computed_property_name","named":true},{"type":"number","named":true},{"type":"private_property_identifier","named":true},{"type":"property_identifier","named":true},{"type":"string","named":true}]},"value":{"multiple":false,"required":false,"types":[{"type":"expression","named":true}]}}},{"type":"finally_clause","named":true,"fields":{"body":{"multiple":false,"required":true,"types":[{"type":"statement_block","named":true}]}}},{"type":"for_in_statement","named":true,"fields":{"body":{"multiple":false,"required":true,"types":[{"type":"statement","named":true}]},"kind":{"multiple":false,"required":false,"types":[{"type":"const","named":false},{"type":"let","named":false},{"type":"var","named":false}]},"left":{"multiple":false,"required":true,"types":[{"type":"array_pattern","named":true},{"type":"identifier","named":true},{"type":"member_expression","named":true},{"type":"object_pattern","named":true},{"type":"parenthesized_expression","named":true},{"type":"subscript_expression","named":true},{"type":"undefined","named":true}]},"operator":{"multiple":false,"required":true,"types":[{"type":"in","named":false},{"type":"of","named":false}]},"right":{"multiple":false,"required":true,"types":[{"type":"expression","named":true},{"type":"sequence_expression","named":true}]},"value":{"multiple":false,"required":false,"types":[{"type":"expression","named":true}]}}},{"type":"for_statement","named":true,"fields":{"body":{"multiple":false,"required":true,"types":[{"type":"statement","named":true}]},"condition":{"multiple":false,"required":true,"types":[{"type":"empty_statement","named":true},{"type":"expression_statement","named":true}]},"increment":{"multiple":false,"required":false,"types":[{"type":"expression","named":true},{"type":"sequence_expression","named":true}]},"initializer":{"multiple":false,"required":true,"types":[{"type":"empty_statement","named":true},{"type":"expression_statement","named":true},{"type":"lexical_declaration","named":true},{"type":"variable_declaration","named":true}]}}},{"type":"formal_parameters","named":true,"fields":{},"children":{"multiple":true,"required":false,"types":[{"type":"assignment_pattern","named":true},{"type":"pattern","named":true}]}},{"type":"function_declaration","named":true,"fields":{"body":{"multiple":false,"required":true,"types":[{"type":"statement_block","named":true}]},"name":{"multiple":false,"required":true,"types":[{"type":"identifier","named":true}]},"parameters":{"multiple":false,"required":true,"types":[{"type":"formal_parameters","named":true}]}}},{"type":"function_expression","named":true,"fields":{"body":{"multiple":false,"required":true,"types":[{"type":"statement_block","named":true}]},"name":{"multiple":false,"required":false,"types":[{"type":"identifier","named":true}]},"parameters":{"multiple":false,"required":true,"types":[{"type":"formal_parameters","named":true}]}}},{"type":"generator_function","named":true,"fields":{"body":{"multiple":false,"required":true,"types":[{"type":"statement_block","named":true}]},"name":{"multiple":false,"required":false,"types":[{"type":"identifier","named":true}]},"parameters":{"multiple":false,"required":true,"types":[{"type":"formal_parameters","named":true}]}}},{"type":"generator_function_declaration","named":true,"fields":{"body":{"multiple":false,"required":true,"types":[{"type":"statement_block","named":true}]},"name":{"multiple":false,"required":true,"types":[{"type":"identifier","named":true}]},"parameters":{"multiple":false,"required":true,"types":[{"type":"formal_parameters","named":true}]}}},{"type":"glimmer_template","named":true,"fields":{"close_tag":{"multiple":false,"required":true,"types":[{"type":"glimmer_closing_tag","named":true}]},"open_tag":{"multiple":false,"required":true,"types":[{"type":"glimmer_opening_tag","named":true}]}}},{"type":"if_statement","named":true,"fields":{"alternative":{"multiple":false,"required":false,"types":[{"type":"else_clause","named":true}]},"condition":{"multiple":false,"required":true,"types":[{"type":"parenthesized_expression","named":true}]},"consequence":{"multiple":false,"required":true,"types":[{"type":"statement","named":true}]}}},{"type":"import","named":true,"fields":{}},{"type":"import_attribute","named":true,"fields":{},"children":{"multiple":false,"required":true,"types":[{"type":"object","named":true}]}},{"type":"import_clause","named":true,"fields":{},"children":{"multiple":true,"required":true,"types":[{"type":"identifier","named":true},{"type":"named_imports","named":true},{"type":"namespace_import","named":true}]}},{"type":"import_specifier","named":true,"fields":{"alias":{"multiple":false,"required":false,"types":[{"type":"identifier","named":true}]},"name":{"multiple":false,"required":true,"types":[{"type":"identifier","named":true},{"type":"string","named":true}]}}},{"type":"import_statement","named":true,"fields":{"source":{"multiple":false,"required":true,"types":[{"type":"string","named":true}]}},"children":{"multiple":true,"required":false,"types":[{"type":"import_attribute","named":true},{"type":"import_clause","named":true}]}},{"type":"jsx_attribute","named":true,"fields":{},"children":{"multiple":true,"required":true,"types":[{"type":"jsx_element","named":true},{"type":"jsx_expression","named":true},{"type":"jsx_namespace_name","named":true},{"type":"jsx_self_closing_element","named":true},{"type":"property_identifier","named":true},{"type":"string","named":true}]}},{"type":"jsx_closing_element","named":true,"fields":{"name":{"multiple":false,"required":false,"types":[{"type":"identifier","named":true},{"type":"jsx_namespace_name","named":true},{"type":"member_expression","named":true}]}}},{"type":"jsx_element","named":true,"fields":{"close_tag":{"multiple":false,"required":true,"types":[{"type":"jsx_closing_element","named":true}]},"open_tag":{"multiple":false,"required":true,"types":[{"type":"jsx_opening_element","named":true}]}},"children":{"multiple":true,"required":false,"types":[{"type":"html_character_reference","named":true},{"type":"jsx_element","named":true},{"type":"jsx_expression","named":true},{"type":"jsx_self_closing_element","named":true},{"type":"jsx_text","named":true}]}},{"type":"jsx_expression","named":true,"fields":{},"children":{"multiple":false,"required":false,"types":[{"type":"expression","named":true},{"type":"sequence_expression","named":true},{"type":"spread_element","named":true}]}},{"type":"jsx_namespace_name","named":true,"fields":{},"children":{"multiple":true,"required":true,"types":[{"type":"identifier","named":true}]}},{"type":"jsx_opening_element","named":true,"fields":{"attribute":{"multiple":true,"required":false,"types":[{"type":"jsx_attribute","named":true},{"type":"jsx_expression","named":true}]},"name":{"multiple":false,"required":false,"types":[{"type":"identifier","named":true},{"type":"jsx_namespace_name","named":true},{"type":"member_expression","named":true}]}}},{"type":"jsx_self_closing_element","named":true,"fields":{"attribute":{"multiple":true,"required":false,"types":[{"type":"jsx_attribute","named":true},{"type":"jsx_expression","named":true}]},"name":{"multiple":false,"required":true,"types":[{"type":"identifier","named":true},{"type":"jsx_namespace_name","named":true},{"type":"member_expression","named":true}]}}},{"type":"jsx_text","named":true,"fields":{}},{"type":"labeled_statement","named":true,"fields":{"body":{"multiple":false,"required":true,"types":[{"type":"statement","named":true}]},"label":{"multiple":false,"required":true,"types":[{"type":"statement_identifier","named":true}]}}},{"type":"lexical_declaration","named":true,"fields":{"kind":{"multiple":false,"required":true,"types":[{"type":"const","named":false},{"type":"let","named":false}]}},"children":{"multiple":true,"required":true,"types":[{"type":"variable_declarator","named":true}]}},{"type":"member_expression","named":true,"fields":{"object":{"multiple":false,"required":true,"types":[{"type":"expression","named":true},{"type":"import","named":true}]},"optional_chain":{"multiple":false,"required":false,"types":[{"type":"optional_chain","named":true}]},"property":{"multiple":false,"required":true,"types":[{"type":"private_property_identifier","named":true},{"type":"property_identifier","named":true}]}}},{"type":"meta_property","named":true,"fields":{}},{"type":"method_definition","named":true,"fields":{"body":{"multiple":false,"required":true,"types":[{"type":"statement_block","named":true}]},"decorator":{"multiple":true,"required":false,"types":[{"type":"decorator","named":true}]},"name":{"multiple":false,"required":true,"types":[{"type":"computed_property_name","named":true},{"type":"number","named":true},{"type":"private_property_identifier","named":true},{"type":"property_identifier","named":true},{"type":"string","named":true}]},"parameters":{"multiple":false,"required":true,"types":[{"type":"formal_parameters","named":true}]}}},{"type":"named_imports","named":true,"fields":{},"children":{"multiple":true,"required":false,"types":[{"type":"import_specifier","named":true}]}},{"type":"namespace_export","named":true,"fields":{},"children":{"multiple":false,"required":true,"types":[{"type":"identifier","named":true},{"type":"string","named":true}]}},{"type":"namespace_import","named":true,"fields":{},"children":{"multiple":false,"required":true,"types":[{"type":"identifier","named":true}]}},{"type":"new_expression","named":true,"fields":{"arguments":{"multiple":false,"required":false,"types":[{"type":"arguments","named":true}]},"constructor":{"multiple":false,"required":true,"types":[{"type":"new_expression","named":true},{"type":"primary_expression","named":true}]}}},{"type":"object","named":true,"fields":{},"children":{"multiple":true,"required":false,"types":[{"type":"method_definition","named":true},{"type":"pair","named":true},{"type":"shorthand_property_identifier","named":true},{"type":"spread_element","named":true}]}},{"type":"object_assignment_pattern","named":true,"fields":{"left":{"multiple":false,"required":true,"types":[{"type":"array_pattern","named":true},{"type":"object_pattern","named":true},{"type":"shorthand_property_identifier_pattern","named":true}]},"right":{"multiple":false,"required":true,"types":[{"type":"expression","named":true}]}}},{"type":"object_pattern","named":true,"fields":{},"children":{"multiple":true,"required":false,"types":[{"type":"object_assignment_pattern","named":true},{"type":"pair_pattern","named":true},{"type":"rest_pattern","named":true},{"type":"shorthand_property_identifier_pattern","named":true}]}},{"type":"pair","named":true,"fields":{"key":{"multiple":false,"required":true,"types":[{"type":"computed_property_name","named":true},{"type":"number","named":true},{"type":"private_property_identifier","named":true},{"type":"property_identifier","named":true},{"type":"string","named":true}]},"value":{"multiple":false,"required":true,"types":[{"type":"expression","named":true}]}}},{"type":"pair_pattern","named":true,"fields":{"key":{"multiple":false,"required":true,"types":[{"type":"computed_property_name","named":true},{"type":"number","named":true},{"type":"private_property_identifier","named":true},{"type":"property_identifier","named":true},{"type":"string","named":true}]},"value":{"multiple":false,"required":true,"types":[{"type":"assignment_pattern","named":true},{"type":"pattern","named":true}]}}},{"type":"parenthesized_expression","named":true,"fields":{},"children":{"multiple":false,"required":true,"types":[{"type":"expression","named":true},{"type":"sequence_expression","named":true}]}},{"type":"program","named":true,"fields":{},"children":{"multiple":true,"required":false,"types":[{"type":"hash_bang_line","named":true},{"type":"statement","named":true}]}},{"type":"regex","named":true,"fields":{"flags":{"multiple":false,"required":false,"types":[{"type":"regex_flags","named":true}]},"pattern":{"multiple":false,"required":true,"types":[{"type":"regex_pattern","named":true}]}}},{"type":"rest_pattern","named":true,"fields":{},"children":{"multiple":false,"required":true,"types":[{"type":"array_pattern","named":true},{"type":"identifier","named":true},{"type":"member_expression","named":true},{"type":"object_pattern","named":true},{"type":"subscript_expression","named":true},{"type":"undefined","named":true}]}},{"type":"return_statement","named":true,"fields":{},"children":{"multiple":false,"required":false,"types":[{"type":"expression","named":true},{"type":"sequence_expression","named":true}]}},{"type":"sequence_expression","named":true,"fields":{},"children":{"multiple":true,"required":true,"types":[{"type":"expression","named":true}]}},{"type":"spread_element","named":true,"fields":{},"children":{"multiple":false,"required":true,"types":[{"type":"expression","named":true}]}},{"type":"statement_block","named":true,"fields":{},"children":{"multiple":true,"required":false,"types":[{"type":"statement","named":true}]}},{"type":"string","named":true,"fields":{},"children":{"multiple":true,"required":false,"types":[{"type":"escape_sequence","named":true},{"type":"html_character_reference","named":true},{"type":"string_fragment","named":true}]}},{"type":"subscript_expression","named":true,"fields":{"index":{"multiple":false,"required":true,"types":[{"type":"expression","named":true},{"type":"sequence_expression","named":true}]},"object":{"multiple":false,"required":true,"types":[{"type":"expression","named":true}]},"optional_chain":{"multiple":false,"required":false,"types":[{"type":"optional_chain","named":true}]}}},{"type":"switch_body","named":true,"fields":{},"children":{"multiple":true,"required":false,"types":[{"type":"switch_case","named":true},{"type":"switch_default","named":true}]}},{"type":"switch_case","named":true,"fields":{"body":{"multiple":true,"required":false,"types":[{"type":"statement","named":true}]},"value":{"multiple":false,"required":true,"types":[{"type":"expression","named":true},{"type":"sequence_expression","named":true}]}}},{"type":"switch_default","named":true,"fields":{"body":{"multiple":true,"required":false,"types":[{"type":"statement","named":true}]}}},{"type":"switch_statement","named":true,"fields":{"body":{"multiple":false,"required":true,"types":[{"type":"switch_body","named":true}]},"value":{"multiple":false,"required":true,"types":[{"type":"parenthesized_expression","named":true}]}}},{"type":"template_string","named":true,"fields":{},"children":{"multiple":true,"required":false,"types":[{"type":"escape_sequence","named":true},{"type":"string_fragment","named":true},{"type":"template_substitution","named":true}]}},{"type":"template_substitution","named":true,"fields":{},"children":{"multiple":false,"required":true,"types":[{"type":"expression","named":true},{"type":"sequence_expression","named":true}]}},{"type":"ternary_expression","named":true,"fields":{"alternative":{"multiple":false,"required":true,"types":[{"type":"expression","named":true}]},"condition":{"multiple":false,"required":true,"types":[{"type":"expression","named":true}]},"consequence":{"multiple":false,"required":true,"types":[{"type":"expression","named":true}]}}},{"type":"throw_statement","named":true,"fields":{},"children":{"multiple":false,"required":true,"types":[{"type":"expression","named":true},{"type":"sequence_expression","named":true}]}},{"type":"try_statement","named":true,"fields":{"body":{"multiple":false,"required":true,"types":[{"type":"statement_block","named":true}]},"finalizer":{"multiple":false,"required":false,"types":[{"type":"finally_clause","named":true}]},"handler":{"multiple":false,"required":false,"types":[{"type":"catch_clause","named":true}]}}},{"type":"unary_expression","named":true,"fields":{"argument":{"multiple":false,"required":true,"types":[{"type":"expression","named":true}]},"operator":{"multiple":false,"required":true,"types":[{"type":"!","named":false},{"type":"+","named":false},{"type":"-","named":false},{"type":"delete","named":false},{"type":"typeof","named":false},{"type":"void","named":false},{"type":"~","named":false}]}}},{"type":"update_expression","named":true,"fields":{"argument":{"multiple":false,"required":true,"types":[{"type":"expression","named":true}]},"operator":{"multiple":false,"required":true,"types":[{"type":"++","named":false},{"type":"--","named":false}]}}},{"type":"variable_declaration","named":true,"fields":{},"children":{"multiple":true,"required":true,"types":[{"type":"variable_declarator","named":true}]}},{"type":"variable_declarator","named":true,"fields":{"name":{"multiple":false,"required":true,"types":[{"type":"array_pattern","named":true},{"type":"identifier","named":true},{"type":"object_pattern","named":true}]},"value":{"multiple":false,"required":false,"types":[{"type":"expression","named":true}]}}},{"type":"while_statement","named":true,"fields":{"body":{"multiple":false,"required":true,"types":[{"type":"statement","named":true}]},"condition":{"multiple":false,"required":true,"types":[{"type":"parenthesized_expression","named":true}]}}},{"type":"with_statement","named":true,"fields":{"body":{"multiple":false,"required":true,"types":[{"type":"statement","named":true}]},"object":{"multiple":false,"required":true,"types":[{"type":"parenthesized_expression","named":true}]}}},{"type":"yield_expression","named":true,"fields":{},"children":{"multiple":false,"required":false,"types":[{"type":"expression","named":true}]}},{"type":"!","named":false},{"type":"!=","named":false},{"type":"!==","named":false},{"type":"\\"","named":false},{"type":"${","named":false},{"type":"%","named":false},{"type":"%=","named":false},{"type":"&","named":false},{"type":"&&","named":false},{"type":"&&=","named":false},{"type":"&=","named":false},{"type":"\'","named":false},{"type":"(","named":false},{"type":")","named":false},{"type":"*","named":false},{"type":"**","named":false},{"type":"**=","named":false},{"type":"*=","named":false},{"type":"+","named":false},{"type":"++","named":false},{"type":"+=","named":false},{"type":",","named":false},{"type":"-","named":false},{"type":"--","named":false},{"type":"-=","named":false},{"type":".","named":false},{"type":"...","named":false},{"type":"/","named":false},{"type":"/=","named":false},{"type":"/>","named":false},{"type":":","named":false},{"type":";","named":false},{"type":"<","named":false},{"type":"</","named":false},{"type":"<<","named":false},{"type":"<<=","named":false},{"type":"<=","named":false},{"type":"=","named":false},{"type":"==","named":false},{"type":"===","named":false},{"type":"=>","named":false},{"type":">","named":false},{"type":">=","named":false},{"type":">>","named":false},{"type":">>=","named":false},{"type":">>>","named":false},{"type":">>>=","named":false},{"type":"?","named":false},{"type":"??","named":false},{"type":"??=","named":false},{"type":"@","named":false},{"type":"[","named":false},{"type":"]","named":false},{"type":"^","named":false},{"type":"^=","named":false},{"type":"`","named":false},{"type":"as","named":false},{"type":"async","named":false},{"type":"await","named":false},{"type":"break","named":false},{"type":"case","named":false},{"type":"catch","named":false},{"type":"class","named":false},{"type":"comment","named":true},{"type":"const","named":false},{"type":"continue","named":false},{"type":"debugger","named":false},{"type":"default","named":false},{"type":"delete","named":false},{"type":"do","named":false},{"type":"else","named":false},{"type":"escape_sequence","named":true},{"type":"export","named":false},{"type":"extends","named":false},{"type":"false","named":true},{"type":"finally","named":false},{"type":"for","named":false},{"type":"from","named":false},{"type":"function","named":false},{"type":"get","named":false},{"type":"glimmer_closing_tag","named":true},{"type":"glimmer_opening_tag","named":true},{"type":"hash_bang_line","named":true},{"type":"html_character_reference","named":true},{"type":"html_comment","named":true},{"type":"identifier","named":true},{"type":"if","named":false},{"type":"import","named":false},{"type":"in","named":false},{"type":"instanceof","named":false},{"type":"let","named":false},{"type":"new","named":false},{"type":"null","named":true},{"type":"number","named":true},{"type":"of","named":false},{"type":"optional_chain","named":true},{"type":"private_property_identifier","named":true},{"type":"property_identifier","named":true},{"type":"regex_flags","named":true},{"type":"regex_pattern","named":true},{"type":"return","named":false},{"type":"set","named":false},{"type":"shorthand_property_identifier","named":true},{"type":"shorthand_property_identifier_pattern","named":true},{"type":"statement_identifier","named":true},{"type":"static","named":false},{"type":"static get","named":false},{"type":"string_fragment","named":true},{"type":"super","named":true},{"type":"switch","named":false},{"type":"target","named":false},{"type":"this","named":true},{"type":"throw","named":false},{"type":"true","named":true},{"type":"try","named":false},{"type":"typeof","named":false},{"type":"undefined","named":true},{"type":"var","named":false},{"type":"void","named":false},{"type":"while","named":false},{"type":"with","named":false},{"type":"yield","named":false},{"type":"{","named":false},{"type":"|","named":false},{"type":"|=","named":false},{"type":"||","named":false},{"type":"||=","named":false},{"type":"}","named":false},{"type":"~","named":false}]');

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = __webpack_modules__;
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/ensure chunk */
/******/ 	(() => {
/******/ 		__webpack_require__.f = {};
/******/ 		// This file contains only the entry chunk.
/******/ 		// The chunk loading function for additional chunks
/******/ 		__webpack_require__.e = (chunkId) => {
/******/ 			return Promise.all(Object.keys(__webpack_require__.f).reduce((promises, key) => {
/******/ 				__webpack_require__.f[key](chunkId, promises);
/******/ 				return promises;
/******/ 			}, []));
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/get javascript chunk filename */
/******/ 	(() => {
/******/ 		// This function allow to reference async chunks
/******/ 		__webpack_require__.u = (chunkId) => {
/******/ 			// return url for filenames based on template
/******/ 			return "" + chunkId + ".index.js";
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/require chunk loading */
/******/ 	(() => {
/******/ 		// no baseURI
/******/ 		
/******/ 		// object to store loaded chunks
/******/ 		// "1" means "loaded", otherwise not loaded yet
/******/ 		var installedChunks = {
/******/ 			792: 1
/******/ 		};
/******/ 		
/******/ 		// no on chunks loaded
/******/ 		
/******/ 		var installChunk = (chunk) => {
/******/ 			var moreModules = chunk.modules, chunkIds = chunk.ids, runtime = chunk.runtime;
/******/ 			for(var moduleId in moreModules) {
/******/ 				if(__webpack_require__.o(moreModules, moduleId)) {
/******/ 					__webpack_require__.m[moduleId] = moreModules[moduleId];
/******/ 				}
/******/ 			}
/******/ 			if(runtime) runtime(__webpack_require__);
/******/ 			for(var i = 0; i < chunkIds.length; i++)
/******/ 				installedChunks[chunkIds[i]] = 1;
/******/ 		
/******/ 		};
/******/ 		
/******/ 		// require() chunk loading for javascript
/******/ 		__webpack_require__.f.require = (chunkId, promises) => {
/******/ 			// "1" is the signal for "already loaded"
/******/ 			if(!installedChunks[chunkId]) {
/******/ 				if(true) { // all chunks have JS
/******/ 					installChunk(require("./" + __webpack_require__.u(chunkId)));
/******/ 				} else installedChunks[chunkId] = 1;
/******/ 			}
/******/ 		};
/******/ 		
/******/ 		// no external install chunk
/******/ 		
/******/ 		// no HMR
/******/ 		
/******/ 		// no HMR manifest
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
const {
  CodeboltDev
} = __webpack_require__(5462);
const codebolt = (__webpack_require__(7601)["default"]);
codebolt.chat.onActionMessage().on("userMessage", async (req, response) => {
  let message = req.message;
  let codebotDev = new CodeboltDev(message.userMessage, [], [], response);
  await codebotDev.startTask();
});
module.exports = __webpack_exports__;
/******/ })()
;