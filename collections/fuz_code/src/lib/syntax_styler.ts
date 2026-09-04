import {
	lex_syntax,
	render_syntax_html,
	token_types_global,
	TokenTypeRegistry,
	type LexedSyntax,
	type SyntaxLang
} from './lexer.ts';

export interface SyntaxStylerOptions {
	/**
	 * Token-type id space used by the registered lexers. Defaults to the shared
	 * `token_types_global`, which the built-in lexers intern into — inject a
	 * separate registry only when every registered lexer interns into that same
	 * registry.
	 */
	token_types?: TokenTypeRegistry;
}

/**
 * A no-op lexer — `plaintext` emits no events, so its text renders escaped but
 * unstyled. Registered on every styler as the explicit "highlight nothing"
 * language.
 */
const lexer_plaintext: SyntaxLang = {
	id: 'plaintext',
	lex: (l) => {
		l.pos = l.end;
	}
};

/**
 * Registry and facade over the hand-written lexer engine (`lexer.ts`): registers
 * languages, lexes text to a flat token event stream, and renders that stream to
 * syntax-highlighted HTML.
 *
 * @example
 * ```ts
 * import {syntax_styler_global} from '@fuzdev/fuz_code/syntax_styler_global.ts';
 *
 * const html = syntax_styler_global.stylize('const x = 1;', 'ts');
 * ```
 */
export class SyntaxStyler {
	/**
	 * Registered languages, keyed by id and by each alias.
	 */
	langs: Map<string, SyntaxLang> = new Map();

	/**
	 * Token-type id space for this styler's languages.
	 * See `SyntaxStylerOptions.token_types`.
	 */
	readonly token_types: TokenTypeRegistry;

	constructor(options: SyntaxStylerOptions = {}) {
		this.token_types = options.token_types ?? token_types_global;
		this.add_lang(lexer_plaintext);
	}

	/**
	 * Registers a language (and its aliases).
	 */
	add_lang(lang: SyntaxLang): void {
		this.langs.set(lang.id, lang);
		if (lang.aliases) {
			for (const alias of lang.aliases) this.langs.set(alias, lang);
		}
	}

	/**
	 * Whether a language is registered under `id` (its primary id or an alias).
	 */
	has_lang(id: string): boolean {
		return this.langs.has(id);
	}

	/**
	 * Lexes `text` with the language registered as `lang`, returning the flat
	 * token event stream. Throws when `lang` is not registered — see `has_lang`.
	 */
	lex(text: string, lang: string): LexedSyntax {
		const l = this.langs.get(lang);
		if (l === undefined) throw Error(`The language "${lang}" is not registered.`);
		return lex_syntax(text, l, this.langs, this.token_types);
	}

	/**
	 * Generates syntax-highlighted HTML (spans with `.token_*` classes) from
	 * `text`. Throws when `lang` is not registered — see `has_lang`.
	 */
	stylize(text: string, lang: string): string {
		return render_syntax_html(this.lex(text, lang));
	}
}
