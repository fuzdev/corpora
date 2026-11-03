import {
	advance_probe,
	is_digit,
	is_hex_digit,
	is_ident,
	is_ident_start,
	is_space,
	is_upper,
	scan_ident,
	scan_to_line_end,
	skip_quoted,
	skip_space,
	token_type,
	trim_space_end,
	words_map,
	WordIndex,
	Lexer,
	type SyntaxLang
} from './lexer.ts';

/**
 * TypeScript/JavaScript lexer.
 *
 * Disambiguation rests on three rules: previous-token tracking separates a
 * regex literal from division, template literals nest their `${…}`
 * interpolations, and matching is position-major (a string wins over a comment
 * that opens inside it).
 *
 * Nesting (template interpolations, generic argument lists, `: type`
 * annotations) runs on an explicit pooled frame stack, so arbitrarily deep
 * input tokenizes fully without touching the JS call stack.
 *
 * Type positions: a `:` is an annotation or an operator by where it is. The
 * machine tracks the bracket level it is in (block, object literal, parens,
 * array, class body) and each level's `?`s still waiting for a `:`, so
 * `(x: T)`, `let x: T;` and `): T {` are annotations and `{a: b}`, `a ? b : c`,
 * `case x:` and labels are not. The type then lexes in type mode and ends at
 * the first token that can't continue it. A type alias's body and the tail of
 * an `as` assertion lex the same way. It is a heuristic over tokens, not a
 * parse: a name alone on its line before a `:` reads as a label.
 *
 * Resilience: unterminated strings extend to end of line; unterminated
 * templates, block comments, and interpolations extend to end of window.
 * Interpolation bodies discover their own closing `}` during real tokenization
 * (nothing is prescanned), so constructs that contain a `}` — regex literals,
 * strings, comments — never end an interpolation early. The tradeoff is that
 * damage propagates rather than being contained: a malformed interior that
 * consumes the closing `}` (say an unterminated block comment) extends the
 * interpolation past it, editor-style.
 *
 * @module
 */

const T_COMMENT = token_type('comment');
const T_HASHBANG = token_type('hashbang', 'comment');
const T_STRING = token_type('string');
const T_STRING_PROPERTY = token_type('string_property', 'property');
const T_TEMPLATE_STRING = token_type('template_string');
const T_TEMPLATE_PUNCTUATION = token_type('template_punctuation', 'string');
const T_INTERPOLATION = token_type('interpolation');
const T_INTERPOLATION_PUNCTUATION = token_type('interpolation_punctuation', 'punctuation');
const T_REGEX = token_type('regex');
const T_REGEX_DELIMITER = token_type('regex_delimiter');
const T_REGEX_SOURCE = token_type('regex_source', 'lang_regex');
const T_REGEX_FLAGS = token_type('regex_flags');
const T_KEYWORD = token_type('keyword');
const T_SPECIAL_KEYWORD = token_type('special_keyword');
const T_IMPORT_TYPE_KEYWORD = token_type('import_type_keyword', 'special_keyword');
const T_CLASS_NAME = token_type('class_name');
const T_TYPE_NAME = token_type('type_name', 'class_name');
const T_TYPE_ASSERTION = token_type('type_assertion', 'class_name');
const T_FUNCTION = token_type('function');
const T_FUNCTION_VARIABLE = token_type('function_variable', 'function');
const T_GENERIC_FUNCTION = token_type('generic_function');
const T_GENERIC = token_type('generic', 'class_name');
const T_BUILTIN = token_type('builtin');
const T_BOOLEAN = token_type('boolean');
const T_NUMBER = token_type('number');
const T_OPERATOR = token_type('operator');
const T_PUNCTUATION = token_type('punctuation');
const T_CONSTANT = token_type('constant');
const T_CAPITALIZED = token_type('capitalized_identifier', 'class_name');
const T_DECORATOR = token_type('decorator');
const T_AT = token_type('at', 'operator');
const T_DECORATOR_NAME = token_type('function', 'decorator_name');
const T_TYPE_ANNOTATION = token_type('type_annotation');
const T_TYPE = token_type('type');

// word classification kinds
const K_KEYWORD = 1; // unconditional keyword
const K_SPECIAL = 2; // unconditional special_keyword
const K_TS = 3; // ts-only unconditional keyword
const K_ASYNC = 4; // keyword before `function`/`*`/`(`/ident
const K_GET_SET = 5; // keyword before ident/`#`/`[`
const K_ASSERT = 6; // keyword before `{`
const K_TYPE_WORD = 7; // `type` — import_type_keyword or keyword before ident/`{`/`*`
const K_TS_COND = 8; // ts keyword before ident/`{`
const K_BOOLEAN = 9;
const K_NUMBER_WORD = 10; // NaN/Infinity

const WORDS: Map<string, number> = words_map(
	[
		K_KEYWORD,
		'class const debugger delete enum extends function implements in instanceof interface let ' +
			'new null of package private protected public static super this typeof undefined var void with'
	],
	[
		K_SPECIAL,
		'as await break case catch continue default do else export finally for from if import ' +
			'return switch throw try while yield'
	],
	[K_TS, 'abstract declare is keyof readonly require satisfies'],
	[K_TS_COND, 'asserts infer module namespace'],
	[K_ASYNC, 'async'],
	[K_GET_SET, 'get set'],
	[K_ASSERT, 'assert'],
	[K_TYPE_WORD, 'type'],
	[K_BOOLEAN, 'true false'],
	[K_NUMBER_WORD, 'NaN Infinity']
);

// a word's value in `WORD_INDEX`: its kind in the low bits, `0` for a word that
// is only a builtin, and context flags above
const KIND_MASK = 15;
const F_CLASS_CTX = 16; // puts the lexer in a class-name context for the next identifier
const F_AS = 32; // the next identifier is a type assertion
const F_IMPORT = 64;
const F_VALUE = 128; // value-like keyword — division follows, not a regex literal
// lowercase-only builtins are reachable — capitalized ones are claimed by
// `capitalized_identifier` first in the classification order
const F_BUILTIN = 256;
const F_BLOCK_INTRO = 512; // a `{` after it opens a block, not an object literal
const F_CASE = 1024; // the next `:` ends a `case`/`default` clause
const F_CLASS_BODY = 2048; // the next `{` opens a class or interface body
const F_TYPE_OP = 4096; // continues a type: after it comes another part of the type
// the flags the keyword path acts on, tested as one
const F_CTX = F_CLASS_CTX | F_AS | F_IMPORT | F_BLOCK_INTRO | F_CASE | F_CLASS_BODY;

for (const [flag, words] of [
	[F_CLASS_CTX, 'class extends implements instanceof interface new type'],
	[F_AS, 'as satisfies'],
	[F_IMPORT, 'import export'],
	[F_VALUE, 'this super null undefined'],
	[
		F_BUILTIN,
		'Array Function Promise any bigint boolean console never number string symbol unknown'
	],
	[F_BLOCK_INTRO, 'else try finally do'],
	[F_CASE, 'case default'],
	[F_CLASS_BODY, 'class interface'],
	[F_TYPE_OP, 'extends is keyof typeof infer readonly in as asserts new abstract']
] as const) {
	for (const word of words.split(' ')) WORDS.set(word, (WORDS.get(word) ?? 0) | flag);
}

const WORD_INDEX = new WordIndex(WORDS);

// previous-significant-token categories, for regex-vs-division and contexts
const P_NONE = 0; // start / after operator, `{`, `(`, `[`, `,`, `;` — regex allowed
const P_VALUE = 1; // after a value — `/` is division
const P_DOT = 2; // after `.` member access — next word is a property, not a keyword

// a `prev_code` that is no char: after `=>` or a keyword like `else`, where a
// `{` opens a block
const PC_BLOCK_INTRO = 3;

// what a bracket level of a value window is, in the low bits of its entry in
// `TsMachine.levels`; the bits above count its `?`s still waiting for a `:`
const L_BLOCK = 0;
const L_OBJECT = 1;
const L_PAREN = 2;
const L_ARRAY = 3;
const L_CLASS = 4;
const L_MODULE = 5; // an `import {…}`/`export {…}` specifier list
const L_KIND_MASK = 7;
const L_TERNARY = 8;

