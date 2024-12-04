module.exports= class HistoryItem {
	constructor(id, ts, task, tokensIn, tokensOut, totalCost, cacheWrites = 0, cacheReads = 0) {
		this.id = id;
		this.ts = ts;
		this.task = task;
		this.tokensIn = tokensIn;
		this.tokensOut = tokensOut;
		this.cacheWrites = cacheWrites;
		this.cacheReads = cacheReads;
		this.totalCost = totalCost;
	}
}
