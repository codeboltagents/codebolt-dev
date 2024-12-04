const { CodeboltDev } = require('./CodeboltDev');
const codebolt = require('@codebolt/codeboltjs').default


codebolt.chat.onActionMessage().on("userMessage", async (req, response) => {
    let message = req.message;
    let codebotDev = new CodeboltDev(message.userMessage, [], [], response);
    await codebotDev.startTask()


})



