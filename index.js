const codebolt = require('@codebolt/codeboltjs').default

const { CodeboltDevProvider } = require('./providers/CodeboltDevProvider');
codebolt.chat.onActionMessage().on("userMessage", async (req, response) => {
    let message = req.message;
    let mentionedFiles = req.message.mentionedFiles || [];
    console.log(mentionedFiles);
    let images = req.message.uploadedImages || []
    let mentionedFolders = req.message.mentionedFolders;
    // coder.apply_updates()
    let provider = new CodeboltDevProvider()
    await provider.initClaudeDevWithTask(message.userMessage, images, response)

})


