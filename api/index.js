

const { AnthropicHandler } = require("./anthropic");

const { OpenAiHandler } = require("./openai");


function buildApiHandler(configuration) {
	const { apiProvider, ...options } = configuration;
	switch (apiProvider) {
		case "anthropic":
			return new AnthropicHandler(options);
		case "openai":
			return new OpenAiHandler(options);
	
		default:
			return new AnthropicHandler(options);
	}
}

module.exports = { buildApiHandler };
