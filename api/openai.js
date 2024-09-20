const OpenAI = require("openai").default;
const { AzureOpenAI } = require("openai");
const { convertToAnthropicMessage, convertToOpenAiMessages } = require("../utils/openai-format");

class OpenAiHandler {
	options;
	client;
    constructor(options) {
        this.options = options || {}; // Ensure options is defined
        // Azure API shape slightly differs from the core API shape: https://github.com/openai/openai-node?tab=readme-ov-file#microsoft-azure-openai
        if (this.options.openAiBaseUrl && this.options.openAiBaseUrl.toLowerCase().includes("azure.com")) {
            this.client = new AzureOpenAI({
                baseURL: this.options.openAiBaseUrl,
                apiKey: this.options.openAiApiKey,
                // https://learn.microsoft.com/en-us/azure/ai-services/openai/api-version-deprecation
                // https://learn.microsoft.com/en-us/azure/ai-services/openai/reference#api-specs
                apiVersion: "2024-08-01-preview",
            });
        } else {
            this.client = new OpenAI({
                baseURL: this.options.openAiBaseUrl,
                apiKey: this.options.openAiApiKey,
            });
        }
    }

    async createMessage(systemPrompt, messages, tools) {
        const openAiMessages = [
            { role: "system", content: systemPrompt },
            ...convertToOpenAiMessages(messages),
        ];
        // console.log(openAiMessages)
        const openAiTools = tools.map((tool) => ({
            type: "function",
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.input_schema,
            },
        }));
        const createParams = {
            model: this.options.openAiModelId ?? "",
            messages: openAiMessages,
            tools: openAiTools,
            tool_choice: "auto",
        };
        const completion = await this.client.chat.completions.create(createParams);
        // console.log(JSON.stringify(completion))
        const errorMessage = completion.error?.message;
        if (errorMessage) {
            throw new Error(errorMessage);
        }
        const anthropicMessage = convertToAnthropicMessage(completion);
        return { message: anthropicMessage };
    }

    getModel() {
        return {
            id: this.options.openAiModelId ?? "",
            info: {}, // Assuming a default structure since ModelInfo is not used
        };
    }
}

module.exports={
    OpenAiHandler
}
