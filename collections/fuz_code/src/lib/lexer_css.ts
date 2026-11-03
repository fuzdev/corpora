import {
	is_digit,
	is_hex_digit,
	is_space,
	matches_ci,
	skip_quoted,
	token_type,
	trim_space_end,
	type Lexer,
	type SyntaxLang
} from './lexer.ts';

/**
 * CSS lexer.
 *
 * Emits: `comment`, `atrule` (a container wrapping `rule` + prelude), `rule`,
 * `selector`, `string`, `property`, `important`, `function`, `url` (a
 * container), `keyword` (`and`/`not`/`only`/`or` inside at-rule preludes),
 * `number` (with its unit), `color` (`#hex`, aliased to `number`), and
 * `punctuation`.
 *
 * Structure is decided by a brace-context lookahead: from each item, the first
 * top-level `{`, `;`, or `}` (skipping strings, comments, `()`, and `[]`) says
 * whether the item is a qualified rule (its prelude is a `selector`) or a
 * declaration (`property : value`). Because that decision is purely local, the
 * flat main loop nests to any depth, so native CSS nesting works for free.
 *
 * Values (declaration right-hand sides and at-rule preludes) are tokenized
 * sparsely: strings, `url()`, functions, `!important`, `property`-before-colon,
 * numbers with their unit (`20rem`, `-.5em`, `50%`), and `#hex` colors. A
 * value region is known before it's lexed, so a number or `#hex` there can't be
 * a selector part. Bare identifiers (`auto`, `white`, `contents`) stay plain
 * text: telling CSS keywords from custom names would take a word list that
 * drifts as CSS grows.
 *
 * Resilience: unterminated strings extend to end of line; unterminated
 * comments and blocks extend to end of window.
 *
 * @module
 */

const T_COMMENT = token_type('comment');
const T_ATRULE = token_type('atrule');
const T_RULE = token_type('rule');
const T_SELECTOR = token_type('selector');
const T_STRING = token_type('string');
const T_STRING_URL = token_type('string', 'url');
const T_PROPERTY = token_type('property');
const T_IMPORTANT = token_type('important');
const T_FUNCTION = token_type('function');
const T_PUNCTUATION = token_type('punctuation');
const T_URL = token_type('url');
const T_KEYWORD = token_type('keyword');
const T_NUMBER = token_type('number');
const T_COLOR = token_type('color', 'number');

// at-rule prelude keywords (`@media screen and (...)`), matched
// case-insensitively without allocating (matching the rest of this file)
const is_atrule_keyword = (text: string, from: number, to: number): boolean => {
	switch (to - from) {
		case 2:
			return matches_ci(text, from, 'or');
		case 3:
			return matches_ci(text, from, 'and') || matches_ci(text, from, 'not');
		case 4:
			return matches_ci(text, from, 'only');
		default:
			return false;
	}
};

// a css identifier char: letters, digits, `-`, `_`, and non-ASCII
const is_css_ident = (c: number): boolean =>
	(c >= 97 && c <= 122) || // a-z
	(c >= 65 && c <= 90) || // A-Z
	(c >= 48 && c <= 57) || // 0-9
	c === 45 || // -
	c === 95 || // _
	c >= 0xa0;

