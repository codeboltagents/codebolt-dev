const codebolt = require('@codebolt/codeboltjs').default
let projectPath;
/**
 * Sends a message to the user interface.
 * @param {string} message - The message to be sent to the UI.
 */
async function send_message_to_ui(message) {
    await codebolt.waitForConnection();
    // TODO: Implement the logic to send the message to the UI
    console.log(`Sending message to UI: ${JSON.stringify(message)}`);
    codebolt.chat.sendMessage(message)
}
async function ask_question(question, type) {
    let buttons = [{
        text: "Yes",
        value: "yesButtonTapped"
    }, {
        text: "No",
        value: "noButtonTapped"
    }]
    function setPrimaryButtonText(text) {
        buttons[0].text = text
        // buttons[0].value=text

    }
    function setSecondaryButtonText(text) {
        buttons[1].text = text
        // buttons[1].value=text
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
                case "newFileCreated":
                    question=tool.content
                    setPrimaryButtonText("Save")
                    setSecondaryButtonText("Reject")
                    break
                default:
                    question=tool.content
                    setPrimaryButtonText("Approve")
                    setSecondaryButtonText("Reject")
                    break
            }
            break
        case "command":

            setPrimaryButtonText("Run Command")
            setSecondaryButtonText("Reject")
            break
        case "command_output":

            setPrimaryButtonText("Proceed While Running")
            setSecondaryButtonText(undefined)
            break
        case "completion_result":
            // extension waiting for feedback. but we can just present a new task button

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

    console.log("sending message ", question, buttons)

    const { message } = await codebolt.chat.sendConfirmationRequest(question, buttons);
    // console.log(message.userMessage);
    return message.userMessage;
}

async function executeCommand(command) {
    const response = await codebolt.terminal.executeCommand(command);
    return response
}

/**
 * Sends a message to the Language Learning Model (LLM).
 * @param {string} message - The message to be sent to the LLM.
 * @param {string} model - The LLM model to use (e.g., GPT-4, Claude-3).
 */
async function send_message_to_llm(prompt) {
    let { message } = await codebolt.llm.inference(prompt.messages);
    return message
}

function generate_image(prompt) {
    console.log(`Generating image for prompt: ${prompt}`);
    // Dummy response mimicking the structure from file_context_0
    return {
        data: [
            {
                url: "https://placehold.co/1024x1024"
            }
        ]
    }.data[0].url;
}

function open_url_get_screenshot(url) {
    return new Promise(async (resolve, reject) => {
        await codebolt.browser.goToPage(url);
        setTimeout(async () => {
            let imageBuffer = await codebolt.browser.screenshot();
            let image = `data:image/png;base64,${imageBuffer}`
            console.log("image generated")
            resolve(image)
        }, 5000);
    })
}

async function update_code(content) {
    try {
        // Send a message to the UI to update the code
        await codebolt.fs.createFile("index.html", content)
        send_message_to_ui({ type: "status", value: "Code updated successfully" });
    } catch (error) {
        console.error("Error updating code:", error);
        throw error;
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
        currentProjectPath = projectPath
        return currentProjectPath

    }
}
module.exports = {
    send_message_to_ui,
    send_message_to_llm,
    generate_image,
    open_url_get_screenshot,
    update_code,
    ask_question,
    executeCommand,
    currentProjectPath
}