// `TsFrame.flags`
const FF_CASE = 1; // a `case`/`default` whose `:` hasn't come
const FF_CLASS_BODY = 2; // a `class`/`interface` whose body `{` hasn't come
const FF_ALIAS = 4; // a `type` alias whose `=` hasn't come

// bounded lookahead for heuristic scans (generics, arrow params)
const MAX_SCAN = 600;

/**
 * Monotonic next-occurrence caches for the heuristic-scan prechecks. Each
 * bounded scan can only succeed if its success char (`>` for generics, `)` for
 * arrow params) occurs within its `MAX_SCAN` window, so a cached native
 * `indexOf` probe skips scans that cannot succeed. The caches advance
 * monotonically through the document, so total probe work is O(n) — this is
 * what keeps angle/paren-dense pathological inputs linear instead of paying
 * `MAX_SCAN` per occurrence.
 */
interface TsScanCache {
	next_gt: number;
	next_rparen: number;
}

const create_ts_scan_cache = (): TsScanCache => ({
	next_gt: -1,
	next_rparen: -1
});

/**
 * Scans a `'` or `"` string from `i`, returning the exclusive end.
 * Handles escapes and line continuations; unterminated stops at the newline.
 */
const scan_ts_string = (text: string, from: number, end: number, quote: number): number => {
	let i = from + 1;
	while (i < end) {
		const c = text.charCodeAt(i);
		if (c === 92) {
			// escape; a `\` before a newline continues the string
			i += text.charCodeAt(i + 1) === 13 && text.charCodeAt(i + 2) === 10 ? 3 : 2;
		} else if (c === quote) {
			return i + 1;
		} else if (c === 10 || c === 13) {
			return i;
		} else {
			i++;
		}
	}
	return end;
};

// the digit loops allow `_` only between two wanted digits
const scan_ts_decimal = (text: string, from: number, end: number): number => {
	let j = from;
	while (j < end) {
		const c = text.charCodeAt(j);
		if ((c >= 48 && c <= 57) || (c === 95 && is_digit(text.charCodeAt(j + 1)))) j++;
		else break;
	}
	return j;
};

// `radix` is 16, 8, or 2
const scan_ts_radix = (text: string, from: number, end: number, radix: number): number => {
	let j = from;
	while (j < end) {
		const c = text.charCodeAt(j);
		const wanted =
			radix === 16 ? is_hex_digit(c) : radix === 2 ? c === 48 || c === 49 : c >= 48 && c <= 55;
		if (wanted) j++;
		else if (c === 95) {
			const n = text.charCodeAt(j + 1);
			const next =
				radix === 16 ? is_hex_digit(n) : radix === 2 ? n === 48 || n === 49 : n >= 48 && n <= 55;
			if (next) j++;
			else break;
		} else break;
	}
	return j;
};

/**
 * Scans a numeric literal from `i` (at a digit, or `.` before a digit),
 * returning the exclusive end. Handles hex/binary/octal, `_` separators,
 * exponents, and bigint `n` suffixes.
 *
 * The digit loops are top-level functions rather than closures made per
 * literal: closures allocate on every number, and measured slower on
 * number-dense input.
 */
const scan_ts_number = (text: string, i: number, end: number): number => {
	if (text.charCodeAt(i) === 48) {
		const c2 = text.charCodeAt(i + 1);
		const radix =
			c2 === 120 || c2 === 88 ? 16 : c2 === 98 || c2 === 66 ? 2 : c2 === 111 || c2 === 79 ? 8 : 0;
		if (radix !== 0) {
			let j = scan_ts_radix(text, i + 2, end, radix);
			if (text.charCodeAt(j) === 110) j++; // n
			return j;
		}
	}
	let j = scan_ts_decimal(text, i, end);
	let is_integer = true;
	if (text.charCodeAt(j) === 46 && is_digit(text.charCodeAt(j + 1))) {
		is_integer = false;
		j = scan_ts_decimal(text, j + 1, end);
	}
	const e = text.charCodeAt(j);
	if (e === 101 || e === 69) {
		let k = j + 1;
		const sign = text.charCodeAt(k);
		if (sign === 43 || sign === 45) k++;
		if (is_digit(text.charCodeAt(k))) {
			j = scan_ts_decimal(text, k, end);
			is_integer = false;
		}
	}
	if (is_integer && text.charCodeAt(j) === 110) j++; // bigint
	return j;
};

/**
 * Finds the matching `>` for the `<` at `i` (generic argument lists), skipping
 * strings. Bounded by `MAX_SCAN`; returns -1 when unbalanced. Rejects at `;`
 * and at any unbalanced `)`/`}`/`]` — a generic argument list can contain
 * balanced groups (object types, tuples, parenthesized function types) but
 * never a stray closer, and without this reject the scan would run across
 * statement or interpolation boundaries and misread a later `>` as the match
 * (e.g. two comparisons in `a < b} ${c > (d)`).
 */
const scan_balanced_angle = (text: string, i: number, end: number, cache: TsScanCache): number => {
	const limit = i + MAX_SCAN < end ? i + MAX_SCAN : end;
	// success needs a `>` within the window — skip the scan when there is none
	cache.next_gt = advance_probe(text, cache.next_gt, i + 1, '>');
	if (cache.next_gt >= limit) return -1;
	let depth = 0;
	let group = 0; // combined `(`/`{`/`[` nesting — valid input nests properly
	let j = i;
	while (j < limit) {
		const c = text.charCodeAt(j);
		if (c === 60) {
			depth++;
			j++;
		} else if (c === 62) {
			depth--;
			if (depth === 0) return j;
			j++;
		} else if (c === 34 || c === 39 || c === 96) {
			j = skip_quoted(text, j, end, c);
		} else if (c === 40 || c === 123 || c === 91) {
			group++;
			j++;
		} else if (c === 41 || c === 125 || c === 93) {
			if (group === 0) return -1;
			group--;
			j++;
		} else if (c === 59) {
			return -1; // `;` never appears in a generic argument list
		} else {
			j++;
		}
	}
	return -1;
};

/**
 * Finds the matching `)` for the `(` at `i`, skipping strings and nested
 * parens. Bounded by `MAX_SCAN`; returns -1 when unbalanced. Rejects at any
 * unbalanced `}`/`]` — a parameter list can contain balanced destructuring
 * groups but never a stray closer, so one marks a boundary the scan must not
 * cross.
 */
const scan_balanced_parens = (text: string, i: number, end: number, cache: TsScanCache): number => {
	const limit = i + MAX_SCAN < end ? i + MAX_SCAN : end;
	// success needs a `)` within the window — skip the scan when there is none
	cache.next_rparen = advance_probe(text, cache.next_rparen, i + 1, ')');
	if (cache.next_rparen >= limit) return -1;
	let depth = 0;
	let group = 0; // combined `{`/`[` nesting — valid input nests properly
	let j = i;
	while (j < limit) {
		const c = text.charCodeAt(j);
		if (c === 40) {
			depth++;
			j++;
		} else if (c === 41) {
			depth--;
			if (depth === 0) return j;
			j++;
		} else if (c === 34 || c === 39 || c === 96) {
			j = skip_quoted(text, j, end, c);
		} else if (c === 123 || c === 91) {
			group++;
			j++;
		} else if (c === 125 || c === 93) {
			if (group === 0) return -1;
			group--;
			j++;
		} else {
			j++;
		}
	}
	return -1;
};

/**
 * Detects whether an identifier is a function-valued variable: followed by
 * `=` or `:` (`after` is the identifier's next significant position, already
 * past whitespace), then optional `async`, then a `function` keyword,
 * `(params) =>`, or `param =>`.
 */
