// Monaco toWorkspaceFolders:把 .code-workspace 里的相对路径文件夹解析成 URI(纯数据夹具)。
export function toWorkspaceFolders(configuredFolders: { path: string, name?: string }[], workspaceConfigFile: any, _extUri?: unknown) {
    const dir = workspaceConfigFile.path.replace(/\/[^/]*$/, '') || '/'
    return configuredFolders.map((f, index) => {
        const uri = workspaceConfigFile.with({ path: (dir === '/' ? '' : dir) + '/' + f.path })
        return { uri, name: f.name ?? f.path, index, toResource: (rel: string) => uri.with({ path: uri.path + '/' + rel }) }
    })
}
