

const { AnthropicHandler } = require("./anthropic");

const { OpenAiHandler } = require("./openai");


function buildApiHandler(configuration) {
	const { apiProvider, ...options } = configuration;
	switch (apiProvider.toLowerCase()) {
		case "anthropic":
			return new AnthropicHandler(options);
		case "openai":
			return new OpenAiHandler(options);
	
		default:
			return new OpenAiHandler(options);
	}
}

module.exports = { buildApiHandler };
