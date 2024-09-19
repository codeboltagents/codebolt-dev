const { Anthropic } = require("@anthropic-ai/sdk");
const { anthropicDefaultModelId, anthropicModels } = require("../shared/api");

 class AnthropicHandler {
    constructor(options) {
        this.options = options;
        this.client = new Anthropic({
            apiKey: this.options.apiKey,
            baseURL: this.options.anthropicBaseUrl || undefined,
        });
    }

    async createMessage(systemPrompt, messages, tools) {
        console.log("using anthropic")
        // console.log(systemPrompt, messages, tools)
        const modelId = this.getModel().id;
        switch (modelId) {
            case "claude-3-5-sonnet-20240620":
            case "claude-3-opus-20240229":
            case "claude-3-haiku-20240307": {
                const userMsgIndices = messages.reduce(
                    (acc, msg, index) => (msg.role === "user" ? [...acc, index] : acc),
                    []
                );
                const lastUserMsgIndex = userMsgIndices[userMsgIndices.length - 1] ?? -1;
                const secondLastMsgUserIndex = userMsgIndices[userMsgIndices.length - 2] ?? -1;
                const message = await this.client.beta.promptCaching.messages.create({
                    model: modelId,
                    max_tokens: this.getModel().info.maxTokens,
                    system: [{ text: systemPrompt, type: "text", cache_control: { type: "ephemeral" } }],
                    messages: messages.map((message, index) => {
                        if (index === lastUserMsgIndex || index === secondLastMsgUserIndex) {
                            return {
                                ...message,
                                content:
                                    typeof message.content === "string"
                                        ? [
                                            {
                                                type: "text",
                                                text: message.content,
                                                cache_control: { type: "ephemeral" },
                                            },
                                        ]
                                        : message.content.map((content, contentIndex) =>
                                            contentIndex === message.content.length - 1
                                                ? { ...content, cache_control: { type: "ephemeral" } }
                                                : content
                                        ),
                            };
                        }
                        return message;
                    }),
                    tools,
                    tool_choice: { type: "auto" },
                }, (() => {
                    switch (modelId) {
                        case "claude-3-5-sonnet-20240620":
                            return {
                                headers: {
                                    "anthropic-beta": "prompt-caching-2024-07-31",
                                },
                            };
                        case "claude-3-haiku-20240307":
                            return {
                                headers: { "anthropic-beta": "prompt-caching-2024-07-31" },
                            };
                        default:
                            return undefined;
                    }
                })());
                return { message };
            }
            default: {
                const message = await this.client.messages.create({
                    model: modelId,
                    max_tokens: this.getModel().info.maxTokens,
                    system: [{ text: systemPrompt, type: "text" }],
                    messages,
                    tools,
                    tool_choice: { type: "auto" },
                });
                return { message };
            }
        }
    }

    getModel() {

        const modelId = this.options.apiModelId;
        if (modelId && modelId in anthropicModels) {
            return { id: modelId, info: anthropicModels[modelId] };
        }
        return { id: anthropicDefaultModelId, info: anthropicModels[anthropicDefaultModelId] };
    }
}

module.exports={
    AnthropicHandler
}