const is_function_variable = (
	text: string,
	after: number,
	end: number,
	cache: TsScanCache
): boolean => {
	const c = text.charCodeAt(after);
	if (c === 61) {
		// `=` — but not `==`/`=>`/`===`
		const c2 = text.charCodeAt(after + 1);
		if (c2 === 61 || c2 === 62) return false;
	} else if (c !== 58) {
		return false;
	}
	let j = skip_space(text, after + 1, end);
	// optional `async`
	if (text.startsWith('async', j)) {
		const after = j + 5;
		if (!is_ident(text.charCodeAt(after))) j = skip_space(text, after, end);
	}
	if (text.startsWith('function', j) && !is_ident(text.charCodeAt(j + 8))) return true;
	const c3 = text.charCodeAt(j);
	if (c3 === 40) {
		// `(params)` then optional `: type` then `=>`
		const close = scan_balanced_parens(text, j, end, cache);
		if (close === -1) return false;
		let k = skip_space(text, close + 1, end);
		if (text.charCodeAt(k) === 58) {
			// return type annotation — scan to `=>` before a terminator
			const limit = k + MAX_SCAN < end ? k + MAX_SCAN : end;
			k++;
			while (k < limit) {
				const c4 = text.charCodeAt(k);
				if (c4 === 61 && text.charCodeAt(k + 1) === 62) break;
				if (c4 === 59 || c4 === 61) return false;
				k++;
			}
		}
		return text.charCodeAt(k) === 61 && text.charCodeAt(k + 1) === 62;
	}
	if (is_ident_start(c3)) {
		// `param =>`
		const param_end = scan_ident(text, j, end);
		const k = skip_space(text, param_end, end);
		return text.charCodeAt(k) === 61 && text.charCodeAt(k + 1) === 62;
	}
	return false;
};

/**
 * Whether the `as` at `as_start` renames a module binding rather than asserting
 * a type: it sits in an `import {…}`/`export {…}` specifier list, or follows the
 * `*` of `import * as ns`/`export * as ns`, which no expression can.
 */
const is_module_rename = (text: string, as_start: number, level: number): boolean => {
	if ((level & L_KIND_MASK) === L_MODULE) return true;
	let before = as_start - 1;
	while (before >= 0 && is_space(text.charCodeAt(before))) before--;
	return text.charCodeAt(before) === 42;
};

/**
 * Whether what is before the `:` at `colon` can take a type annotation: a name
 * (optionally with `?` or `!`), or the end of a destructuring pattern. At
 * statement level (`statement`) the name must also follow something on its
 * own line, as in `let x: T`, which a label never does. Reads the text
 * backwards so that the identifier path keeps no state for it.
 */
const is_annotated_name = (text: string, colon: number, statement: boolean): boolean => {
	let j = colon - 1;
	while (j >= 0 && is_space(text.charCodeAt(j))) j--;
	if (j < 0) return false;
	let c = text.charCodeAt(j);
	// `x?: T`, `x!: T`
	if (c === 63 || c === 33) c = text.charCodeAt(--j);
	// `}: T`, `]: T`
	if (c === 125 || c === 93) return true;
	if (!is_ident(c)) return false;
	if (!statement) return true;
	while (j >= 0 && is_ident(text.charCodeAt(j))) j--;
	// spaces and tabs only: the line must go on before the name
	while (j >= 0 && (text.charCodeAt(j) === 32 || text.charCodeAt(j) === 9)) j--;
	if (j < 0) return false;
	const before = text.charCodeAt(j);
	return is_ident(before) || before === 44;
};

/**
 * Scans a multi-char operator at `i`, returning its length.
 */
const scan_operator = (text: string, i: number, end: number): number => {
	const c = text.charCodeAt(i);
	const c2 = i + 1 < end ? text.charCodeAt(i + 1) : 0;
	const c3 = i + 2 < end ? text.charCodeAt(i + 2) : 0;
	const c4 = i + 3 < end ? text.charCodeAt(i + 3) : 0;
	switch (c) {
		case 43: // +
			return c2 === 43 || c2 === 61 ? 2 : 1;
		case 45: // -
			return c2 === 45 || c2 === 61 ? 2 : 1;
		case 42: // *
			if (c2 === 42) return c3 === 61 ? 3 : 2;
			return c2 === 61 ? 2 : 1;
		case 37: // %
			return c2 === 61 ? 2 : 1;
		case 38: // &
			if (c2 === 38) return c3 === 61 ? 3 : 2;
			return c2 === 61 ? 2 : 1;
		case 124: // |
			if (c2 === 124) return c3 === 61 ? 3 : 2;
			return c2 === 61 ? 2 : 1;
		case 94: // ^
			return c2 === 61 ? 2 : 1;
		case 61: // =
			if (c2 === 61) return c3 === 61 ? 3 : 2;
			return c2 === 62 ? 2 : 1; // =>
		case 33: // !
			if (c2 === 61) return c3 === 61 ? 3 : 2;
			return 1;
		case 60: // <
			if (c2 === 60) return c3 === 61 ? 3 : 2;
			return c2 === 61 ? 2 : 1;
		case 62: // >
			if (c2 === 62) {
				if (c3 === 62) return c4 === 61 ? 4 : 3;
				return c3 === 61 ? 3 : 2;
			}
			return c2 === 61 ? 2 : 1;
		case 63: // ?
			if (c2 === 63) return c3 === 61 ? 3 : 2;
			return c2 === 46 ? 2 : 1; // ?.
		case 47: // /
			return c2 === 61 ? 2 : 1;
		default:
			return 1; // ~ :
	}
};

// Explicit-stack driver for nested constructs (template interpolations,
// generic argument lists, and `: type` annotations). Each construct pushes a
// frame rather than recursing on the JS call stack, so arbitrarily deep input
// tokenizes fully without overflowing — the deep-nesting tests exercise this
// to thousands of levels. Frames are pooled across a single `lex_ts` run
// (`stack` only grows, never shrinks) to keep deep nesting allocation-free
// after warmup.

const F_WINDOW = 0; // a window scan in progress
const F_TEMPLATE = 1; // a template-literal body scan in progress

// how a completed frame finalizes into the frame beneath it
const R_ROOT = 0; // top-level window — nothing beneath it
const R_INTERP = 1; // `${…}` body → close the interpolation, resume its template
const R_CLASS_GENERIC = 2; // `Foo<…>` in a class-name chain → advance the window
const R_GENERIC_CALL = 3; // `foo<…>(…)` args → close the generic, advance
const R_TYPE_ANNO = 4; // `: type` body → close the type, advance to where it ended
const R_TYPE_BARE = 6; // a type with no container (alias body, `as` tail) → advance
const R_TEMPLATE = 5; // a template literal in a window → advance past it

/**
 * One suspended scan on the explicit stack. A window frame carries the full
 * per-window scan state (cursor, previous-token category, contexts); a
 * template frame carries its body-scan cursor. `ret`/`ret_a`/`ret_b` describe
 * how the frame finalizes into the one beneath it when it completes.
 */
interface TsFrame {
	kind: number;
	to: number;
	type_mode: boolean;
	/** Scan cursor: the window position, or the template body position. */
	i: number;
	prev: number;
	prev_code: number;
	class_ctx: boolean;
	as_ctx: boolean;
	import_ctx: boolean;
	/** Template only: start of the pending literal chunk. */
	chunk_start: number;
	/**
	 * Self-discovery terminator for the window: the char code that ends it
	 * (`}` for `${…}` interpolation bodies), or 0 when the window's end was
	 * known at push time. The frame finds its own end during real tokenization
	 * — strings, comments, and regexes consume their delimiter chars inside
	 * their token scans, so only a real closing delimiter terminates.
	 */
	term: number;
	/**
	 * Open-delimiter depth for `term` windows. Nested constructs push their own
	 * frames, so this only counts the frame's own unclosed `{`s; the `term`
	 * char that would bring it to 0 terminates the window (recorded in
	 * `ret_a`).
	 */
	depth: number;
	ret: number;
	ret_a: number;
	ret_b: number;
	/**
	 * Whether a type-mode window finds its own end: it stops before the first
	 * token that can't continue the type (recorded in `ret_a`), with `depth`
	 * counting its open `(`/`[`/`{`s, `angle` its `<`s outside them, `expect`
	 * whether another part of the type must follow, and `cond` its `?`s waiting
	 * for a `:`.
	 */
	self_type: boolean;
	angle: number;
	expect: boolean;
	cond: number;
	/**
	 * A self-ending type: whether its last top-level `(…)` can be a parameter
	 * list, so that a `=>` after it continues the type. One after `|` or `&`
	 * can't — a function type there is itself parenthesized — so the `=>` is the
	 * arrow of the function whose return type this is.
	 */
	params: boolean;
	/** Value windows: `FF_*` contexts pending in this window. */
	flags: number;
	/** The window's first entry in `TsMachine.levels`. */
	level_base: number;
}

