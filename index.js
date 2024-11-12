const { CodeboltDev } = require('./CodeboltDev');

const codebolt = require('@codebolt/codeboltjs').default


// codebolt.chat.onActionMessage().on("userMessage", async (req, response) => {

//     let message = req.message;
//     let mentionedFiles = req.message.mentionedFiles || [];
//     console.log(mentionedFiles);
//     let mentionedFolders = req.message.mentionedFolders;
//     // coder.apply_updates()
//     let codebotDev = new CodeboltDev(message.userMessage, [], [], response);
//     await codebotDev.startTask()


// })

async function executeTask() {
    try {
        const message = { userMessage: "Your message here" }; // Define message object
        const response = (result) => console.log(result); // Define response function
        let codebotDev = new CodeboltDev(message.userMessage, [], [], response);
        await codebotDev.startTask("create node js app", [], response); // Provide necessary arguments
    } catch (error) {
        console.error("Error executing task:", error);
    }
}
executeTask()

