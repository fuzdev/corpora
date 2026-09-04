import {
	is_digit,
	is_hex_digit,
	is_ident_start,
	is_space,
	is_upper,
	scan_ident,
	scan_to_line_end,
	skip_space,
	token_type,
	words_map,
	type Lexer,
	type SyntaxLang
} from './lexer.ts';

/**
 * Hand-written Rust lexer.
 *
 * A single flat scan loop — Rust has no re-entrant interiors at the token
 * level (no template interpolations), so the constructs that nest are handled
 * with counters in one forward pass: block comments nest by depth, raw strings
 * close on a `"` followed by their opening hash count, and attribute interiors
 * lex inline (marker and leading path attribute-styled, arguments under the
 * normal rules) with a `[`/`]` depth counter marking where the bracket closes.
 *
 * Disambiguation notes: `'` is a lifetime when ident-shaped text follows
 * without a closing quote (`'a`, `'static`, loop labels) and a char literal
 * otherwise; `name!` is a macro invocation unless the `!` starts `!=`; the
 * string prefixes (`r`/`b`/`c`/`br`/`cr`) are recognized before generic
 * identifier scanning and fall through to it when no quote follows.
 *
 * Resilience: unterminated block comments, strings (which span lines in
 * Rust), and raw strings extend to the end of the window; an unterminated
 * attribute simply lexes its interior to there.
 *
 * @module
 */

const T_COMMENT = token_type('comment');
const T_DOC_COMMENT = token_type('doc_comment', 'comment');
const T_HASHBANG = token_type('hashbang', 'comment');
const T_STRING = token_type('string');
const T_CHAR = token_type('char');
const T_LIFETIME = token_type('lifetime', 'symbol');
const T_ATTRIBUTE = token_type('attribute', 'attr_name');
const T_KEYWORD = token_type('keyword');
const T_SPECIAL_KEYWORD = token_type('special_keyword');
const T_BOOLEAN = token_type('boolean');
const T_NUMBER = token_type('number');
const T_FUNCTION = token_type('function');
const T_MACRO = token_type('macro', 'function');
const T_CLASS_NAME = token_type('class_name');
const T_BUILTIN = token_type('builtin');
const T_CONSTANT = token_type('constant');
const T_CAPITALIZED = token_type('capitalized_identifier', 'class_name');
const T_OPERATOR = token_type('operator');
const T_PUNCTUATION = token_type('punctuation');

// word classification kinds
const K_KEYWORD = 1; // unconditional keyword
const K_SPECIAL = 2; // unconditional special_keyword (control flow)
const K_BOOLEAN = 3;
const K_BUILTIN = 4; // primitive types
const K_UNION = 5; // weak keyword — a keyword only before an identifier
const K_MACRO_RULES = 6; // keyword only as `macro_rules!`

const WORDS: Map<string, number> = words_map(
	[
		K_KEYWORD,
		'as async const crate dyn enum extern fn impl in let mod move mut pub ref self Self ' +
			'static struct super trait type unsafe use where'
	],
	[K_SPECIAL, 'await break continue else for if loop match return try while yield'],
	[K_BOOLEAN, 'true false'],
	[K_BUILTIN, 'bool char f32 f64 i8 i16 i32 i64 i128 isize str u8 u16 u32 u64 u128 usize'],
	[K_UNION, 'union'],
	[K_MACRO_RULES, 'macro_rules']
);

// keywords that put the lexer in a type-name context for the next identifier
const CLASS_CTX_WORDS: Set<string> = new Set([
	'struct',
	'enum',
	'trait',
	'union',
	'type',
	'impl',
	'dyn'
]);

/**
 * Scans a `"` string from the quote at `from`, returning the exclusive end.
 * Rust strings span lines; unterminated extends to the window end.
 */
const scan_rust_string = (text: string, from: number, end: number): number => {
	let i = from + 1;
	while (i < end) {
		const c = text.charCodeAt(i);
		if (c === 92) i += 2;
		else if (c === 34) return i + 1;
		else i++;
	}
	return end;
};