// a css identifier start: no leading digit
const is_css_ident_start = (c: number): boolean =>
	(c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 45 || c === 95 || c >= 0xa0;

/**
 * Scans a block comment from the slash-star at `i`, returning the exclusive
 * end. Unterminated comments extend to the window end.
 */
const scan_css_comment = (text: string, i: number, end: number): number => {
	const close = text.indexOf('*/', i + 2);
	return close === -1 || close + 2 > end ? end : close + 2;
};

/**
 * From `i`, finds the first top-level `{`, `;`, or `}`, skipping strings,
 * comments, and balanced `()`/`[]`. Returns its index, or `end` when none is
 * found. This is the selector-vs-declaration discriminator.
 */
// the chars `scan_to_terminator` acts on: " ' / ( ) [ ] { ; }
const TERMINATOR_SCAN = new Uint8Array(128);
for (const c of `"'/()[]{;}`) TERMINATOR_SCAN[c.charCodeAt(0)] = 1;

const scan_to_terminator = (text: string, i: number, end: number): number => {
	let paren = 0;
	let bracket = 0;
	let j = i;
	while (j < end) {
		const c = text.charCodeAt(j);
		if (c > 127 || TERMINATOR_SCAN[c] === 0) {
			j++;
			continue;
		}
		if (c === 34 || c === 39) {
			j = skip_quoted(text, j, end, c);
		} else if (c === 47 && text.charCodeAt(j + 1) === 42) {
			j = scan_css_comment(text, j, end);
		} else if (c === 40) {
			paren++;
			j++;
		} else if (c === 41) {
			if (paren > 0) paren--;
			j++;
		} else if (c === 91) {
			bracket++;
			j++;
		} else if (c === 93) {
			if (bracket > 0) bracket--;
			j++;
		} else if (paren === 0 && bracket === 0 && (c === 123 || c === 59 || c === 125)) {
			return j;
		} else {
			j++;
		}
	}
	return end;
};

/**
 * Returns the exclusive end of the number starting at `i` — an optional sign,
 * digits with an optional fraction and exponent, then a unit (`px`, `%`) — or
 * `-1` when no number starts there. A unit is any identifier run, as in CSS's
 * own dimension token.
 */
const scan_css_number = (text: string, i: number, to: number): number => {
	let j = i;
	let c = text.charCodeAt(j);
	if (c === 43 || c === 45) c = text.charCodeAt(++j);
	let digits = false;
	while (j < to && is_digit(c)) {
		digits = true;
		c = text.charCodeAt(++j);
	}
	if (c === 46 && j + 1 < to && is_digit(text.charCodeAt(j + 1))) {
		j++;
		while (j < to && is_digit(text.charCodeAt(j))) j++;
		digits = true;
		c = text.charCodeAt(j);
	}
	if (!digits) return -1;
	// exponent only when digits follow, so `1em` keeps its unit
	if (c === 101 || c === 69) {
		let k = j + 1;
		const s = text.charCodeAt(k);
		if (s === 43 || s === 45) k++;
		if (k < to && is_digit(text.charCodeAt(k))) {
			j = k + 1;
			while (j < to && is_digit(text.charCodeAt(j))) j++;
			c = text.charCodeAt(j);
		}
	}
	if (j < to && c === 37) return j + 1;
	if (j < to && is_css_ident_start(c)) {
		j++;
		while (j < to && is_css_ident(text.charCodeAt(j))) j++;
	}
	return j;
};

/**
 * Returns the exclusive end of the `#hex` color at `i` (3, 4, 6, or 8 hex
 * digits, then no identifier char), or `-1` when it isn't one.
 */
const scan_css_hex_color = (text: string, i: number, to: number): number => {
	let j = i + 1;
	while (j < to && is_hex_digit(text.charCodeAt(j))) j++;
	const len = j - i - 1;
	if (len !== 3 && len !== 4 && len !== 6 && len !== 8) return -1;
	if (j < to && is_css_ident(text.charCodeAt(j))) return -1;
	return j;
};

/**
 * Emits the number or `#hex` color starting at `i` (whose char is `c`) and
 * returns its end, or returns `-1` when neither starts there.
 */
const lex_css_numeric = (l: Lexer, i: number, to: number, c: number): number => {
	if (c === 35) {
		const end = scan_css_hex_color(l.text, i, to);
		if (end !== -1) l.leaf(T_COLOR, i, end);
		return end;
	}
	if (!is_digit(c) && c !== 46 && c !== 43 && c !== 45) return -1;
	const end = scan_css_number(l.text, i, to);
	if (end !== -1) l.leaf(T_NUMBER, i, end);
	return end;
};

/**
 * Tokenizes a `[from, to)` value region — a declaration right-hand side or an
 * at-rule prelude interior. Emits strings, `url()`, functions, `!important`,
 * `property`-before-colon, numbers, `#hex` colors, punctuation, and (when
 * `is_atrule`) `and`/`not`/`only`/`or` keywords; everything else is plain text.
 */
const lex_css_value = (l: Lexer, from: number, to: number, is_atrule: boolean): void => {
	const { text } = l;
	let i = from;
	while (i < to) {
		const c = text.charCodeAt(i);
		if (is_space(c)) {
			i++;
			continue;
		}
		if (c === 47 && text.charCodeAt(i + 1) === 42) {
			const close = scan_css_comment(text, i, to);
			l.leaf(T_COMMENT, i, close);
			i = close;
			continue;
		}
		if (c === 34 || c === 39) {
			const str_end = skip_quoted(text, i, to, c);
			l.leaf(T_STRING, i, str_end);
			i = str_end;
			continue;
		}
		if (c === 33) {
			// `!important` (case-insensitive), with a word boundary after
			const word_end = i + 10; // `!important`
			if (
				word_end <= to &&
				matches_ci(text, i + 1, 'important') &&
				!is_css_ident(text.charCodeAt(word_end))
			) {
				l.leaf(T_IMPORTANT, i, word_end);
				i = word_end;
				continue;
			}
			i++;
			continue;
		}
		if (is_css_ident_start(c)) {
			// a `-` starts both an identifier (`--x`) and a number (`-2px`)
			if (c === 45) {
				const num_end = lex_css_numeric(l, i, to, c);
				if (num_end !== -1) {
					i = num_end;
					continue;
				}
			}
			let ident_end = i + 1;
			while (ident_end < to && is_css_ident(text.charCodeAt(ident_end))) ident_end++;
			// `url(...)` — a container, not a plain function call
			if (ident_end - i === 3 && matches_ci(text, i, 'url') && text.charCodeAt(ident_end) === 40) {
				i = lex_css_url(l, i, ident_end, to);
				continue;
			}
			const next = ident_end;
			const nc = text.charCodeAt(next);
			if (nc === 40) {
				l.leaf(T_FUNCTION, i, ident_end);
				i = ident_end;
				continue;
			}
			if (nc === 58) {
				l.leaf(T_PROPERTY, i, ident_end);
				i = ident_end;
				continue;
			}
			if (is_atrule && is_atrule_keyword(text, i, ident_end)) {
				l.leaf(T_KEYWORD, i, ident_end);
				i = ident_end;
				continue;
			}
			i = ident_end; // plain identifier (color name, unit-bearing token, …)
			continue;
		}
		if (c === 40 || c === 41 || c === 91 || c === 93 || c === 44 || c === 58 || c === 59) {
			l.leaf(T_PUNCTUATION, i, i + 1);
			i++;
			continue;
		}
		const num_end = lex_css_numeric(l, i, to, c);
		if (num_end !== -1) {
			i = num_end;
			continue;
		}
		i++; // operators, a `#` that isn't a color, … stay plain
	}
};

/**
 * Lexes a `url(...)` construct as a container. `i` is the `u`, `word_end` the
 * `(`. Returns the position after the closing `)` (or the region end when
 * unterminated).
 */
const lex_css_url = (l: Lexer, i: number, word_end: number, to: number): number => {
	const { text } = l;
	l.open(T_URL, i);
	l.leaf(T_FUNCTION, i, word_end);
	l.leaf(T_PUNCTUATION, word_end, word_end + 1); // `(`
	let j = word_end + 1;
	while (j < to && is_space(text.charCodeAt(j))) j++;
	const c = text.charCodeAt(j);
	if (c === 34 || c === 39) {
		const str_end = skip_quoted(text, j, to, c);
		l.leaf(T_STRING_URL, j, str_end);
		j = str_end;
	}
	// raw (unquoted) content and trailing space up to `)` stay plain
	const close = text.indexOf(')', j);
	if (close === -1 || close >= to) {
		l.close(to);
		return to;
	}
	l.leaf(T_PUNCTUATION, close, close + 1);
	l.close(close + 1);
	return close + 1;
};

/**
 * Lexes a declaration `[from, to)` — `property : value` — falling back to a
 * bare value when there is no top-level `property:`.
 */
const lex_css_declaration = (l: Lexer, from: number, to: number): void => {
	const { text } = l;
	let i = from;
	while (i < to && is_space(text.charCodeAt(i))) i++;
	if (i < to && is_css_ident_start(text.charCodeAt(i))) {
		let name_end = i + 1;
		while (name_end < to && is_css_ident(text.charCodeAt(name_end))) name_end++;
		let after = name_end;
		while (after < to && is_space(text.charCodeAt(after))) after++;
		if (after < to && text.charCodeAt(after) === 58) {
			l.leaf(T_PROPERTY, i, name_end);
			l.leaf(T_PUNCTUATION, after, after + 1); // `:`
			lex_css_value(l, after + 1, to, false);
			return;
		}
	}
	lex_css_value(l, from, to, false);
};

/**
 * Lexes an at-rule from the `@` at `i`, returning the new position. Emits an
 * `atrule` container (`rule` + prelude), then the terminating `{` or `;`.
 */
const lex_css_atrule = (l: Lexer, i: number, end: number): number => {
	const { text } = l;
	let rule_end = i + 1;
	while (rule_end < end && is_css_ident(text.charCodeAt(rule_end))) rule_end++;
	const term = scan_to_terminator(text, rule_end, end);
	const prelude_end = trim_space_end(text, i, term);
	l.open(T_ATRULE, i);
	l.leaf(T_RULE, i, rule_end);
	lex_css_value(l, rule_end, prelude_end, true);
	l.close(prelude_end);
	const tc = text.charCodeAt(term);
	if (tc === 123 || tc === 59) {
		l.leaf(T_PUNCTUATION, term, term + 1);
		return term + 1;
	}
	return term; // `}` handled by the caller, or region end
};

const lex_css = (l: Lexer): void => {
	const { text, end } = l;
	let i = l.pos;
	while (i < end) {
		const c = text.charCodeAt(i);
		if (is_space(c)) {
			i++;
			continue;
		}
		if (c === 47 && text.charCodeAt(i + 1) === 42) {
			const close = scan_css_comment(text, i, end);
			l.leaf(T_COMMENT, i, close);
			i = close;
			continue;
		}
		if (c === 125 || c === 123 || c === 59) {
			// `}` closes a block; stray `{`/`;` are emitted as punctuation too
			l.leaf(T_PUNCTUATION, i, i + 1);
			i++;
			continue;
		}
		if (c === 64) {
			i = lex_css_atrule(l, i, end);
			continue;
		}
		// a qualified rule (selector) or a declaration — decided by lookahead
		const term = scan_to_terminator(text, i, end);
		if (text.charCodeAt(term) === 123) {
			const sel_end = trim_space_end(text, i, term);
			l.leaf(T_SELECTOR, i, sel_end);
			l.leaf(T_PUNCTUATION, term, term + 1); // `{`
			i = term + 1;
		} else {
			lex_css_declaration(l, i, term);
			if (text.charCodeAt(term) === 59) {
				l.leaf(T_PUNCTUATION, term, term + 1); // `;`
				i = term + 1;
			} else {
				i = term; // `}` handled next iteration, or region end
			}
		}
	}
	l.pos = end;
};

/**
 * The CSS language registration for the lexer engine.
 */
export const lexer_css: SyntaxLang = { id: 'css', lex: lex_css };
