const codebolt = require('@codebolt/codeboltjs').default

const { CodeboltDevProvider } = require('./providers/CodeboltDevProvider');
codebolt.chat.onActionMessage().on("userMessage", async (req, response) => {
        await codebolt.waitForConnection();
        let message = req.message;
        let mentionedFiles = req.message.mentionedFiles || [];
        console.log(mentionedFiles);
        let mentionedFolders = req.message.mentionedFolders;
        // coder.apply_updates()
        let provider= new CodeboltDevProvider()
        await provider.initClaudeDevWithTask(message.userMessage,undefined)
        response("ok");
    })