/**
 * Scans a raw-string body from the opening `"` at `from`, closing on a `"`
 * followed by `hashes` `#`s. Each probe advances past a `"`, so the scan is
 * linear in quote-dense bodies. Unterminated extends to the window end.
 */
const scan_rust_raw_string = (text: string, from: number, end: number, hashes: number): number => {
	let i = from + 1;
	while (i < end) {
		const q = text.indexOf('"', i);
		if (q === -1 || q >= end) return end;
		let h = 0;
		// bound by `end` — in an embed window, hashes beyond it must not close
		while (h < hashes && q + 1 + h < end && text.charCodeAt(q + 1 + h) === 35) h++;
		if (h === hashes) return q + 1 + hashes;
		i = q + 1;
	}
	return end;
};

/**
 * Tries a raw-string body at `at` — an optional `#` run then `"`. Returns the
 * exclusive end past the matching closer (or the window end when
 * unterminated), or -1 when `at` doesn't open a raw string.
 */
const scan_rust_raw_prefixed = (text: string, at: number, end: number): number => {
	let h = at;
	while (h < end && text.charCodeAt(h) === 35) h++;
	if (h >= end || text.charCodeAt(h) !== 34) return -1;
	return scan_rust_raw_string(text, h, end, h - at);
};

/**
 * Scans a nested block comment from the `/*` at `from`, returning the
 * exclusive end. Rust block comments nest; unterminated extends to the
 * window end.
 */
const scan_rust_block_comment = (text: string, from: number, end: number): number => {
	let depth = 1;
	let i = from + 2;
	while (i < end) {
		const c = text.charCodeAt(i);
		// the closer needs both chars inside the window — a `*/` split across
		// an embed boundary leaves the comment unterminated instead
		if (c === 42 && i + 1 < end && text.charCodeAt(i + 1) === 47) {
			depth--;
			i += 2;
			if (depth === 0) return i;
		} else if (c === 47 && i + 1 < end && text.charCodeAt(i + 1) === 42) {
			depth++;
			i += 2;
		} else {
			i++;
		}
	}
	return end;
};

/**
 * Scans a char (or byte-char) literal from the `'` at `from` whose content is
 * not ident-shaped — an escape or a single code point. Returns the index after
 * the closing `'`, or -1 when this isn't a char literal.
 */
const scan_rust_char = (text: string, from: number, end: number): number => {
	let i = from + 1;
	if (i >= end) return -1;
	const c = text.charCodeAt(i);
	if (c === 39 || c === 10 || c === 13) return -1;
	if (c === 92) {
		// escape: \n \\ \' \0 \x7f \u{10FFFF}
		const e = text.charCodeAt(i + 1);
		if (e === 117 && text.charCodeAt(i + 2) === 123) {
			// \u{hex}, up to 6 hex digits with optional `_` separators
			let j = i + 3;
			const limit = j + 12 < end ? j + 12 : end;
			while (j < limit && (is_hex_digit(text.charCodeAt(j)) || text.charCodeAt(j) === 95)) j++;
			if (text.charCodeAt(j) !== 125) return -1;
			i = j + 1;
		} else {
			i += 2;
		}
	} else {
		// one code point — a high surrogate half means an astral pair
		i += c >= 0xd800 && c <= 0xdbff ? 2 : 1;
	}
	return i < end && text.charCodeAt(i) === 39 ? i + 1 : -1;
};

/**
 * Scans a numeric literal from the digit at `from`, returning the exclusive
 * end. Handles hex/octal/binary with `_` separators, decimal floats and
 * exponents, and literal suffixes (`1u8`, `2.5f32`) — any trailing ident run
 * glues onto the literal, matching rustc's lexing. A trailing `.` is never
 * consumed without a following digit, so `0..10` and `x.0` lex cleanly.
 */
