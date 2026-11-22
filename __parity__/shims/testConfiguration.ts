// browser/config/testConfiguration(Monaco 夹具)→ 同一个夹具,基于 editorConfiguration 垫片。固定 mockFont 度量。
import { EditorConfiguration, type IEnvConfiguration } from './editorConfiguration'
import { AccessibilitySupport } from '../../src/core/options'

export class TestConfiguration extends EditorConfiguration {
    constructor(opts: Readonly<Record<string, unknown>>) {
        super(false, null, opts, null, null)
    }
    protected override _readEnvConfiguration(): IEnvConfiguration {
        const envConfig = (this.getRawOptions() as { envConfig?: Partial<IEnvConfiguration> }).envConfig
        return {
            extraEditorClassName: envConfig?.extraEditorClassName ?? '',
            outerWidth: envConfig?.outerWidth ?? 100,
            outerHeight: envConfig?.outerHeight ?? 100,
            emptySelectionClipboard: envConfig?.emptySelectionClipboard ?? true,
            pixelRatio: envConfig?.pixelRatio ?? 1,
            accessibilitySupport: envConfig?.accessibilitySupport ?? AccessibilitySupport.Unknown,
            editContextSupported: true,
        }
    }
    protected override _readFontInfo(styling: any): any {
        return {
            ...styling, _editorStylingBrand: undefined, version: 2, isTrusted: true,
            pixelRatio: 1, fontFamily: 'mockFont', fontWeight: 'normal', fontSize: 14,
            fontFeatureSettings: '"liga" off, "calt" off', fontVariationSettings: 'normal',
            lineHeight: 19, letterSpacing: 1.5, isMonospace: true,
            typicalHalfwidthCharacterWidth: 10, typicalFullwidthCharacterWidth: 20, canUseHalfwidthRightwardsArrow: true,
            spaceWidth: 10, middotWidth: 10, wsmiddotWidth: 10, maxDigitWidth: 10,
        }
    }
}