interface TsMachine {
	l: Lexer;
	cache: TsScanCache;
	/**
	 * The bracket levels open in the value windows on the stack, innermost last:
	 * each `L_*` kind plus its pending-ternary count. What a `:` means depends on
	 * the level it is in.
	 */
	levels: Int32Array;
	level_sp: number;
	/**
	 * A word that ends the root window where it stands outside every bracket,
	 * `''` for none: see `SyntaxLang.lex_to_brace`.
	 */
	stop_word: string;
	/** Frame pool doubling as the stack; frames above `sp` are dormant. */
	stack: Array<TsFrame>;
	sp: number;
}

const create_ts_frame = (): TsFrame => ({
	kind: F_WINDOW,
	to: 0,
	type_mode: false,
	i: 0,
	prev: P_NONE,
	prev_code: 0,
	class_ctx: false,
	as_ctx: false,
	import_ctx: false,
	chunk_start: 0,
	term: 0,
	depth: 0,
	ret: R_ROOT,
	ret_a: 0,
	ret_b: 0,
	self_type: false,
	angle: 0,
	expect: false,
	cond: 0,
	params: false,
	flags: 0,
	level_base: 0
});

/**
 * Pushes a window frame scanning `[from, to)`, reusing the pooled slot at the
 * stack top. `ret`/`ret_a`/`ret_b` are applied when it completes. A nonzero
 * `term` makes the window self-discovering: it terminates at the `term` char
 * that brings `depth` to 0, writing the discovered position to `ret_a`.
 */
const mac_push_window = (
	mac: TsMachine,
	from: number,
	to: number,
	type_mode: boolean,
	ret: number,
	ret_a: number,
	ret_b: number,
	term: number,
	depth: number
): void => {
	const { stack, sp } = mac;
	let f = stack[sp];
	if (f === undefined) {
		f = create_ts_frame();
		stack[sp] = f;
	}
	f.kind = F_WINDOW;
	f.to = to;
	f.type_mode = type_mode;
	f.i = from;
	f.prev = P_NONE;
	f.prev_code = 0;
	f.class_ctx = false;
	f.as_ctx = false;
	f.import_ctx = false;
	f.term = term;
	f.depth = depth;
	f.ret = ret;
	f.ret_a = ret_a;
	f.ret_b = ret_b;
	f.self_type = false;
	f.flags = 0;
	// every window gets a level of its own, which its brackets stack on
	const level = mac.level_sp + 1;
	if (level === mac.levels.length) {
		const next = new Int32Array(level * 2);
		next.set(mac.levels);
		mac.levels = next;
	}
	mac.levels[level] = L_BLOCK;
	mac.level_sp = level;
	f.level_base = level;
	mac.sp = sp + 1;
};

/**
 * Pushes a type-mode window from `from` that finds its own end, which the
 * finalize reads from `ret_a`. `expect` is whether a type must start at `from`
 * (after `:` or `=`) or may only continue (after an `as Foo`).
 */
const mac_push_type = (
	mac: TsMachine,
	from: number,
	to: number,
	ret: number,
	ret_b: number,
	expect: boolean
): void => {
	mac_push_window(mac, from, to, true, ret, to, ret_b, 0, 0);
	const f = mac.stack[mac.sp - 1]!;
	f.self_type = true;
	f.angle = 0;
	f.expect = expect;
	f.cond = 0;
};

/**
 * Pushes a template-literal frame resuming at the `${…}` found at `from`. The
 * caller emitted the literal's opening events and scanned the leading chunk
 * (which starts at `chunk_start`, past the opening backtick); the frame always
 * finalizes by advancing the window beneath it past the literal.
 */
const mac_push_template = (mac: TsMachine, from: number, chunk_start: number, to: number): void => {
	const { stack, sp } = mac;
	let f = stack[sp];
	if (f === undefined) {
		f = create_ts_frame();
		stack[sp] = f;
	}
	f.kind = F_TEMPLATE;
	f.to = to;
	f.i = from;
	f.chunk_start = chunk_start;
	f.ret = R_TEMPLATE;
	f.ret_a = 0;
	f.ret_b = 0;
	mac.sp = sp + 1;
};

/**
 * Scans a template-literal body from `from` (past the opening backtick).
 * Returns the closing backtick's index, `to` when unterminated, or the bitwise
 * complement of the position of a `${…}` interpolation — the fast path lets
 * interpolation-free literals complete without a frame.
 */
const scan_ts_template_body = (text: string, from: number, to: number): number => {
	let j = from;
	while (j < to) {
		const c = text.charCodeAt(j);
		if (c === 92) {
			j += 2;
		} else if (c === 96) {
			return j;
		} else if (c === 36 && j + 1 < to && text.charCodeAt(j + 1) === 123) {
			return ~j;
		} else {
			j++;
		}
	}
	return to;
};

/**
 * Runs (or resumes) a template-literal frame: scans literal chunks until the
 * closing backtick or a `${…}` interpolation (the opening events were emitted
 * before the push). An interpolation pushes a value-mode window frame and
 * returns `false`; the driver's `R_INTERP` finalize closes the interpolation
 * and resumes this frame past it. Returns `true` once the literal is complete
 * (closed, or extended to the window end when unterminated).
 */
const run_ts_template = (mac: TsMachine, frame: TsFrame): boolean => {
	const l = mac.l;
	const { text } = l;
	const to = frame.to;
	let j = frame.i;
	const chunk_start = frame.chunk_start;
	while (j < to) {
		const c = text.charCodeAt(j);
		if (c === 92) {
			j += 2;
		} else if (c === 96) {
			l.leaf(T_STRING, chunk_start, j);
			l.leaf(T_TEMPLATE_PUNCTUATION, j, j + 1);
			j++;
			l.close(j); // close the template container
			frame.i = j;
			return true;
		} else if (c === 36 && j + 1 < to && text.charCodeAt(j + 1) === 123) {
			l.leaf(T_STRING, chunk_start, j);
			l.open(T_INTERPOLATION, j);
			l.leaf(T_INTERPOLATION_PUNCTUATION, j, j + 2);
			// the interpolation body lexes in value mode and discovers its own
			// closing `}` (terminator mode); the driver's R_INTERP finalize
			// closes the interpolation and resumes this frame past it
			mac_push_window(mac, j + 2, to, false, R_INTERP, -1, 0, 125, 1);
			return false;
		} else {
			j++;
		}
	}
	if (j > to) j = to;
	l.leaf(T_STRING, chunk_start, j);
	l.close(j);
	frame.i = j;
	return true;
};

/**
 * Runs (or resumes) a window frame — the core per-token scan. `frame.type_mode`
 * switches capitalized identifiers to `type_name` (generics, type annotations).
 * Returns `true` when the window completes — fully consumed, or terminated at
 * its self-discovered `frame.term` delimiter (position recorded in
 * `frame.ret_a`) — or `false` after pushing a nested frame (interpolation,
 * generics, or type annotation), which the driver runs before resuming this
 * frame.
 */
