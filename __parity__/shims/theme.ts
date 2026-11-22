// platform/theme/common/theme:只要 ColorScheme 枚举(值与 Monaco 一致)。
export enum ColorScheme { DARK = 'dark', LIGHT = 'light', HIGH_CONTRAST_DARK = 'hcDark', HIGH_CONTRAST_LIGHT = 'hcLight' }
export const isDark = (s: ColorScheme) => s === ColorScheme.DARK || s === ColorScheme.HIGH_CONTRAST_DARK
export const isHighContrast = (s: ColorScheme) => s === ColorScheme.HIGH_CONTRAST_DARK || s === ColorScheme.HIGH_CONTRAST_LIGHT
