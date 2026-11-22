// getBracketPairsInRange.test 借用的测试夹具:TokenizedDocument / TokenInfo(把一串带元数据的文本片段变成 ITokenizationSupport)。
// 原文件 tokenizer.test.ts 的 Tokenizer 套件测的是 Monaco 括号 AST 内部 token 流(见 na/internal.json),所以这里只留夹具两个类,逐字取自 Monaco 0.55.1。
import { LanguageId, MetadataConsts, StandardTokenType } from '../../../../../../reference/_vscode-src/src/vs/editor/common/encodedTokenAttributes'
import { EncodedTokenizationResult, IState, ITokenizationSupport } from '../../../../../../reference/_vscode-src/src/vs/editor/common/languages'

export class TokenizedDocument {
	private readonly tokensByLine: readonly TokenInfo[][];
	constructor(tokens: TokenInfo[]) {
		const tokensByLine = new Array<TokenInfo[]>();
		let curLine = new Array<TokenInfo>();

		for (const token of tokens) {
			const lines = token.text.split('\n');
			let first = true;
			while (lines.length > 0) {
				if (!first) {
					tokensByLine.push(curLine);
					curLine = new Array<TokenInfo>();
				} else {
					first = false;
				}

				if (lines[0].length > 0) {
					curLine.push(token.withText(lines[0]));
				}
				lines.pop();
			}
		}

		tokensByLine.push(curLine);

		this.tokensByLine = tokensByLine;
	}

	getText() {
		return this.tokensByLine.map(t => t.map(t => t.text).join('')).join('\n');
	}

	getTokenizationSupport(): ITokenizationSupport {
		class State implements IState {
			constructor(public readonly lineNumber: number) { }

			clone(): IState {
				return new State(this.lineNumber);
			}

			equals(other: IState): boolean {
				return this.lineNumber === (other as State).lineNumber;
			}
		}

		return {
			getInitialState: () => new State(0),
			tokenize: () => { throw new Error('Method not implemented.'); },
			tokenizeEncoded: (line: string, hasEOL: boolean, state: IState): EncodedTokenizationResult => {
				const state2 = state as State;
				const tokens = this.tokensByLine[state2.lineNumber];
				const arr = new Array<number>();
				let offset = 0;
				for (const t of tokens) {
					arr.push(offset, t.getMetadata());
					offset += t.text.length;
				}

				return new EncodedTokenizationResult(new Uint32Array(arr), new State(state2.lineNumber + 1));
			}
		};
	}
}

export class TokenInfo {
	constructor(
		public readonly text: string,
		public readonly languageId: LanguageId,
		public readonly tokenType: StandardTokenType,
		public readonly hasBalancedBrackets: boolean,
	) { }

	getMetadata(): number {
		return (
			(((this.languageId << MetadataConsts.LANGUAGEID_OFFSET) |
				(this.tokenType << MetadataConsts.TOKEN_TYPE_OFFSET)) >>>
				0) |
			(this.hasBalancedBrackets ? MetadataConsts.BALANCED_BRACKETS_MASK : 0)
		);
	}

	withText(text: string): TokenInfo {
		return new TokenInfo(text, this.languageId, this.tokenType, this.hasBalancedBrackets);
	}
}
