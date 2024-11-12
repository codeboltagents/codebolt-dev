const os = require("os");
const path = require("path");
// import * as vscode from "vscode";

function downloadTask(dateTs, conversationHistory) {
	// File name
	const date = new Date(dateTs);
	const month = date.toLocaleString("en-US", { month: "short" }).toLowerCase();
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
	const markdownContent = conversationHistory
		.map((message) => {
			const role = message.role === "user" ? "**User:**" : "**Assistant:**";
			const content = Array.isArray(message.content)
				? message.content.map((block) => formatContentBlockToMarkdown(block, conversationHistory)).join("\n")
				: message.content;
			return `${role}\n\n${content}\n\n`;
		})
		.join("---\n\n");

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
				input = Object.entries(block.input)
					.map(([key, value]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`)
					.join("\n");
			} else {
				input = String(block.input);
			}
			return `[Tool Use: ${block.name}]\n${input}`;
		case "tool_result":
			const toolName = findToolName(block.tool_use_id, messages);
			if (typeof block.content === "string") {
				return `[${toolName}${block.is_error ? " (Error)" : ""}]\n${block.content}`;
			} else if (Array.isArray(block.content)) {
				return `[${toolName}${block.is_error ? " (Error)" : ""}]\n${block.content
					.map((contentBlock) => formatContentBlockToMarkdown(contentBlock, messages))
					.join("\n")}`;
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
			openAiMessages.push({ role: anthropicMessage.role, content: anthropicMessage.content });
		} else {
			if (anthropicMessage.role === "user") {
				const { nonToolMessages, toolMessages } = anthropicMessage.content.reduce(
					(acc, part) => {
						if (part.type === "tool_result") {
							acc.toolMessages.push(part);
						} else if (part.type === "text" || part.type === "image") {
							acc.nonToolMessages.push(part);
						}
						return acc;
					},
					{ nonToolMessages: [], toolMessages: [] }
				);

				let toolResultImages = [];
				toolMessages.forEach((toolMessage) => {
					let content;

					if (typeof toolMessage.content === "string") {
						content = toolMessage.content;
					} else {
						content =
							toolMessage.content
								.map((part) => {
									if (part.type === "image") {
										toolResultImages.push(part);
										return "(see following user message for image)";
									}
									return part.text || "";
								})
								.join("\n") || "";
					}
					openAiMessages.push({
						role: "tool",
						tool_call_id: toolMessage.tool_use_id,
						content: content,
					});
				});

				if (toolResultImages.length > 0) {
					openAiMessages.push({
						role: "user",
						content: toolResultImages.map((part) => ({
							type: "image_url",
							image_url: { url: `data:${part.image_url?.url};base64,${part.image_url?.url}` },
						})),
					});
				}

				if (nonToolMessages.length > 0) {
					openAiMessages.push({
						role: "user",
						content: nonToolMessages.map((part) => {
							if (part.type === "image") {
								return {
									type: "image_url",
									image_url: { url: `data:${part.image_url?.url};base64,${part.image_url?.url}` },
								};
							}
							return { type: "text", text: part.text || "" };
						}),
					});
				}
			} else if (anthropicMessage.role === "assistant") {
				const { nonToolMessages, toolMessages } = anthropicMessage.content.reduce(
					(acc, part) => {
						if (part.type === "tool_use") {
							acc.toolMessages.push(part);
						} else if (part.type === "text" || part.type === "image") {
							acc.nonToolMessages.push(part);
						}
						return acc;
					},
					{ nonToolMessages: [], toolMessages: [] }
				);

				let content;
				if (nonToolMessages.length > 0) {
					content = nonToolMessages
						.map((part) => {
							if (part.type === "image") {
								return "";
							}
							return part.text || "";
						})
						.join("\n");
				}

				let tool_calls = toolMessages.map((toolMessage) => ({
					id: toolMessage.id,
					type: "function",
					function: {
						name: toolMessage.name,
						arguments: JSON.stringify(toolMessage.input),
					},
				}));

				openAiMessages.push({
					role: "assistant",
					content,
					tool_calls: tool_calls.length > 0 ? tool_calls : undefined,
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
		content: [
			{
				type: "text",
				text: openAiMessage.content || "",
			},
		],
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
			output_tokens: completion.usage?.completion_tokens || 0,
		},
	};

	if (openAiMessage.tool_calls && openAiMessage.tool_calls.length > 0) {
		anthropicMessage.content.push(
			...openAiMessage.tool_calls.map((toolCall) => {
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
					input: parsedInput,
				};
			})
		);
	}
	return anthropicMessage;
}

module.exports= {
	downloadTask,
	formatContentBlockToMarkdown,
	convertToAnthropicMessage,
	findToolName,
	convertToOpenAiMessages
};
