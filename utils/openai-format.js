
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
									return part.text;
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
							image_url: { url: `data:${part.source.media_type};base64,${part.source.data}` },
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
									image_url: { url: `data:${part.source.media_type};base64,${part.source.data}` },
								};
							}
							return { type: "text", text: part.text };
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
							return part.text;
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

module.exports={
	convertToOpenAiMessages,
	convertToAnthropicMessage
}
