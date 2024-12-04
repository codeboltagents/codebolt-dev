const OpenAI = require("openai").default;
const { AzureOpenAI } = require("openai");
const { convertToAnthropicMessage, convertToOpenAiMessages } = require("../utils/openai-format");
const { send_message_to_llm } = require("../utils/codebolt-helper");

class OpenAiHandler {
	options;
	client;
    constructor(options) {
        this.options = options || {}; // Ensure options is defined
        
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
            full:true,
            // model: this.options.openAiModelId ?? "",
            messages: openAiMessages,
            tools: openAiTools,
            tool_choice: "auto",
        };
        // console.log(createParams.tools)
        const completion = await send_message_to_llm(createParams) //await this.client.chat.completions.create(createParams);
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
