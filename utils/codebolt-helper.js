const codebolt = require('@codebolt/codeboltjs').default
let projectPath;
const fs = require('fs').promises;
const path = require('path');
/**
 * Sends a message to the user interface.
 * @param {string} message - The message to be sent to the UI.
 */
const COMMAND_OUTPUT_STRING = "Output:"
async function send_message_to_ui(message, type) {
    await codebolt.waitForConnection();
    let paylod = {};
    let agentMessage;
    switch (type) {
        case "tool":
            const tool = JSON.parse(message || "{}")
            switch (tool.tool) {
                case "readFile":
                    paylod.type = "file"
                    agentMessage = "Codebolt read this file:";
                    paylod.content = tool.content
                    paylod.path = tool.path;
                    break;
                case "listFilesTopLevel":
                    paylod.type = "file"
                    agentMessage = "Codebolt viewed the top level files in this directory:";
                    paylod.content = tool.content
                    paylod.path = tool.path
                    break;
                case "listFilesRecursive":
                    paylod.type = "file"
                    agentMessage = "Codebolt recursively viewed all files in this directory:";
                    paylod.content = tool.content
                    paylod.path = tool.path
                    break;
                case "listCodeDefinitionNames":
                    paylod.type = "file"
                    paylod.content = tool.content
                    paylod.path = tool.path
                    agentMessage = "Codebolt viewed source code definition names used in this directory:";
                    break;
                case "searchFiles":
                    paylod.type = "file"
                    paylod.content = tool.content
                    paylod.path = tool.path + (tool.filePattern ? `/(${tool.filePattern})` : "")
                    agentMessage = `Codebolt searched this directory for <code>{tool.regex}</code>:`;
                    break;
                default:
                    return null
                    break;
            }



        default:
            agentMessage = message
            break;
    }
    await send_message(agentMessage, paylod)
}
async function ask_question(question, type) {
    console.log("question is",question,type)
    try {
        let buttons = [];
    let paylod = {
        type: "",
        path: "",
        content: ""
    }
    let agentMessage = ""
    function setPrimaryButtonText(text) {
        if (text === undefined) {
           
        }
        else {
            buttons[0].text = text
            buttons[0].value = text
        }

    }
    function setSecondaryButtonText(text) {
        if (text === undefined) {
           
        }
        else {
            buttons[1].value = text
            buttons[1].text = text
        }

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
            setPrimaryButtonText(undefined)
            setSecondaryButtonText(undefined)
            break
        case "tool":
            const tool = JSON.parse(question || "{}")
            switch (tool.tool) {

                case "editedExistingFile":
                    agentMessage = "Codebolt wants to edit this file";
                    paylod.content = tool.diff
                    paylod.path = tool.path;
                    paylod.type = "file"
                    setPrimaryButtonText("Save");
                    setSecondaryButtonText("Reject");
                    break;

                case "newFileCreated":
                    agentMessage = "Codebolt wants to create a new file:";
                    setPrimaryButtonText("Save");
                    paylod.content = tool.content
                    paylod.path = tool.path;
                    paylod.type = "file"
                    setSecondaryButtonText("Reject");
                    break;

                case "readFile":
                    agentMessage = "Codebolt wants to read this file:";
                    paylod.content = tool.content
                    paylod.path = tool.path;
                    setPrimaryButtonText("Approve");
                    setSecondaryButtonText("Reject");
                    paylod.type = "file"
                    break;
                case "listFilesTopLevel":
                    agentMessage = "Codebolt wants to view the top level files in this directory:";
                    paylod.content = tool.content
                    paylod.path = tool.path;
                    setPrimaryButtonText("Approve");
                    setSecondaryButtonText("Reject");
                    paylod.type = "file"
                    break;

                case "listFilesRecursive":
                    paylod.content = tool.content
                    paylod.path = tool.path;
                    agentMessage = "Codebolt wants to recursively view all files in this directory:";
                    setPrimaryButtonText("Approve");
                    setSecondaryButtonText("Reject");
                    paylod.type = "file"
                    break;
                case "listCodeDefinitionNames":
                    paylod.content = tool.content
                    paylod.path = tool.path;
                    agentMessage = "Codebolt wants to view source code definition names used in this directory:";
                    setPrimaryButtonText("Approve");
                    setSecondaryButtonText("Reject");
                    paylod.type = "file"
                    break;
                case "searchFiles":
                    paylod.content = tool.content
                    paylod.path = tool.path + (tool.filePattern ? `/(${tool.filePattern})` : "")
                    agentMessage = `Codebolt wants to search this directory for ${tool.regex}:`;
                    setPrimaryButtonText("Approve");
                    setSecondaryButtonText("Reject");
                    paylod.type = "file"
                    break;
                default:
                    return null
                    break;

            }
            question = undefined
            await send_message(agentMessage, paylod)
            break
        case "command":
            paylod.type = "command"
            const splitMessage = (text) => {
                const outputIndex = text.indexOf(COMMAND_OUTPUT_STRING)
                if (outputIndex === -1) {
                    return { command: text, output: "" }
                }
                return {
                    command: text.slice(0, outputIndex).trim(),
                    output: text
                        .slice(outputIndex + COMMAND_OUTPUT_STRING.length)
                        .trim()
                        .split("")
                        .map((char) => {
                            switch (char) {
                                case "\t":
                                    return "→   "
                                case "\b":
                                    return "⌫"
                                case "\f":
                                    return "⏏"
                                case "\v":
                                    return "⇳"
                                default:
                                    return char
                            }
                        })
                        .join(""),
                }
            }
            const { command, output } = splitMessage(question || "")
            paylod.command = command;
            agentMessage = "Codebolt wants to execute this command:";
            await send_message(agentMessage, paylod)
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
    const response = await codebolt.chat.sendConfirmationRequest(question, buttons, true);
    
    console.log("codebolt confirmation response", response);
    return response
    } catch (error) {
        
    }
  
    

}
async function send_message(message, paylod) {
    console.log(JSON.stringify(message, paylod))
    codebolt.chat.sendMessage(message, paylod)
}


async function readFile(filePath) {
    try {
        let { success, result } = await codebolt.fs.readFile(filePath);
        console.log("response", success, result)
        return [success, result]
    } catch (error) {
        console.error(`Failed to read file at ${filePath}:`, error);
        throw error;
    }
}

async function writeToFile(filePath, content) {
    try {
        let { success, result } = await codebolt.fs.writeToFile(filePath, content);
        console.log("response", success, result)
        return [success, result]

    } catch (error) {
        console.error(`Failed to write to file at ${filePath}:`, error);
        throw error;
    }
}

async function listFiles(directoryPath, recursive = false) {
    try {
      let { success, result } = await codebolt.fs.listFile(directoryPath, recursive);
        return [success, result]
    } catch (error) {
        console.error(`Failed to list files in directory ${directoryPath}:`, error);
        throw error;
    }
}

async function listCodeDefinitionNames(filePath) {
    try {
        let  { success, result } = await codebolt.fs.listCodeDefinitionNames(filePath);
        return [success, result]
    } catch (error) {
        console.error(`Failed to list code definitions in file ${filePath}:`, error);
        throw error;
    }
}

async function searchFiles(directoryPath, regex, filePattern) {
    try {
        let { success, result } =  await codebolt.fs.searchFiles(directoryPath, regex, filePattern);
        return [success, result]
    } catch (error) {
        console.error(`Failed to search files in directory ${directoryPath}:`, error);
        throw error;
    }
}



async function sendNotification(type, message) {
    codebolt.chat.sendNotificationEvent(message, type)

}


async function executeCommand(command,returnEmptyStringOnSuccess) {
    let  { success, result } =  await codebolt.terminal.executeCommand(command,returnEmptyStringOnSuccess);
    return [success, result]
}

/**
 * Sends a message to the Language Learning Model (LLM).
 * @param {string} message - The message to be sent to the LLM.
 * @param {string} model - The LLM model to use (e.g., GPT-4, Codebolt-3).
 */
async function send_message_to_llm(prompt) {
    let { completion } = await codebolt.llm.inference(prompt);
    return completion
}

async function get_default_llm() {
    try {
        await codebolt.waitForConnection();
        let { state } = await codebolt.cbstate.getApplicationState();
        console.log(state)
        if (state.appState && state.appState.defaultApplicationLLM) {
            return state.appState.defaultApplicationLLM.name.replace(/\s+/g, '').toLowerCase();
        }
        else {
            return null
        }
    } catch (error) {
        return null
    }

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
        let _currentProjectPath = projectPath
        return _currentProjectPath

    }
}
async function getInstructionsForAgent() {

    if (projectPath) {
        const filePath = path.join(projectPath, 'codebltInstruction.md');
        try {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            return fileContent;
        } catch (error) {
            console.error('Error reading codebltInstruction.md:', error);
            return '';
        }
    } else {
        let projectPath = await currentProjectPath();
        const filePath = path.join(projectPath, 'codebltInstruction.md');
        try {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            return fileContent;
        } catch (error) {
            console.error('Error reading codebltInstruction.md:', error);
            return '';
        }
    }
}
module.exports = {
    send_message_to_ui,
    send_message_to_llm,
    getInstructionsForAgent,
    get_default_llm,
    ask_question,
    executeCommand,
    currentProjectPath,
    sendNotification,
    writeToFile,
    readFile,
    listFiles,
    searchFiles,
    listCodeDefinitionNames
}
