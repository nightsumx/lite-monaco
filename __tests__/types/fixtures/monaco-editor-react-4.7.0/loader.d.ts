// @monaco-editor/loader 1.7.0 的 lib/types.d.ts 原样拷贝。MIT, Copyright (c) 2018 Suren Atoyan。
import * as monacoEditor from 'monaco-editor/esm/vs/editor/editor.api';

export type Monaco = typeof monacoEditor;

interface CancelablePromise<T> extends Promise<T> {
  cancel: () => void;
}

declare namespace loader {
  function init(): CancelablePromise<Monaco>;
  function config(params: {
    paths?: {
      vs?: string,
    },
    'vs/nls'?: {
      availableLanguages?: object,
    },
    monaco?: Monaco,
  }): void;
  function __getMonacoInstance(): Monaco | null;
}

export default loader;
