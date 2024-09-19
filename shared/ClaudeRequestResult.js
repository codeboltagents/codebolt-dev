export class ClaudeRequestResult {
	constructor(didEndLoop, inputTokens, outputTokens) {
		this.didEndLoop = didEndLoop;
		this.inputTokens = inputTokens;
		this.outputTokens = outputTokens;
	}
}
