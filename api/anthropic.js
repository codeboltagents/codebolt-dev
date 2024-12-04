const { Anthropic } = require("@anthropic-ai/sdk");
const { anthropicDefaultModelId, anthropicModels } = require("../shared/api");
const { send_message_to_llm } = require("../utils/codebolt-helper");

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
            full:true,
            model: "",
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
        return {
            id: this.options.openAiModelId ?? "",
            info: {}, // Assuming a default structure since ModelInfo is not used
        };
    }
}

module.exports = {
    AnthropicHandler
}
