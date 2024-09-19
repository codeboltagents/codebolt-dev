const { ClaudeDevProvider } = require('./providers/ClaudeDevProvider');


async function startTask() {
    let provider= new ClaudeDevProvider()
    await provider.initClaudeDevWithTask("add black theme to editor",undefined)
}
startTask();
