const codebolt = require('@codebolt/codeboltjs').default
let projectPath;
/**
 * Sends a message to the user interface.
 * @param {string} message - The message to be sent to the UI.
 */
async function send_message_to_ui(message, type) {
    await codebolt.waitForConnection();
    let paylod = {};
    let agentMessage;
    switch (type) {
        case "tool":
            const tool = JSON.parse(message || "{}")
            switch (tool.tool) {
                case "readFile":
                    agentMessage = "Claude read this file:";
                    paylod.content = tool.content
                    paylod.path = tool.path;
                    break;
                case "listFilesTopLevel":
                    agentMessage = "Claude viewed the top level files in this directory:";
                    paylod.content = tool.content
                    paylod.path = tool.path
                    break;
                case "listFilesRecursive":
                    agentMessage = "Claude recursively viewed all files in this directory:";
                    paylod.content = tool.content
                    paylod.path = tool.path
                    break;
                case "listCodeDefinitionNames":
                    paylod.content = tool.content
                    paylod.path = tool.path
                    agentMessage = "Claude viewed source code definition names used in this directory:";
                    break;
                case "searchFiles":
                    paylod.content = tool.content
                    paylod.path = tool.path + (tool.filePattern ? `/(${tool.filePattern})` : "")
                    agentMessage = `Claude searched this directory for <code>{tool.regex}</code>:`;
                    break;
                default:
                    return null
                    break;
            }
            paylod.type="file"
            
            default:
                agentMessage = message
                break;
    }
   await send_message(agentMessage,paylod)
}
async function ask_question(question, type) {
    let buttons = [{
        text: "Yes",
        value: "yesButtonTapped"
    }, {
        text: "No",
        value: "noButtonTapped"
    }];
    let paylod = {
        type: "",
        path: "",
        content: ""
    }
    let agentMessage = ""
    function setPrimaryButtonText(text) {
        buttons[0].text = text
        // buttons[0].value=text
    }
    function setSecondaryButtonText(text) {
        if (text === undefined) {
            buttons.splice(1, 1); // Remove the second button from the array
        }
        else
        buttons[1].value = text
    }
    switch (type) {
        case "api_req_failed":
            setPrimaryButtonText("Retry")
            setSecondaryButtonText("Start New Task")
            break
        case "mistake_limit_reached":
            setPrimaryButtonText("Proceed Anyways")
            setSecondaryButtonText("Start New Task")
            break
        case "followup":
            // setPrimaryButtonText(undefined)
            // setSecondaryButtonText(undefined)
            break
        case "tool":
            const tool = JSON.parse(question || "{}")
            switch (tool.tool) {

                case "editedExistingFile":
                    agentMessage = "Codebolt wants to edit this file";
                    paylod.content = tool.diff
                    paylod.path = tool.path;

                    setPrimaryButtonText("Save");
                    setSecondaryButtonText("Reject");
                    break;

                case "newFileCreated":
                    agentMessage = "Codebolt wants to create a new file:";
                    setPrimaryButtonText("Save");
                    paylod.content = tool.content
                    paylod.path = tool.path;
                    setSecondaryButtonText("Reject");
                    break;

                case "readFile":
                    agentMessage = "Codebolt wants to read this file:";
                    paylod.content = tool.content
                    paylod.path = tool.path;
                    setPrimaryButtonText("Approve");
                    setSecondaryButtonText("Reject");
                    break;
                case "listFilesTopLevel":
                    agentMessage = "Codebolt wants to view the top level files in this directory:";
                    paylod.content = tool.content
                    paylod.path = tool.path;
                    setPrimaryButtonText("Approve");
                    setSecondaryButtonText("Reject");
                    break;

                case "listFilesRecursive":
                    paylod.content = tool.content
                    paylod.path = tool.path;
                    agentMessage = "Codebolt wants to recursively view all files in this directory:";
                    setPrimaryButtonText("Approve");
                    setSecondaryButtonText("Reject");
                    break;
                case "listCodeDefinitionNames":
                    paylod.content = tool.content
                    paylod.path = tool.path;
                    agentMessage = "Codebolt wants to view source code definition names used in this directory:";
                    setPrimaryButtonText("Approve");
                    setSecondaryButtonText("Reject");
                    break;
                case "searchFiles":
                    paylod.content = tool.content
                    paylod.path = tool.path + (tool.filePattern ? `/(${tool.filePattern})` : "")
                    agentMessage = `Codebolt wants to search this directory for ${tool.regex}:`;
                    setPrimaryButtonText("Approve");
                    setSecondaryButtonText("Reject");
                    break;
                default:
                    return null
                    break;

            }
            paylod.type = tool.tool
            question = undefined
            await send_message(agentMessage, paylod)
            break
        case "command":
            paylod.type="command"
            agentMessage = "Codebolt wants to execute this command:";
            await send_message(agentMessage,paylod)
            question = undefined
            setPrimaryButtonText("Run Command")
            setSecondaryButtonText("Reject")
            break
        case "command_output":
            setPrimaryButtonText("Proceed While Running")
            setSecondaryButtonText(undefined)
            break
        case "completion_result":
            setPrimaryButtonText("Start New Task")
            setSecondaryButtonText(undefined)
            break
        case "resume_task":
            setPrimaryButtonText("Resume Task")
            setSecondaryButtonText(undefined)
            break
        case "resume_completed_task":
            setPrimaryButtonText("Start New Task")
            setSecondaryButtonText(undefined)
            break
    }
    // console.log("sending message ", question, buttons)
    const { message } = await codebolt.chat.sendConfirmationRequest(question, buttons);
    // console.log(message.userMessage);
    return message.userMessage;
}
async function send_message(message,paylod){
    console.log(JSON.stringify(message,paylod))
    codebolt.chat.sendMessage(message,paylod)
}


async function executeCommand(command) {
    const response = await codebolt.terminal.executeCommand(command);
    return response
}

/**
 * Sends a message to the Language Learning Model (LLM).
 * @param {string} message - The message to be sent to the LLM.
 * @param {string} model - The LLM model to use (e.g., GPT-4, Codebolt-3).
 */
async function send_message_to_llm(prompt) {
    let { message } = await codebolt.llm.inference(prompt.messages);
    return message
}




async function currentProjectPath() {
    await codebolt.waitForConnection();

    if (projectPath) {
        return projectPath;
    } else {
        // Call a function or handle the case when projectPath is not available
        // For example, you might want to throw an error or return a default value
        let { projectPath } = await codebolt.project.getProjectPath();
        console.log(projectPath)
        currentProjectPath = projectPath
        return currentProjectPath

    }
}
module.exports = {
    send_message_to_ui,
    send_message_to_llm,

  
    ask_question,
    executeCommand,
    currentProjectPath
}
