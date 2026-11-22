export const NullCommandService = {
    onWillExecuteCommand: () => ({ dispose() {} }),
    onDidExecuteCommand: () => ({ dispose() {} }),
    executeCommand() { return Promise.resolve(undefined) },
}