const run_ts_window = (mac: TsMachine, frame: TsFrame): boolean => {
	const l = mac.l;
	const cache = mac.cache;
	const { text } = l;
	const to = frame.to;
	const type_mode = frame.type_mode;
	const self_type = frame.self_type;
	const level_base = frame.level_base;
	const term = frame.term;
	// only the root window stops at the machine's word
	const stop_word = frame.ret === R_ROOT ? mac.stop_word : '';
	const stop_len = stop_word.length;
	let i = frame.i;
	let prev = frame.prev;
	let prev_code = frame.prev_code; // last significant punctuation char, for string-property detection
	let class_ctx = frame.class_ctx;
	let as_ctx = frame.as_ctx;
	let import_ctx = frame.import_ctx;
	// whether the current level may hold unmatched `?`s, so that `;` and `,`
	// only reset the count when there can be one
	let ternary_seen = true;
	// the machine's level stack, kept in locals and written back before returning
	let levels = mac.levels;
	let level_sp = mac.level_sp;

	while (i < to) {
		const c = text.charCodeAt(i);
		if (is_space(c)) {
			i++;
			continue;
		}

		// identifiers (including `#private`)
		if (is_ident_start(c) || (c === 35 && i + 1 < to && is_ident_start(text.charCodeAt(i + 1)))) {
			const start = i;
			const ident_end = scan_ident(text, c === 35 ? i + 1 : i, to);
			if (
				stop_len !== 0 &&
				ident_end - start === stop_len &&
				level_sp === level_base &&
				prev !== P_DOT &&
				text.startsWith(stop_word, start)
			) {
				frame.ret_a = start;
				mac.level_sp = level_sp;
				return true;
			}
			if (self_type && frame.depth === 0 && frame.angle === 0) {
				// a name where the type is complete starts something else, unless
				// it is a word that continues a type (`extends`, `is`)
				const type_op = (WORD_INDEX.find(text, start, ident_end) & F_TYPE_OP) !== 0;
				if (!frame.expect && !type_op) {
					frame.ret_a = start;
					mac.level_sp = level_sp;
					return true;
				}
				frame.expect = type_op;
			}
			const was_class_ctx = class_ctx;
			const was_as_ctx = as_ctx;
			const was_import_ctx = import_ctx;
			const was_dot = prev === P_DOT;
			class_ctx = as_ctx = import_ctx = false;
			prev = P_VALUE;
			prev_code = 0;
			i = ident_end;
			// `import a, {…}`: a default binding before a specifier list
			if (was_import_ctx && !was_dot && text.charCodeAt(skip_space(text, ident_end, to)) === 44) {
				import_ctx = true;
			}

			const word = c === 35 ? 0 : WORD_INDEX.find(text, start, ident_end);
			const kind = was_dot ? 0 : word & KIND_MASK;

			if (was_class_ctx && kind === 0 && c !== 35) {
				// class-name chain: `Foo`, `a.b.Foo`, optionally with generics
				l.leaf(T_CLASS_NAME, start, ident_end);
				while (i + 1 < to && text.charCodeAt(i) === 46 && is_ident_start(text.charCodeAt(i + 1))) {
					l.leaf(T_PUNCTUATION, i, i + 1);
					const seg_end = scan_ident(text, i + 1, to);
					l.leaf(T_CLASS_NAME, i + 1, seg_end);
					i = seg_end;
				}
				const angle_start = skip_space(text, i, to);
				if (text.charCodeAt(angle_start) === 60) {
					const angle_end = scan_balanced_angle(text, angle_start, to, cache);
					if (angle_end !== -1) {
						frame.i = i;
						frame.prev = prev;
						frame.prev_code = prev_code;
						frame.class_ctx = class_ctx;
						frame.as_ctx = as_ctx;
						frame.import_ctx = import_ctx;
						mac.level_sp = level_sp;
						mac_push_window(
							mac,
							angle_start,
							angle_end + 1,
							true,
							R_CLASS_GENERIC,
							angle_end + 1,
							0,
							0,
							0
						);
						return false;
					}
				}
				continue;
			}

			if (was_as_ctx && kind === 0 && c !== 35 && (word & F_BUILTIN) === 0) {
				// `x as Foo` — but `as unknown`/`as string` keep their builtin type
				l.leaf(T_TYPE_ASSERTION, start, ident_end);
				if (!type_mode) {
					// what follows may continue the type: `as Foo<T>`, `as A | B`
					const tail = text.charCodeAt(skip_space(text, ident_end, to));
					if (tail === 60 || tail === 91 || tail === 124 || tail === 38) {
						frame.i = i;
						frame.prev = prev;
						frame.prev_code = prev_code;
						frame.class_ctx = false;
						frame.as_ctx = false;
						frame.import_ctx = false;
						mac.level_sp = level_sp;
						mac_push_type(mac, ident_end, to, R_TYPE_BARE, 0, false);
						return false;
					}
				}
				continue;
			}

			// keyword classification (with contextual lookaheads)
			if (kind !== 0) {
				let keyword_id = 0;
				switch (kind) {
					case K_KEYWORD:
						keyword_id = T_KEYWORD;
						break;
					case K_SPECIAL:
						keyword_id = T_SPECIAL_KEYWORD;
						break;
					case K_TS:
						keyword_id = T_KEYWORD;
						break;
					case K_ASYNC: {
						const n = text.charCodeAt(skip_space(text, ident_end, to));
						if (n === 40 || n === 42 || is_ident_start(n) || Number.isNaN(n)) {
							keyword_id = T_KEYWORD;
						}
						break;
					}
					case K_GET_SET: {
						const n = text.charCodeAt(skip_space(text, ident_end, to));
						if (n === 35 || n === 91 || is_ident_start(n) || Number.isNaN(n)) {
							keyword_id = T_KEYWORD;
						}
						break;
					}
					case K_ASSERT: {
						if (text.charCodeAt(skip_space(text, ident_end, to)) === 123) {
							keyword_id = T_KEYWORD;
						}
						break;
					}
					case K_TYPE_WORD: {
						const n = text.charCodeAt(skip_space(text, ident_end, to));
						// `import type {…}` / `export type * from …` — a type-only
						// import/export modifier, not a type-alias declaration
						if (was_import_ctx && (n === 123 || n === 42)) {
							l.leaf(T_IMPORT_TYPE_KEYWORD, start, ident_end);
							import_ctx = true;
							continue;
						}
						if (n === 123 || n === 42 || is_ident_start(n)) {
							keyword_id = T_KEYWORD;
							if (!type_mode && is_ident_start(n)) frame.flags |= FF_ALIAS;
						}
						break;
					}
					case K_TS_COND: {
						const n = text.charCodeAt(skip_space(text, ident_end, to));
						if (n === 123 || is_ident_start(n) || Number.isNaN(n)) {
							keyword_id = T_KEYWORD;
						}
						break;
					}
					case K_BOOLEAN:
						l.leaf(T_BOOLEAN, start, ident_end);
						continue;
					case K_NUMBER_WORD:
						l.leaf(T_NUMBER, start, ident_end);
						continue;
				}
				if (keyword_id !== 0) {
					l.leaf(keyword_id, start, ident_end);
					if ((word & F_CTX) !== 0) {
						if ((word & F_CLASS_CTX) !== 0) class_ctx = true;
						// `as` renames in a specifier list or after `* as`, never asserts
						if ((word & F_AS) !== 0 && !is_module_rename(text, start, levels[level_sp]!)) {
							as_ctx = true;
						}
						if ((word & F_IMPORT) !== 0) import_ctx = true;
						if ((word & F_BLOCK_INTRO) !== 0) prev_code = PC_BLOCK_INTRO;
						if ((word & F_CASE) !== 0) frame.flags |= FF_CASE;
						if ((word & F_CLASS_BODY) !== 0) frame.flags |= FF_CLASS_BODY;
					}
					if ((word & F_VALUE) === 0) prev = P_NONE;
					continue;
				}
			}

			// one shared lookahead past the identifier — the classification checks
			// below (function-variable, generic call, plain call) all probe the
			// same next-significant position
			const after_ident = skip_space(text, ident_end, to);
			const after_c = text.charCodeAt(after_ident);

			// function-valued variables: `f = () => …`, `f: async x => …`
			if (!type_mode && c !== 35 && is_function_variable(text, after_ident, to, cache)) {
				l.leaf(T_FUNCTION_VARIABLE, start, ident_end);
				continue;
			}

			// SCREAMING_CASE constants, then capitalized identifiers — both
			// classified before the call lookahead. A single uppercase letter is
			// capitalized, not a constant: it is nearly always a type parameter
			// (`x: T`, `Map<K, V>`), and most type positions lex in value mode
			if (is_upper(c)) {
				let all_caps = ident_end - start > 1;
				for (let k = start + 1; k < ident_end; k++) {
					const cc = text.charCodeAt(k);
					// `x` only after a digit (hex-ish constants like `A0x`)
					if (
						!is_upper(cc) &&
						cc !== 95 &&
						!is_digit(cc) &&
						!(cc === 120 && is_digit(text.charCodeAt(k - 1)))
					) {
						all_caps = false;
						break;
					}
				}
				if (type_mode) {
					l.leaf(T_TYPE_NAME, start, ident_end);
				} else if (all_caps) {
					l.leaf(T_CONSTANT, start, ident_end);
				} else {
					l.leaf(T_CAPITALIZED, start, ident_end);
				}
				continue;
			}

			// generic call: `foo<T>(…)`
			if (after_c === 60) {
				const angle_end = scan_balanced_angle(text, after_ident, to, cache);
				if (angle_end !== -1 && text.charCodeAt(skip_space(text, angle_end + 1, to)) === 40) {
					l.open(T_GENERIC_FUNCTION, start);
					l.leaf(T_FUNCTION, start, ident_end);
					l.open(T_GENERIC, after_ident);
					frame.i = i;
					frame.prev = prev;
					frame.prev_code = prev_code;
					frame.class_ctx = class_ctx;
					frame.as_ctx = as_ctx;
					frame.import_ctx = import_ctx;
					mac.level_sp = level_sp;
					mac_push_window(
						mac,
						after_ident,
						angle_end + 1,
						true,
						R_GENERIC_CALL,
						angle_end + 1,
						0,
						0,
						0
					);
					return false;
				}
			}

			// call: `foo(…)` (also `#private(…)`)
			if (after_c === 40) {
				l.leaf(T_FUNCTION, start, ident_end);
				continue;
			}

			if (kind === 0 && !was_dot && (word & F_BUILTIN) !== 0) {
				l.leaf(T_BUILTIN, start, ident_end);
				continue;
			}

			// plain identifier — no token
			continue;
		}

		// `/` — comment, regex literal, or division
		if (c === 47) {
			const c2 = i + 1 < to ? text.charCodeAt(i + 1) : 0;
			if (c2 === 47) {
				const line_end = scan_to_line_end(text, i, to);
				l.leaf(T_COMMENT, i, line_end);
				i = line_end;
				continue; // comments are transparent — contexts survive
			}
			if (c2 === 42) {
				const close = text.indexOf('*/', i + 2);
				const comment_end = close === -1 || close + 2 > to ? to : close + 2;
				l.leaf(T_COMMENT, i, comment_end);
				i = comment_end;
				continue;
			}
			class_ctx = as_ctx = import_ctx = false;
			if (self_type && frame.depth === 0 && frame.angle === 0) {
				frame.ret_a = i;
				mac.level_sp = level_sp;
				return true;
			}
			if (prev !== P_VALUE && prev !== P_DOT) {
				// regex literal position
				const body_end = scan_regex_body(text, i, to);
				if (body_end !== -1) {
					let flags_end = body_end + 1;
					while (flags_end < to) {
						const f = text.charCodeAt(flags_end);
						if (f >= 97 && f <= 122) flags_end++;
						else break;
					}
					l.open(T_REGEX, i);
					l.leaf(T_REGEX_DELIMITER, i, i + 1);
					l.leaf(T_REGEX_SOURCE, i + 1, body_end);
					l.leaf(T_REGEX_DELIMITER, body_end, body_end + 1);
					if (flags_end > body_end + 1) l.leaf(T_REGEX_FLAGS, body_end + 1, flags_end);
					l.close(flags_end);
					i = flags_end;
					prev = P_VALUE;
					prev_code = 0;
					continue;
				}
			}
			const op_len = scan_operator(text, i, to);
			l.leaf(T_OPERATOR, i, i + op_len);
			i += op_len;
			prev = P_NONE;
			prev_code = 0;
			continue;
		}

		// strings
		if (c === 34 || c === 39) {
			if (self_type && frame.depth === 0 && frame.angle === 0) {
				if (!frame.expect) {
					frame.ret_a = i;
					mac.level_sp = level_sp;
					return true;
				}
				frame.expect = false;
			}
			const str_end = scan_ts_string(text, i, to, c);
			// `{"key": …}` / `, "key": …` — a string property key
			let is_property = false;
			if (!type_mode && (prev_code === 123 || prev_code === 44)) {
				const after = skip_space(text, str_end, to);
				is_property = text.charCodeAt(after) === 58;
			}
			l.leaf(is_property ? T_STRING_PROPERTY : T_STRING, i, str_end);
			i = str_end;
			prev = P_VALUE;
			prev_code = 0;
			class_ctx = as_ctx = import_ctx = false;
			continue;
		}

		// template literals — interpolation-free literals (the common case)
		// complete inline; only one containing `${…}` pushes a template frame,
		// whose resume state is fully supplied by the R_TEMPLATE finalize (it
		// advances past the whole literal), so nothing here needs writing back
		if (c === 96) {
			if (self_type && frame.depth === 0 && frame.angle === 0) {
				if (!frame.expect) {
					frame.ret_a = i;
					mac.level_sp = level_sp;
					return true;
				}
				frame.expect = false;
			}
			const r = scan_ts_template_body(text, i + 1, to);
			if (r < 0) {
				l.open(T_TEMPLATE_STRING, i);
				l.leaf(T_TEMPLATE_PUNCTUATION, i, i + 1);
				mac.level_sp = level_sp;
				mac_push_template(mac, ~r, i + 1, to);
				return false;
			}
			l.open(T_TEMPLATE_STRING, i);
			l.leaf(T_TEMPLATE_PUNCTUATION, i, i + 1);
			if (r < to) {
				// closed at the backtick `r`
				l.leaf(T_STRING, i + 1, r);
				l.leaf(T_TEMPLATE_PUNCTUATION, r, r + 1);
				l.close(r + 1);
				i = r + 1;
			} else {
				// unterminated — extends to the window end
				l.leaf(T_STRING, i + 1, to);
				l.close(to);
				i = to;
			}
			prev = P_VALUE;
			prev_code = 0;
			class_ctx = as_ctx = import_ctx = false;
			continue;
		}

		// numbers (also `.5` — the scan handles a leading `.` before digits)
		if (is_digit(c) || (c === 46 && i + 1 < to && is_digit(text.charCodeAt(i + 1)))) {
			if (self_type && frame.depth === 0 && frame.angle === 0) {
				if (!frame.expect) {
					frame.ret_a = i;
					mac.level_sp = level_sp;
					return true;
				}
				frame.expect = false;
			}
			let num_end = scan_ts_number(text, i, to);
			// an embed window can end mid-number (e.g. mid-exponent); never emit past `to`
			if (num_end > to) num_end = to;
			l.leaf(T_NUMBER, i, num_end);
			i = num_end;
			prev = P_VALUE;
			prev_code = 0;
			class_ctx = as_ctx = import_ctx = false;
			continue;
		}

		// `.` — member access or spread
		if (c === 46) {
			class_ctx = as_ctx = import_ctx = false;
			if (self_type) frame.expect = true;
			if (i + 2 < to && text.charCodeAt(i + 1) === 46 && text.charCodeAt(i + 2) === 46) {
				l.leaf(T_OPERATOR, i, i + 3);
				i += 3;
				prev = P_NONE;
				prev_code = 0;
			} else {
				l.leaf(T_PUNCTUATION, i, i + 1);
				i++;
				prev = P_DOT;
				prev_code = 46;
			}
			continue;
		}

		// `@decorator`
		if (c === 64 && i + 1 < to && is_ident_start(text.charCodeAt(i + 1))) {
			const name_end = scan_ident(text, i + 1, to);
			l.open(T_DECORATOR, i);
			l.leaf(T_AT, i, i + 1);
			l.leaf(T_DECORATOR_NAME, i + 1, name_end);
			l.close(name_end);
			i = name_end;
			prev = P_NONE;
			prev_code = 0;
			class_ctx = as_ctx = import_ctx = false;
			continue;
		}

		// `:` — type annotation, or a plain operator (ternary, property, case, label)
		if (c === 58) {
			class_ctx = as_ctx = import_ctx = false;
			if (!type_mode) {
				const level = levels[level_sp]!;
				let annotation = false;
				if ((frame.flags & FF_CASE) !== 0) {
					frame.flags &= ~FF_CASE;
				} else if (level >= L_TERNARY) {
					levels[level_sp] = level - L_TERNARY;
				} else {
					const level_kind = level & L_KIND_MASK;
					annotation =
						prev_code === 41 ||
						((level_kind === L_PAREN || level_kind === L_CLASS) &&
							is_annotated_name(text, i, false)) ||
						(level_kind === L_BLOCK && is_annotated_name(text, i, true));
				}
				if (annotation) {
					const type_start = skip_space(text, i + 1, to);
					const t = text.charCodeAt(type_start);
					// a type has to follow
					if (
						type_start < to &&
						t !== 44 &&
						t !== 59 &&
						t !== 41 &&
						t !== 93 &&
						t !== 125 &&
						t !== 61 &&
						t !== 58
					) {
						l.open(T_TYPE_ANNOTATION, i);
						l.leaf(T_OPERATOR, i, i + 1);
						l.open(T_TYPE, type_start);
						// a type that is one name and then its end (`x: T,`, `): void {`)
						// needs no window: the name is the only token one would emit
						if (is_ident_start(t)) {
							const name_end = scan_ident(text, type_start, to);
							const after = text.charCodeAt(skip_space(text, name_end, to));
							const word = WORD_INDEX.find(text, type_start, name_end);
							const word_kind = word & KIND_MASK;
							if (
								(after === 44 ||
									after === 41 ||
									after === 59 ||
									after === 61 ||
									after === 123 ||
									after === 125 ||
									after === 93) &&
								(word_kind === 0 || word_kind === K_KEYWORD)
							) {
								if (word_kind !== 0) l.leaf(T_KEYWORD, type_start, name_end);
								else if (is_upper(t)) l.leaf(T_TYPE_NAME, type_start, name_end);
								else if ((word & F_BUILTIN) !== 0) l.leaf(T_BUILTIN, type_start, name_end);
								l.close(name_end);
								l.close(name_end);
								i = name_end;
								prev = P_VALUE;
								prev_code = 0;
								continue;
							}
						}
						frame.i = i;
						frame.prev = prev;
						frame.prev_code = prev_code;
						frame.class_ctx = false;
						frame.as_ctx = false;
						frame.import_ctx = false;
						mac.level_sp = level_sp;
						mac_push_type(mac, type_start, to, R_TYPE_ANNO, type_start, true);
						return false;
					}
				}
			} else if (self_type && frame.depth === 0 && frame.angle === 0) {
				// the `:` of a conditional type, or the end of the type
				if (frame.cond === 0) {
					frame.ret_a = i;
					mac.level_sp = level_sp;
					return true;
				}
				frame.cond--;
				frame.expect = true;
			}
			l.leaf(T_OPERATOR, i, i + 1);
			i++;
			prev = P_NONE;
			prev_code = 0;
			continue;
		}

		// punctuation
		if (
			c === 123 ||
			c === 125 ||
			c === 91 ||
			c === 93 ||
			c === 40 ||
			c === 41 ||
			c === 59 ||
			c === 44
		) {
			// self-discovery: a `}` at depth 0 ends the window (the driver's
			// finalize emits it); nested braces keep the depth counter honest —
			// braces inside strings/comments/regexes/child frames never reach here
			if (c === term && --frame.depth === 0) {
				frame.ret_a = i;
				mac.level_sp = level_sp;
				return true;
			}
			if (c === 123 && term !== 0) frame.depth++;
			if (!type_mode) {
				if (c === 123 || c === 40 || c === 91) {
					// a bracket opens a level; a `{` is an object literal where a
					// value is expected, else a block or a class body
					let level_kind = c === 40 ? L_PAREN : L_ARRAY;
					if (c === 123) {
						if ((frame.flags & FF_CLASS_BODY) !== 0) {
							level_kind = L_CLASS;
						} else if (import_ctx) {
							level_kind = L_MODULE;
						} else if (
							prev === P_NONE &&
							prev_code !== 59 &&
							prev_code !== 123 &&
							prev_code !== 125 &&
							prev_code !== PC_BLOCK_INTRO
						) {
							level_kind = L_OBJECT;
						} else {
							level_kind = L_BLOCK;
						}
						frame.flags = 0;
					}
					level_sp++;
					if (level_sp === levels.length) {
						const next = new Int32Array(level_sp * 2);
						next.set(levels);
						mac.levels = levels = next;
					}
					levels[level_sp] = level_kind;
				} else if (c === 59 || c === 44) {
					// a statement or list item ends: its unmatched `?`s don't carry
					if (ternary_seen) {
						levels[level_sp]! &= L_KIND_MASK;
						ternary_seen = false;
					}
					if (c === 59) frame.flags = 0;
				} else if (level_sp > level_base) {
					level_sp--;
					ternary_seen = true;
				}
			} else if (self_type) {
				const top = frame.depth === 0;
				if (c === 123 || c === 40 || c === 91) {
					// a `{` or `(` where the type is complete is a body or a call
					if (top && frame.angle === 0 && c !== 91 && !frame.expect) {
						frame.ret_a = i;
						mac.level_sp = level_sp;
						return true;
					}
					if (top && c === 40) {
						let before = i - 1;
						while (before >= 0 && is_space(text.charCodeAt(before))) before--;
						const b = text.charCodeAt(before);
						// nor can one that starts with a `(`: that is a grouped type
						frame.params =
							b !== 124 && b !== 38 && text.charCodeAt(skip_space(text, i + 1, to)) !== 40;
					}
					frame.depth++;
				} else if (c === 59 || c === 44) {
					// `;` also ends a type left open at a `<`
					if (top && (c === 59 || frame.angle === 0)) {
						frame.ret_a = i;
						mac.level_sp = level_sp;
						return true;
					}
				} else {
					if (top) {
						frame.ret_a = i;
						mac.level_sp = level_sp;
						return true;
					}
					if (--frame.depth === 0 && frame.angle === 0) frame.expect = false;
				}
			}
			l.leaf(T_PUNCTUATION, i, i + 1);
			prev = c === 41 || c === 93 ? P_VALUE : P_NONE;
			prev_code = c;
			i++;
			// `import a, {…}`: the default binding's comma keeps the import context
			import_ctx = c === 44 && import_ctx;
			class_ctx = as_ctx = false;
			continue;
		}

		// operators
		if (
			c === 43 ||
			c === 45 ||
			c === 42 ||
			c === 37 ||
			c === 38 ||
			c === 124 ||
			c === 94 ||
			c === 61 ||
			c === 33 ||
			c === 60 ||
			c === 62 ||
			c === 63 ||
			c === 126
		) {
			const op_len = scan_operator(text, i, to);
			let next_code = 0;
			if (!type_mode) {
				if (c === 63) {
					// a ternary's `?` waits for its `:` — not `a?: T`, `(a?)`, `a?.b`, `a ?? b`
					if (op_len === 1) {
						const n = text.charCodeAt(i + 1);
						if (n !== 58 && n !== 41 && n !== 44) {
							levels[level_sp]! += L_TERNARY;
							ternary_seen = true;
						}
					}
				} else if (c === 61) {
					if (op_len === 2 && text.charCodeAt(i + 1) === 62) {
						next_code = PC_BLOCK_INTRO; // `=> {` is a body
					} else if (op_len === 1 && (frame.flags & FF_ALIAS) !== 0) {
						// `type A = …` — the alias's type
						frame.flags &= ~FF_ALIAS;
						l.leaf(T_OPERATOR, i, i + 1);
						frame.i = i;
						frame.prev = prev;
						frame.prev_code = prev_code;
						frame.class_ctx = false;
						frame.as_ctx = false;
						frame.import_ctx = false;
						mac.level_sp = level_sp;
						mac_push_type(mac, i + 1, to, R_TYPE_BARE, 0, true);
						return false;
					}
				}
			} else if (self_type && frame.depth === 0) {
				if (c === 60 && op_len === 1) {
					frame.angle++;
				} else if (c === 62 && text.charCodeAt(i + op_len - 1) === 62) {
					// `>`, `>>`, `>>>` close that many
					if (frame.angle < op_len) {
						frame.ret_a = i;
						mac.level_sp = level_sp;
						return true;
					}
					frame.angle -= op_len;
					if (frame.angle === 0) frame.expect = false;
				} else if (frame.angle === 0) {
					const is_arrow = c === 61 && op_len === 2 && text.charCodeAt(i + 1) === 62;
					if (
						is_arrow ? prev_code === 41 && frame.params : op_len === 1 && (c === 124 || c === 38)
					) {
						// a function type's `=>`, a union, an intersection
						frame.expect = true;
					} else if (op_len === 1 && c === 63 && !frame.expect) {
						frame.cond++; // a conditional type
						frame.expect = true;
					} else if (!(frame.expect && c === 45 && op_len === 1)) {
						// anything but a negative literal's `-` is not part of a type
						frame.ret_a = i;
						mac.level_sp = level_sp;
						return true;
					}
				}
			}
			l.leaf(T_OPERATOR, i, i + op_len);
			// `?.` is member access — the next word is a property, not a keyword
			prev = c === 63 && op_len === 2 && text.charCodeAt(i + 1) === 46 ? P_DOT : P_NONE;
			i += op_len;
			prev_code = next_code;
			class_ctx = as_ctx = import_ctx = false;
			continue;
		}

		// anything else is plain text
		i++;
		prev = P_NONE;
		prev_code = 0;
		class_ctx = as_ctx = import_ctx = false;
	}
	mac.level_sp = level_sp;
	return true;
};

