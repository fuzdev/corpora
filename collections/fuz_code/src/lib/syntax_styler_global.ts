import { SyntaxStyler } from './syntax_styler.ts';
import { lexer_json } from './lexer_json.ts';
import { lexer_ts } from './lexer_ts.ts';
import { lexer_css } from './lexer_css.ts';
import { lexer_bash } from './lexer_bash.ts';
import { lexer_markup, lexer_xml } from './lexer_markup.ts';
import { lexer_svelte } from './lexer_svelte.ts';
import { lexer_md } from './lexer_md.ts';
import { lexer_rust } from './lexer_rust.ts';

/**
 * Pre-configured `SyntaxStyler` instance with all built-in languages registered.
 *
 * @example
 * ```ts
 * import {syntax_styler_global} from '@fuzdev/fuz_code/syntax_styler_global.ts';
 *
 * const html = syntax_styler_global.stylize('const x = 1;', 'ts');
 * ```
 */
export const syntax_styler_global = new SyntaxStyler();

syntax_styler_global.add_lang(lexer_json);
syntax_styler_global.add_lang(lexer_ts);
syntax_styler_global.add_lang(lexer_css);
syntax_styler_global.add_lang(lexer_bash);
syntax_styler_global.add_lang(lexer_markup);
syntax_styler_global.add_lang(lexer_xml);
syntax_styler_global.add_lang(lexer_svelte);
syntax_styler_global.add_lang(lexer_md);
syntax_styler_global.add_lang(lexer_rust);
