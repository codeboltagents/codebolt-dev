// type that represents json data that is sent from extension to webview, called ExtensionMessage and has 'type' enum which can be 'plusButtonTapped' or 'settingsButtonTapped' or 'hello'

const ApiConfiguration = require("./api").ApiConfiguration;
const HistoryItem = require("./HistoryItem").HistoryItem;

// webview will hold state
const ExtensionMessage = {
	type: "action" | "state" | "selectedImages" | "ollamaModels" | "theme",
	text: undefined,
	action: "chatButtonTapped" | "settingsButtonTapped" | "historyButtonTapped" | "didBecomeVisible",
	state: undefined,
	images: [],
	models: []
};

const ExtensionState = {
	version: "",
	apiConfiguration: undefined,
	customInstructions: undefined,
	alwaysAllowReadOnly: undefined,
	uriScheme: undefined,
	claudeMessages: [],
	taskHistory: [],
	shouldShowAnnouncement: false
};

const ClaudeMessage = {
	ts: 0,
	type: "ask" | "say",
	ask: undefined,
	say: undefined,
	text: undefined,
	images: []
};

const ClaudeAsk = [
	"followup",
	"command",
	"command_output",
	"completion_result",
	"tool",
	"api_req_failed",
	"resume_task",
	"resume_completed_task",
	"mistake_limit_reached"
];

const ClaudeSay = [
	"task",
	"error",
	"api_req_started",
	"api_req_finished",
	"text",
	"completion_result",
	"user_feedback",
	"user_feedback_diff",
	"api_req_retried",
	"command_output",
	"tool",
	"shell_integration_warning"
];

const ClaudeSayTool = {
	tool: [
		"editedExistingFile",
		"newFileCreated",
		"readFile",
		"listFilesTopLevel",
		"listFilesRecursive",
		"listCodeDefinitionNames",
		"searchFiles"
	],
	path: undefined,
	diff: undefined,
	content: undefined,
	regex: undefined,
	filePattern: undefined
};