/**
 * Scans a regex literal body from the `/` at `i`, returning the index of the
 * closing `/`, or -1 when this isn't a regex literal. Handles character
 * classes and escapes; regex literals never span lines.
 */
const scan_regex_body = (text: string, i: number, to: number): number => {
	let j = i + 1;
	let in_class = false;
	let any = false;
	while (j < to) {
		const c = text.charCodeAt(j);
		if (c === 92) {
			j += 2;
			any = true;
		} else if (c === 10 || c === 13) {
			return -1;
		} else if (in_class) {
			if (c === 93) in_class = false;
			j++;
		} else if (c === 91) {
			in_class = true;
			any = true;
			j++;
		} else if (c === 47) {
			return any ? j : -1; // empty body means `//` (handled as comment anyway)
		} else {
			any = true;
			j++;
		}
	}
	return -1;
};

/**
 * Drives the explicit frame stack to completion: runs the top frame, and when
 * it finishes, pops it and finalizes it into the frame beneath — emitting the
 * container's closing events and advancing that frame past the consumed region.
 * A frame that pushes a child returns `false`, so the child runs next and this
 * frame resumes only once the child (and its own descendants) have completed.
 */
const run_ts = (mac: TsMachine): void => {
	const l = mac.l;
	while (mac.sp > 0) {
		const frame = mac.stack[mac.sp - 1]!;
		const done = frame.kind === F_WINDOW ? run_ts_window(mac, frame) : run_ts_template(mac, frame);
		if (!done) continue; // a child frame was pushed — run it before resuming
		mac.sp -= 1;
		if (frame.kind === F_WINDOW) mac.level_sp = frame.level_base - 1;
		const ret = frame.ret;
		if (ret === R_ROOT) continue;
		const parent = mac.stack[mac.sp - 1]!;
		switch (ret) {
			case R_INTERP: {
				// the discovered `}` position, or -1 when the interpolation ran
				// unterminated to the window end (which is the template's end)
				const close = frame.ret_a;
				if (close === -1) {
					const template_end = frame.to;
					l.close(template_end);
					parent.i = template_end;
					parent.chunk_start = template_end;
				} else {
					l.leaf(T_INTERPOLATION_PUNCTUATION, close, close + 1);
					l.close(close + 1);
					parent.i = close + 1;
					parent.chunk_start = close + 1;
				}
				break;
			}
			case R_CLASS_GENERIC:
				parent.i = frame.ret_a;
				break;
			case R_GENERIC_CALL:
				l.close(frame.ret_a); // close T_GENERIC
				l.close(frame.ret_a); // close T_GENERIC_FUNCTION
				parent.i = frame.ret_a;
				break;
			case R_TYPE_ANNO: {
				// the type's text, trimmed, but never to before its last token: a
				// comment can itself end in whitespace
				const type_end = frame.ret_a < frame.to ? frame.ret_a : frame.to;
				const trimmed = trim_space_end(l.text, frame.ret_b, type_end);
				const last_end = l.events[l.events_len - 1]!;
				const content_end = last_end > trimmed ? last_end : trimmed;
				l.close(content_end); // close T_TYPE
				l.close(content_end); // close T_TYPE_ANNOTATION
				parent.i = type_end;
				parent.prev = P_VALUE;
				parent.prev_code = 0;
				break;
			}
			case R_TYPE_BARE:
				parent.i = frame.ret_a < frame.to ? frame.ret_a : frame.to;
				parent.prev = P_VALUE;
				parent.prev_code = 0;
				break;
			case R_TEMPLATE:
				parent.i = frame.i;
				parent.prev = P_VALUE;
				parent.prev_code = 0;
				parent.class_ctx = false;
				parent.as_ctx = false;
				parent.import_ctx = false;
				break;
		}
	}
};