const scan_rust_number = (text: string, from: number, end: number): number => {
	const scan_digits = (start: number, is_wanted: (c: number) => boolean): number => {
		let j = start;
		while (j < end) {
			const c = text.charCodeAt(j);
			// rust allows `_` freely between (and after) digits: 1_000, 0x_ff
			if (is_wanted(c) || c === 95) j++;
			else break;
		}
		return j;
	};
	const is_binary = (c: number): boolean => c === 48 || c === 49;
	const is_octal = (c: number): boolean => c >= 48 && c <= 55;

	let j;
	if (text.charCodeAt(from) === 48) {
		const c2 = text.charCodeAt(from + 1);
		if (c2 === 120 || c2 === 88) {
			j = scan_digits(from + 2, is_hex_digit);
		} else if (c2 === 111 || c2 === 79) {
			j = scan_digits(from + 2, is_octal);
		} else if (c2 === 98 || c2 === 66) {
			j = scan_digits(from + 2, is_binary);
		} else {
			j = scan_digits(from, is_digit);
		}
	} else {
		j = scan_digits(from, is_digit);
	}
	if (text.charCodeAt(j) === 46 && is_digit(text.charCodeAt(j + 1))) {
		j = scan_digits(j + 1, is_digit);
	}
	const e = text.charCodeAt(j);
	if (e === 101 || e === 69) {
		let k = j + 1;
		const sign = text.charCodeAt(k);
		if (sign === 43 || sign === 45) k++;
		if (is_digit(text.charCodeAt(k))) j = scan_digits(k, is_digit);
	}
	// literal suffix
	if (j < end && is_ident_start(text.charCodeAt(j))) j = scan_ident(text, j, end);
	return j > end ? end : j;
};

/**
 * Scans a multi-char operator at `i`, returning its length.
 */
const scan_rust_operator = (text: string, i: number, end: number): number => {
	const c = text.charCodeAt(i);
	const c2 = i + 1 < end ? text.charCodeAt(i + 1) : 0;
	const c3 = i + 2 < end ? text.charCodeAt(i + 2) : 0;
	switch (c) {
		case 43: // +
		case 42: // *
		case 47: // /
		case 37: // %
		case 94: // ^
		case 33: // !
			return c2 === 61 ? 2 : 1;
		case 45: // -
			return c2 === 61 || c2 === 62 ? 2 : 1; // -= ->
		case 38: // &
			return c2 === 38 || c2 === 61 ? 2 : 1; // && &=
		case 124: // |
			return c2 === 124 || c2 === 61 ? 2 : 1; // || |=
		case 60: // <
			if (c2 === 60) return c3 === 61 ? 3 : 2; // << <<=
			return c2 === 61 ? 2 : 1; // <=
		case 62: // >
			if (c2 === 62) return c3 === 61 ? 3 : 2; // >> >>=
			return c2 === 61 ? 2 : 1; // >=
		case 61: // =
			return c2 === 61 || c2 === 62 ? 2 : 1; // == =>
		default:
			return 1; // ? @
	}
};

