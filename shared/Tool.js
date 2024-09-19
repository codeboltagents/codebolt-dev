const { Anthropic } = require("@anthropic-ai/sdk");

const ToolName = [
	"write_to_file",
	"read_file",
	"list_files",
	"list_code_definition_names",
	"search_files",
	"execute_command",
	"ask_followup_question",
	"attempt_completion"
];

const Tool = (tool) => {
	const { name, ...rest } = tool;
	if (ToolName.includes(name)) {
		return { ...rest, name };
	}
	throw new Error("Invalid tool name");
};