// machines kept between calls, frames and all, so each embedded region (a Svelte
// expression, a Markdown fence) doesn't build one; a stack, since embeds nest
const ts_machines: Array<TsMachine> = [];

/**
 * Lexes `[from, l.end)` as the root window. A nonzero `term` makes it stop at
 * the `term` char that closes none of its own openers, and a `stop_word`
 * before that word outside every bracket; the return value is the index it
 * stopped at. Otherwise, and when the window runs to its end, `-1`.
 */
const lex_ts_root = (l: Lexer, from: number, term: number, stop_word: string): number => {
	const mac = ts_machines.pop() ?? {
		l,
		cache: create_ts_scan_cache(),
		levels: new Int32Array(64),
		level_sp: -1,
		stop_word: '',
		stack: [],
		sp: 0
	};
	mac.l = l;
	mac.sp = 0;
	mac.level_sp = -1;
	mac.stop_word = stop_word;
	const { cache } = mac;
	cache.next_gt = cache.next_rparen = -1;
	mac_push_window(mac, from, l.end, false, R_ROOT, -1, 0, term, term === 0 ? 0 : 1);
	run_ts(mac);
	const close = mac.stack[0]!.ret_a;
	// let go of the lexer and its text before pooling
	mac.l = Lexer.shape_anchor;
	ts_machines.push(mac);
	return close;
};