const lex_rust = (l: Lexer): void => {
	const { text, end } = l;
	let i = l.pos;
	let fn_ctx = false; // after `fn` / `macro_rules!` — the next identifier is a definition name
	let class_ctx = false; // after `struct`/`enum`/… — the next identifier is a type name
	let attr_depth = 0; // `[`/`]` depth inside a `#[…]`/`#![…]` attribute (0 = outside)
	let attr_path = false; // the next identifier is part of the attribute's leading path

	// shebang at the very start of the document (`#!` not opening `#![…]`)
	if (
		i === 0 &&
		text.charCodeAt(0) === 35 &&
		text.charCodeAt(1) === 33 &&
		text.charCodeAt(2) !== 91
	) {
		const line_end = scan_to_line_end(text, 0, end);
		l.leaf(T_HASHBANG, 0, line_end);
		i = line_end;
	}

	while (i < end) {
		const c = text.charCodeAt(i);
		if (is_space(c)) {
			i++;
			continue;
		}

		// identifiers, keywords, and the r/b/c string prefixes
		if (is_ident_start(c)) {
			// the leading `::`-separated path of an attribute (`#[derive`, `#[serde`);
			// the arguments after it lex with the normal rules below
			if (attr_path) {
				const path_start = i;
				const path_end = scan_ident(text, i, end);
				l.leaf(T_ATTRIBUTE, path_start, path_end);
				i = path_end;
				// stay in the path only across a `::` segment separator
				attr_path = text.charCodeAt(path_end) === 58 && text.charCodeAt(path_end + 1) === 58;
				continue;
			}
			// r"…" r#"…"# r#ident
			if (c === 114) {
				const raw_end = scan_rust_raw_prefixed(text, i + 1, end);
				if (raw_end !== -1) {
					l.leaf(T_STRING, i, raw_end);
					i = raw_end;
					continue;
				}
				if (
					text.charCodeAt(i + 1) === 35 &&
					i + 2 < end &&
					is_ident_start(text.charCodeAt(i + 2))
				) {
					// r#ident raw identifier — a plain identifier, never a keyword
					i = scan_ident(text, i + 2, end);
					fn_ctx = class_ctx = false;
					continue;
				}
			} else if (c === 98) {
				// b"…" b'…' br"…" br#"…"#
				const c1 = text.charCodeAt(i + 1);
				if (c1 === 34) {
					const str_end = scan_rust_string(text, i + 1, end);
					l.leaf(T_STRING, i, str_end);
					i = str_end;
					continue;
				}
				if (c1 === 39) {
					const char_end = scan_rust_char(text, i + 1, end);
					if (char_end !== -1) {
						l.leaf(T_CHAR, i, char_end);
						i = char_end;
						continue;
					}
				}
				if (c1 === 114) {
					const raw_end = scan_rust_raw_prefixed(text, i + 2, end);
					if (raw_end !== -1) {
						l.leaf(T_STRING, i, raw_end);
						i = raw_end;
						continue;
					}
				}
			} else if (c === 99) {
				// c"…" cr"…" cr#"…"#
				const c1 = text.charCodeAt(i + 1);
				if (c1 === 34) {
					const str_end = scan_rust_string(text, i + 1, end);
					l.leaf(T_STRING, i, str_end);
					i = str_end;
					continue;
				}
				if (c1 === 114) {
					const raw_end = scan_rust_raw_prefixed(text, i + 2, end);
					if (raw_end !== -1) {
						l.leaf(T_STRING, i, raw_end);
						i = raw_end;
						continue;
					}
				}
			}

			const start = i;
			const ident_end = scan_ident(text, i, end);
			const word = text.slice(start, ident_end);
			const kind = WORDS.get(word);
			const was_fn_ctx = fn_ctx;
			const was_class_ctx = class_ctx;
			fn_ctx = class_ctx = false;
			i = ident_end;

			if (kind !== undefined) {
				if (kind === K_KEYWORD) {
					l.leaf(T_KEYWORD, start, ident_end);
					// `fn name`/`struct Name` name the identifier that follows, but
					// `fn(…)` is a pointer *type* and `impl<T>`/`struct;` have no name
					// here — only enter the naming context when an identifier actually
					// follows, or it leaks onto the next value
					if (word === 'fn') {
						fn_ctx = is_ident_start(text.charCodeAt(skip_space(text, ident_end, end)));
					} else if (CLASS_CTX_WORDS.has(word)) {
						class_ctx = is_ident_start(text.charCodeAt(skip_space(text, ident_end, end)));
					}
					continue;
				}
				if (kind === K_SPECIAL) {
					l.leaf(T_SPECIAL_KEYWORD, start, ident_end);
					continue;
				}
				if (kind === K_BOOLEAN) {
					l.leaf(T_BOOLEAN, start, ident_end);
					continue;
				}
				if (kind === K_BUILTIN) {
					l.leaf(T_BUILTIN, start, ident_end);
					continue;
				}
				if (kind === K_UNION) {
					// weak keyword — `union Foo` declares, `let union = …` is illegal
					// but `union` as a path segment/field is not
					if (is_ident_start(text.charCodeAt(skip_space(text, ident_end, end)))) {
						l.leaf(T_KEYWORD, start, ident_end);
						class_ctx = true;
						continue;
					}
				} else if (kind === K_MACRO_RULES) {
					if (ident_end < end && text.charCodeAt(ident_end) === 33) {
						l.leaf(T_KEYWORD, start, ident_end + 1);
						i = ident_end + 1;
						fn_ctx = true; // the next identifier names the macro
						continue;
					}
				}
			}

			if (was_fn_ctx) {
				l.leaf(T_FUNCTION, start, ident_end);
				continue;
			}
			if (was_class_ctx) {
				// a path keeps the context for its final segment: `impl fmt::Display`
				if (text.charCodeAt(ident_end) === 58 && text.charCodeAt(ident_end + 1) === 58) {
					class_ctx = true;
					continue;
				}
				l.leaf(T_CLASS_NAME, start, ident_end);
				continue;
			}

			// `name!` macro invocation — but `x != y` is the operator; the `!`
			// must sit inside the window so the span can't cross an embed boundary
			if (
				ident_end < end &&
				text.charCodeAt(ident_end) === 33 &&
				text.charCodeAt(ident_end + 1) !== 61
			) {
				l.leaf(T_MACRO, start, ident_end + 1);
				i = ident_end + 1;
				continue;
			}

			// SCREAMING_CASE constants and PascalCase type-ish identifiers; a
			// single uppercase letter is a generic param (T, E, K, V) far more
			// often than a constant
			if (is_upper(c)) {
				if (ident_end - start === 1) {
					l.leaf(T_CAPITALIZED, start, ident_end);
					continue;
				}
				let all_caps = true;
				for (let k = start + 1; k < ident_end; k++) {
					const cc = text.charCodeAt(k);
					if (!is_upper(cc) && cc !== 95 && !is_digit(cc)) {
						all_caps = false;
						break;
					}
				}
				l.leaf(all_caps ? T_CONSTANT : T_CAPITALIZED, start, ident_end);
				continue;
			}

			// call: `foo(…)`; turbofish call: `foo::<T>(…)`
			if (text.charCodeAt(ident_end) === 40) {
				l.leaf(T_FUNCTION, start, ident_end);
				continue;
			}
			if (
				text.charCodeAt(ident_end) === 58 &&
				text.charCodeAt(ident_end + 1) === 58 &&
				text.charCodeAt(ident_end + 2) === 60
			) {
				l.leaf(T_FUNCTION, start, ident_end);
				continue;
			}

			// plain identifier — no token
			continue;
		}

		// `'` — lifetime, loop label, or char literal
		if (c === 39) {
			const c1 = i + 1 < end ? text.charCodeAt(i + 1) : 0;
			if (is_ident_start(c1)) {
				const ident_end = scan_ident(text, i + 1, end);
				if (ident_end < end && text.charCodeAt(ident_end) === 39) {
					l.leaf(T_CHAR, i, ident_end + 1); // 'a'
					i = ident_end + 1;
				} else {
					l.leaf(T_LIFETIME, i, ident_end); // 'a  'static  'outer:
					i = ident_end;
				}
				continue;
			}
			const char_end = scan_rust_char(text, i, end);
			if (char_end !== -1) {
				l.leaf(T_CHAR, i, char_end);
				i = char_end;
				continue;
			}
			i++; // stray quote — plain text
			continue;
		}

		// strings
		if (c === 34) {
			const str_end = scan_rust_string(text, i, end);
			l.leaf(T_STRING, i, str_end);
			i = str_end;
			continue;
		}

		// `/` — comments or division
		if (c === 47) {
			const c2 = i + 1 < end ? text.charCodeAt(i + 1) : 0;
			if (c2 === 47) {
				const line_end = scan_to_line_end(text, i, end);
				// classify from window-internal chars only — a marker char beyond
				// the window is host text, not part of this comment
				const c3 = i + 2 < end ? text.charCodeAt(i + 2) : 0;
				const c4 = i + 3 < end ? text.charCodeAt(i + 3) : 0;
				// `///` (but not `////`) and `//!` are doc comments
				const is_doc = (c3 === 47 && c4 !== 47) || c3 === 33;
				l.leaf(is_doc ? T_DOC_COMMENT : T_COMMENT, i, line_end);
				i = line_end;
				continue; // comments are transparent — contexts survive
			}
			if (c2 === 42) {
				const comment_end = scan_rust_block_comment(text, i, end);
				const c3 = i + 2 < end ? text.charCodeAt(i + 2) : 0;
				const c4 = i + 3 < end ? text.charCodeAt(i + 3) : 0;
				// `/**` (but not `/**/` or `/***`) and `/*!` are doc comments
				const is_doc = (c3 === 42 && c4 !== 47 && c4 !== 42) || c3 === 33;
				l.leaf(is_doc ? T_DOC_COMMENT : T_COMMENT, i, comment_end);
				i = comment_end;
				continue;
			}
			const op_len = scan_rust_operator(text, i, end);
			l.leaf(T_OPERATOR, i, i + op_len);
			i += op_len;
			continue;
		}

		// `#` — attribute or stray. The interior lexes inline: the `#[`/`#![`
		// marker and the leading path are attribute-styled, the arguments get the
		// normal rules, and the `[`/`]` depth counter bookends the closing bracket
		if (c === 35) {
			const c1 = i + 1 < end ? text.charCodeAt(i + 1) : 0;
			// the whole marker must sit inside the window — a `#![` whose `[` is
			// beyond an embed boundary stays a stray `#`, not a truncated attribute
			if (c1 === 91 || (c1 === 33 && i + 2 < end && text.charCodeAt(i + 2) === 91)) {
				const marker_end = c1 === 33 ? i + 3 : i + 2; // past `#[` or `#![`
				l.leaf(T_ATTRIBUTE, i, marker_end);
				i = marker_end;
				attr_depth = 1;
				attr_path = true;
				continue;
			}
			i++;
			continue;
		}

		// numbers (no `.5` floats in rust — a leading `.` is always punctuation)
		if (is_digit(c)) {
			const num_end = scan_rust_number(text, i, end);
			l.leaf(T_NUMBER, i, num_end);
			i = num_end;
			continue;
		}

		// `.` — member access, or the `..`/`..=`/`...` range operators. The
		// second `.` must sit inside the window so the span can't cross an embed
		// boundary; a `.` at the window edge stays punctuation
		if (c === 46) {
			if (i + 1 < end && text.charCodeAt(i + 1) === 46) {
				const c3 = i + 2 < end ? text.charCodeAt(i + 2) : 0;
				const op_len = c3 === 61 || c3 === 46 ? 3 : 2;
				l.leaf(T_OPERATOR, i, i + op_len);
				i += op_len;
			} else {
				l.leaf(T_PUNCTUATION, i, i + 1);
				i++;
			}
			continue;
		}

		// attribute brackets — depth-count so a nested `[` doesn't close the
		// attribute early, and style the closing `]` to bookend the `#[` marker
		if (attr_depth > 0 && (c === 91 || c === 93)) {
			if (c === 91) {
				attr_depth++;
				l.leaf(T_PUNCTUATION, i, i + 1);
			} else {
				attr_depth--;
				if (attr_depth === 0) {
					l.leaf(T_ATTRIBUTE, i, i + 1);
					attr_path = false;
				} else {
					l.leaf(T_PUNCTUATION, i, i + 1);
				}
			}
			i++;
			continue;
		}

		// punctuation — `:`/`::` render as punctuation so path runs coalesce
		if (
			c === 123 ||
			c === 125 ||
			c === 91 ||
			c === 93 ||
			c === 40 ||
			c === 41 ||
			c === 59 ||
			c === 44 ||
			c === 58
		) {
			l.leaf(T_PUNCTUATION, i, i + 1);
			i++;
			continue;
		}

		// operators
		if (
			c === 43 ||
			c === 45 ||
			c === 42 ||
			c === 37 ||
			c === 94 ||
			c === 38 ||
			c === 124 ||
			c === 61 ||
			c === 33 ||
			c === 60 ||
			c === 62 ||
			c === 63 ||
			c === 64
		) {
			const op_len = scan_rust_operator(text, i, end);
			l.leaf(T_OPERATOR, i, i + op_len);
			i += op_len;
			continue;
		}

		// anything else is plain text
		i++;
	}
	l.pos = end;
};

/**
 * The Rust language registration for the lexer engine.
 */
export const lexer_rust: SyntaxLang = {
	id: 'rust',
	aliases: ['rs'],
	lex: lex_rust
};
