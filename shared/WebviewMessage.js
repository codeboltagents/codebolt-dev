

const WebviewMessage = {
	type: [
		"apiConfiguration",
		"customInstructions",
		"alwaysAllowReadOnly",
		"webviewDidLaunch",
		"newTask",
		"askResponse",
		"clearTask",
		"didShowAnnouncement",
		"selectImages",
		"exportCurrentTask",
		"showTaskWithId",
		"deleteTaskWithId",
		"exportTaskWithId",
		"resetState",
		"requestOllamaModels",
		"openImage",
		"openFile"
	],
	text: undefined,
	askResponse: undefined,
	apiConfiguration: undefined,
	images: [],
	bool: undefined
};

const ClaudeAskResponse = ["yesButtonTapped", "noButtonTapped", "messageResponse"];