const lex_ts = (l: Lexer): void => {
	let i = l.pos;
	// hashbang at the very start of the document
	if (i === 0 && l.text.charCodeAt(0) === 35 && l.text.charCodeAt(1) === 33) {
		const line_end = scan_to_line_end(l.text, 0, l.end);
		l.leaf(T_HASHBANG, 0, line_end);
		i = line_end;
	}
	lex_ts_root(l, i, 0, '');
	l.pos = l.end;
};

// the root window in terminator mode, as a template's `${…}` body runs
const lex_ts_to_brace = (l: Lexer, stop_word = ''): number => {
	const close = lex_ts_root(l, l.pos, 125, stop_word);
	l.pos = close === -1 ? l.end : close;
	return close;
};

/**
 * The TypeScript language registration for the lexer engine.
 *
 * JavaScript reuses this lexer via the `js`/`javascript` aliases: TypeScript is
 * a syntactic superset, and the TS-only constructs the lexer recognizes (type
 * annotations, `as`, generics before a call) can't appear in valid JS, so
 * running the full TS lexer on JS is a no-op for those paths. There is no
 * separate JS lexer.
 */
export const lexer_ts: SyntaxLang = {
	id: 'ts',
	aliases: ['typescript', 'js', 'javascript'],
	lex: lex_ts,
	lex_to_brace: lex_ts_to_brace
};
