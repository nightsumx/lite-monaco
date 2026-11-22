/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkerManager } from '../mainthread';
import { create as createWorker } from './cssWorker';
import type { CSSWorker } from './cssWorker';
import { LanguageServiceDefaults } from './register';
import * as languageFeatures from '../lspLanguageFeatures';
import { Uri, IDisposable, languages } from '../_monaco';

export function setupMode(defaults: LanguageServiceDefaults): IDisposable {
	const disposables: IDisposable[] = [];
	const providers: IDisposable[] = [];

	const client = new WorkerManager(defaults, createWorker, () => ({ options: defaults.options, languageId: defaults.languageId }));
	disposables.push(client);

	const worker: languageFeatures.WorkerAccessor<CSSWorker> = (
		...uris: Uri[]
	): Promise<CSSWorker> => {
		return client.getLanguageServiceWorker(...uris);
	};

	function registerProviders(): void {
		const { languageId, modeConfiguration } = defaults;

		disposeAll(providers);

		if (modeConfiguration.completionItems) {
			providers.push(
				languages.registerCompletionItemProvider(
					languageId,
					new languageFeatures.CompletionAdapter(worker, ['/', '-', ':'])
				)
			);
		}
		if (modeConfiguration.hovers) {
			providers.push(
				languages.registerHoverProvider(languageId, new languageFeatures.HoverAdapter(worker))
			);
		}
		if (modeConfiguration.documentHighlights) {
			providers.push(
				languages.registerDocumentHighlightProvider(
					languageId,
					new languageFeatures.DocumentHighlightAdapter(worker)
				)
			);
		}
		if (modeConfiguration.definitions) {
			providers.push(
				languages.registerDefinitionProvider(
					languageId,
					new languageFeatures.DefinitionAdapter(worker)
				)
			);
		}
		if (modeConfiguration.references) {
			providers.push(
				languages.registerReferenceProvider(
					languageId,
					new languageFeatures.ReferenceAdapter(worker)
				)
			);
		}
		if (modeConfiguration.documentSymbols) {
			providers.push(
				languages.registerDocumentSymbolProvider(
					languageId,
					new languageFeatures.DocumentSymbolAdapter(worker)
				)
			);
		}
		if (modeConfiguration.rename) {
			providers.push(
				languages.registerRenameProvider(languageId, new languageFeatures.RenameAdapter(worker))
			);
		}
		if (modeConfiguration.colors) {
			providers.push(
				languages.registerColorProvider(
					languageId,
					new languageFeatures.DocumentColorAdapter(worker)
				)
			);
		}
		if (modeConfiguration.foldingRanges) {
			providers.push(
				languages.registerFoldingRangeProvider(
					languageId,
					new languageFeatures.FoldingRangeAdapter(worker)
				)
			);
		}
		if (modeConfiguration.diagnostics) {
			providers.push(
				new languageFeatures.DiagnosticsAdapter(languageId, worker, defaults.onDidChange)
			);
		}
		if (modeConfiguration.selectionRanges) {
			providers.push(
				languages.registerSelectionRangeProvider(
					languageId,
					new languageFeatures.SelectionRangeAdapter(worker)
				)
			);
		}
		if (modeConfiguration.documentFormattingEdits) {
			providers.push(
				languages.registerDocumentFormattingEditProvider(
					languageId,
					new languageFeatures.DocumentFormattingEditProvider(worker)
				)
			);
		}
		if (modeConfiguration.documentRangeFormattingEdits) {
			providers.push(
				languages.registerDocumentRangeFormattingEditProvider(
					languageId,
					new languageFeatures.DocumentRangeFormattingEditProvider(worker)
				)
			);
		}
	}

	registerProviders();

	// 与 JSON 模式一致:modeConfiguration 变了就重注册(monaco-editor 的 css / html 模式没做,setModeConfiguration 对已打开的语言不生效;这里按 API 文档的意思让开关即时生效)
	let modeConfiguration = defaults.modeConfiguration;
	disposables.push(
		defaults.onDidChange((newDefaults) => {
			if (newDefaults.modeConfiguration !== modeConfiguration) {
				modeConfiguration = newDefaults.modeConfiguration;
				registerProviders();
			}
		})
	);

	disposables.push(asDisposable(providers));

	return asDisposable(disposables);
}

function asDisposable(disposables: IDisposable[]): IDisposable {
	return { dispose: () => disposeAll(disposables) };
}

function disposeAll(disposables: IDisposable[]) {
	while (disposables.length) {
		disposables.pop()!.dispose();
	}
}

export { WorkerManager } from '../mainthread';
export * from '../lspLanguageFeatures';
