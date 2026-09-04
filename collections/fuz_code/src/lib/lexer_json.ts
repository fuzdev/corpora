import {
	is_digit,
	is_ident_start,
	is_space,
	scan_ident,
	scan_to_line_end,
	skip_quoted,
	token_type,
	type Lexer,
	type SyntaxLang
} from './lexer.ts';

/**
 * Hand-written JSON lexer (accepts JSONC — line and block comments).
 *
 * Emits: `property` (a string key), `string`, `comment`, `number`,
 * `punctuation`, `operator` (`:`), `boolean`, and `null` (aliased to
 * `keyword`).
 *
 * Resilience: unterminated strings extend to end of line; unterminated block
 * comments extend to end of window.
 *
 * @module
 */

const T_PROPERTY = token_type('property');
const T_STRING = token_type('string');
const T_COMMENT = token_type('comment');
const T_NUMBER = token_type('number');
const T_PUNCTUATION = token_type('punctuation');
const T_OPERATOR = token_type('operator');
const T_BOOLEAN = token_type('boolean');
const T_NULL = token_type('null', 'keyword');

/**
 * Scans a number from `i` (at `-` or a digit), returning the exclusive end.
 */
const scan_json_number = (text: string, from: number, end: number): number => {
	let i = from;
	if (text.charCodeAt(i) === 45) i++; // -
	while (i < end && is_digit(text.charCodeAt(i))) i++;
	if (i < end && text.charCodeAt(i) === 46 && is_digit(text.charCodeAt(i + 1))) {
		i += 2;
		while (i < end && is_digit(text.charCodeAt(i))) i++;
	}
	const c = i < end ? text.charCodeAt(i) : 0;
	if (c === 101 || c === 69) {
		// e/E exponent
		let j = i + 1;
		const sign = j < end ? text.charCodeAt(j) : 0;
		if (sign === 43 || sign === 45) j++;
		if (j < end && is_digit(text.charCodeAt(j))) {
			j++;
			while (j < end && is_digit(text.charCodeAt(j))) j++;
			return j;
		}
	}
	return i;
};

const lex_json = (l: Lexer): void => {
	const { text, end } = l;
	let i = l.pos;
	while (i < end) {
		const c = text.charCodeAt(i);
		if (is_space(c)) {
			i++;
			continue;
		}
		if (c === 34) {
			// `"` — string; a key when followed by `:` (unterminated stops at the
			// line boundary — see `skip_quoted`)
			const str_end = skip_quoted(text, i, end, 34);
			let j = str_end;
			while (j < end && is_space(text.charCodeAt(j))) j++;
			l.leaf(j < end && text.charCodeAt(j) === 58 ? T_PROPERTY : T_STRING, i, str_end);
			i = str_end;
			continue;
		}
		if (c === 47) {
			// `/` — jsonc comments
			const c2 = i + 1 < end ? text.charCodeAt(i + 1) : 0;
			if (c2 === 47) {
				const line_end = scan_to_line_end(text, i, end);
				l.leaf(T_COMMENT, i, line_end);
				i = line_end;
				continue;
			}
			if (c2 === 42) {
				const close = text.indexOf('*/', i + 2);
				const comment_end = close === -1 || close + 2 > end ? end : close + 2;
				l.leaf(T_COMMENT, i, comment_end);
				i = comment_end;
				continue;
			}
			i++;
			continue;
		}
		if (c === 45 || is_digit(c)) {
			if (c === 45 && !is_digit(i + 1 < end ? text.charCodeAt(i + 1) : 0)) {
				i++; // lone `-` is plain text
				continue;
			}
			const num_end = scan_json_number(text, i, end);
			l.leaf(T_NUMBER, i, num_end);
			i = num_end;
			continue;
		}
		if (c === 123 || c === 125 || c === 91 || c === 93 || c === 44) {
			// { } [ ] ,
			l.leaf(T_PUNCTUATION, i, i + 1);
			i++;
			continue;
		}
		if (c === 58) {
			l.leaf(T_OPERATOR, i, i + 1);
			i++;
			continue;
		}
		if (is_ident_start(c)) {
			const ident_end = scan_ident(text, i, end);
			const word = text.slice(i, ident_end);
			if (word === 'true' || word === 'false') {
				l.leaf(T_BOOLEAN, i, ident_end);
			} else if (word === 'null') {
				l.leaf(T_NULL, i, ident_end);
			}
			i = ident_end;
			continue;
		}
		i++;
	}
	l.pos = i;
};

/**
 * The JSON language registration for the lexer engine.
 */
export const lexer_json: SyntaxLang = { id: 'json', lex: lex_json };
