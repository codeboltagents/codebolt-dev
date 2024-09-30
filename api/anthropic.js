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
        let createParams = {
            model: modelId,
            max_tokens: 0, //this.getModel().info.maxTokens,
            system: [{ text: systemPrompt, type: "text" }],
            messages,
            tools,
            tool_choice: { type: "auto" },
        }

        const message = await send_message_to_llm(createParams) //await this.client.chat.completions.create(createParams);
        return { message };
       
    }

    getModel() {

        const modelId = this.options.apiModelId;
        if (modelId && modelId in anthropicModels) {
            return { id: modelId, info: anthropicModels[modelId] };
        }
        return { id: anthropicDefaultModelId, info: anthropicModels[anthropicDefaultModelId] };
    }
}

module.exports = {
    AnthropicHandler
}
