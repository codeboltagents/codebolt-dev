const { CodeboltDevProvider } = require('./providers/CodeboltDevProvider');


async function startTask() {
    let provider= new CodeboltDevProvider()
    await provider.initClaudeDevWithTask("create clock app using react",undefined)
}
startTask();
