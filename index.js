const { CodeboltDevProvider } = require('./providers/CodeboltDevProvider');


async function startTask() {
    let provider= new CodeboltDevProvider()
    await provider.initClaudeDevWithTask("add black theme to editor",undefined)
}
startTask();
