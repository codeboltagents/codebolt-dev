import codebolt from '@codebolt/codeboltjs';
import { ask_question, attemptApiRequest, executeTool, formatImagesIntoBlocks, getEnvironmentDetails, handleConsecutiveError, send_message_to_ui, findLast, findLastIndex, formatContentBlockToMarkdown } from "./helper"
import { localState } from './localstate';

codebolt.chat.onActionMessage().on("userMessage", async (req, response) => {
    await codebolt.waitForConnection();
    let { projectPath } = await codebolt.project.getProjectPath();

	//TODO: use agent state instead of localState.apiConversationHistory
    localState.apiConversationHistory = [
        {
            type: "text",
            text: `<task>\n${req.message.userMessage}\n</task>`,
        },
        ...req.message.uploadedImages || [],
    ];
    
    let includeFileDetails = true;
    let nextUserContent = localState.apiConversationHistory; 
    while (true) {
        await handleConsecutiveError(localState.consecutiveMistakeCount, nextUserContent);
        const environmentDetails = await getEnvironmentDetails(projectPath, includeFileDetails);
        if (includeFileDetails) {
            nextUserContent.push({ type: "text", text: environmentDetails });
           //TODO: use agent state instead of localState.apiConversationHistory
            await localState.apiConversationHistory.push({ role: "user", content: nextUserContent });
        } else {
            for (let userMessage of nextUserContent) {
               //TODO: use agent state instead of localState.apiConversationHistory
                await localState.apiConversationHistory.push(userMessage);
            }
        }
        try {
            const response = await attemptApiRequest(projectPath);
            let assistantResponses = [];
            for (const contentBlock of response.choices) {
                if (contentBlock.message) {
                    assistantResponses.push(contentBlock.message);
                    if (contentBlock.message)
                        await send_message_to_ui("text", contentBlock.message.content);
                }
            }
            if (assistantResponses.length > 0) {
                for (let assistantResponse of assistantResponses) {
                   //TODO: use agent state instead of localState.apiConversationHistory
                    await localState.apiConversationHistory.push(assistantResponse);
                }
            } else {
               //TODO: use agent state instead of localState.apiConversationHistory
                await localState.apiConversationHistory.push({
                    role: "assistant",
                    content: [{ type: "text", text: "Failure: I did not provide a response." }],
                });
            }
            let toolResults = [];
            let attemptCompletionBlock;
            let userRejectedATool = false;
            const contentBlock = response.choices[0];
            if (contentBlock.message && contentBlock.message.tool_calls) {
                for (const tool of contentBlock.message.tool_calls) {
                    const toolName = tool.function.name;
                    const toolInput = JSON.parse(tool.function.arguments || "{}");
                    const toolUseId = tool.id;
                    if (userRejectedATool) {
                        toolResults.push({
                            type: "tool",
                            tool_use_id: toolUseId,
                            content: "Skipping tool execution due to previous tool user rejection.",
                        });
                        continue;
                    }

                    if (toolName === "attempt_completion") {
                        attemptCompletionBlock = tool;
                    } else {
                        const [didUserReject, result] = await executeTool(toolName, toolInput);
                        console.log("result", result);
                        toolResults.push({
                            role: "tool",
                            tool_call_id: toolUseId,
                            content: result,
                        });
                        if (didUserReject) {
                            userRejectedATool = true;
                        }
                    }
                }
            }
            let didEndLoop = false;
            if (attemptCompletionBlock) {
                let [_, result] = await executeTool(
                    attemptCompletionBlock.function.name,
                    JSON.parse(attemptCompletionBlock.function.arguments || "{}")
                );
                if (result === "") {
                    didEndLoop = true;
                    result = "The user is satisfied with the result.";
                }
                console.log("result", result);
                toolResults.push({
                    role: "tool",
                    tool_call_id: attemptCompletionBlock.id,
                    content: result,
                });
            }
            if (toolResults.length > 0) {
                if (didEndLoop) {
                    for (let result of toolResults) {
                      //TODO: use agent state instead of localState.apiConversationHistory
                        await localState.apiConversationHistory.push(result);
                    }
                   //TODO: use agent state instead of localState.apiConversationHistory
                    await localState.apiConversationHistory.push({
                        role: "assistant",
                        content: [
                            {
                                type: "text",
                                text: "I am pleased you are satisfied with the result. Do you have a new task for me?",
                            },
                        ]
                    });
                } else {
                    nextUserContent = toolResults;
                    includeFileDetails = false;
                    continue;
                }
            }
            if (didEndLoop) {
                break;
            }
        } catch (error) {
            break;
        }
        nextUserContent = [
            {
                type: "text",
                text: "If you have completed the user's task, use the attempt_completion tool. If you require additional information from the user, use the ask_followup_question tool. Otherwise, if you have not completed the task and do not need additional information, then proceed with the next step of the task. (This is an automated message, so do not respond to it conversationally.)",
            },
        ];
        localState.consecutiveMistakeCount++;
    }
    response("ok");
});