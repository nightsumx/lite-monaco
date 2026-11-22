// standaloneLanguages.test 专用:platform/theme/browser/iconsStyleSheet 只用来给 MockThemeService.getProductIconTheme 造一个空对象;
// 测试的被测行为(适配器)不碰它,返回一个空主题就够。
export class UnthemedProductIconTheme { getIcon() { return undefined } }
