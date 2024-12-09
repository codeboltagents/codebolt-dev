import { CodeboltDev } from './codebolt';
import codebolt from '@codebolt/codeboltjs';
codebolt.chat.onActionMessage().on("userMessage", async (req, response) => {
    let message = req.message;
    console.log(message);
    let codebotDev = new CodeboltDev(message.userMessage, [], []);
    console.log(message.userMessage);
    await codebotDev.startTask(message.userMessage,[],response);
})

