// Monaco common/services/languagesAssociations → lite-monaco src/api/languagesregistry(同一套优先级规则的真实现)。
// 测试传 vscode-uri 的 URI:只要有 scheme / path / fsPath 就满足 IAssociationResource,不用翻译。
export { getMimeTypes, getLanguageIds, registerPlatformLanguageAssociation, registerConfiguredLanguageAssociation, clearPlatformLanguageAssociations, clearConfiguredLanguageAssociations } from '../../src/api/languagesregistry'
