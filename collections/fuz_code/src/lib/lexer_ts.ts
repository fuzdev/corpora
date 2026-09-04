import {
	advance_probe,
	is_digit,
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
	type Lexer,
	type SyntaxLang
} from './lexer.ts';

/**
 * Hand-written TypeScript/JavaScript lexer.
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
const T_COLON = token_type(':');
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

// keywords that put the lexer in a class-name context for the next identifier
const CLASS_CTX_WORDS: Set<string> = new Set([
	'class',
	'extends',
	'implements',
	'instanceof',
	'interface',
	'new',
	'type'
]);
// keywords after which the next identifier is a type assertion
const AS_WORDS: Set<string> = new Set(['as', 'satisfies']);
const IMPORT_WORDS: Set<string> = new Set(['import', 'export']);
// value-like keywords — division follows, not a regex literal
const VALUE_WORDS: Set<string> = new Set(['this', 'super', 'null', 'undefined']);

// lowercase-only builtins are reachable — capitalized ones are claimed by
// `capitalized_identifier` first in the classification order
const BUILTIN_WORDS: Set<string> = new Set([
	'Array',
	'Function',
	'Promise',
	'any',
	'boolean',
	'console',
	'never',
	'number',
	'string',
	'symbol',
	'unknown'
]);

// previous-significant-token categories, for regex-vs-division and contexts
const P_NONE = 0; // start / after operator, `{`, `(`, `[`, `,`, `;` — regex allowed
const P_VALUE = 1; // after a value — `/` is division
const P_DOT = 2; // after `.` member access — next word is a property, not a keyword

// bounded lookahead for heuristic scans (generics, annotations, arrow params)
const MAX_SCAN = 600;

/**
 * Monotonic next-occurrence caches for the heuristic-scan prechecks. Each
 * bounded scan can only succeed if its success char (`=` for type
 * annotations, `>` for generics, `)` for arrow params) occurs within its
 * `MAX_SCAN` window, so a cached native `indexOf` probe skips scans that
 * cannot succeed. The caches advance monotonically through the document, so
 * total probe work is O(n) — this is what keeps colon/angle/paren-dense
 * pathological inputs linear instead of paying `MAX_SCAN` per occurrence.
 */
interface TsScanCache {
	next_eq: number;
	next_gt: number;
	next_rparen: number;
}

const create_ts_scan_cache = (): TsScanCache => ({
	next_eq: -1,
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

/**
 * Scans a numeric literal from `i` (at a digit, or `.` before a digit),
 * returning the exclusive end. Handles hex/binary/octal, `_` separators,
 * exponents, and bigint `n` suffixes.
 *
 * The per-call closures are a measured exception to the top-level-functions
 * rule: V8 inlines them into specialized loops inside this function, and
 * hoisted top-level variants (both a param'd helper and a decimal-specialized
 * one) run ~1.2x slower on number-dense input.
 */
const scan_ts_number = (text: string, i: number, end: number): number => {
	const scan_digits = (from: number, is_wanted: (c: number) => boolean): number => {
		let j = from;
		while (j < end) {
			const c = text.charCodeAt(j);
			if (is_wanted(c) || (c === 95 && is_wanted(text.charCodeAt(j + 1)))) j++;
			else break;
		}
		return j;
	};
	const is_hex = (c: number): boolean =>
		(c >= 48 && c <= 57) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);
	const is_binary = (c: number): boolean => c === 48 || c === 49;
	const is_octal = (c: number): boolean => c >= 48 && c <= 55;

	if (text.charCodeAt(i) === 48) {
		const c2 = text.charCodeAt(i + 1);
		if (c2 === 120 || c2 === 88) {
			let j = scan_digits(i + 2, is_hex);
			if (text.charCodeAt(j) === 110) j++; // n
			return j;
		}
		if (c2 === 98 || c2 === 66) {
			let j = scan_digits(i + 2, is_binary);
			if (text.charCodeAt(j) === 110) j++;
			return j;
		}
		if (c2 === 111 || c2 === 79) {
			let j = scan_digits(i + 2, is_octal);
			if (text.charCodeAt(j) === 110) j++;
			return j;
		}
	}
	let j = scan_digits(i, is_digit);
	let is_integer = true;
	if (text.charCodeAt(j) === 46 && is_digit(text.charCodeAt(j + 1))) {
		is_integer = false;
		j = scan_digits(j + 1, is_digit);
	}
	const e = text.charCodeAt(j);
	if (e === 101 || e === 69) {
		let k = j + 1;
		const sign = text.charCodeAt(k);
		if (sign === 43 || sign === 45) k++;
		if (is_digit(text.charCodeAt(k))) {
			j = scan_digits(k, is_digit);
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
 * Heuristic for `: type =` annotations: from the `:` at `i`, scans over a type
 * expression with balanced `<>`/`[]`/`{}`/`()`, succeeding at a top-level `=`
 * (not `==`/`=>`). Returns the exclusive end of the type text, or -1.
 */
const scan_type_annotation = (text: string, i: number, end: number, cache: TsScanCache): number => {
	const limit = i + MAX_SCAN < end ? i + MAX_SCAN : end;
	// success needs a top-level `=` within the window — skip the scan when
	// there is no `=` at all
	cache.next_eq = advance_probe(text, cache.next_eq, i + 1, '=');
	if (cache.next_eq >= limit) return -1;
	let angle = 0;
	let square = 0;
	let j = i + 1;
	while (j < limit) {
		const c = text.charCodeAt(j);
		if (c === 61) {
			// `=`
			if (angle === 0 && square === 0) {
				const c2 = text.charCodeAt(j + 1);
				if (c2 === 61 || c2 === 62) return -1;
				const c0 = text.charCodeAt(j - 1);
				if (c0 === 33 || c0 === 60 || c0 === 62) return -1; // != <= >=
				return j;
			}
			j++;
		} else if (c === 60) {
			angle++;
			j++;
		} else if (c === 62) {
			if (angle === 0) return -1;
			angle--;
			j++;
		} else if (c === 91) {
			square++;
			j++;
		} else if (c === 93) {
			if (square === 0) return -1;
			square--;
			j++;
		} else if (
			angle === 0 &&
			square === 0 &&
			(c === 59 || c === 44 || c === 123 || c === 125 || c === 40 || c === 41)
		) {
			// top-level statement/grouping chars end the candidate type text —
			// object/function types are not annotation targets here, which keeps
			// the scan from running away across statement boundaries
			return -1;
		} else if (c === 34 || c === 39) {
			j = skip_quoted(text, j, end, c);
		} else {
			j++;
		}
	}
	return -1;
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
const R_TYPE_ANNO = 4; // `: type =` body → close the type, advance past it
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
}

interface TsMachine {
	l: Lexer;
	cache: TsScanCache;
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
	ret_b: 0
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
	mac.sp = sp + 1;
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
	const term = frame.term;
	let i = frame.i;
	let prev = frame.prev;
	let prev_code = frame.prev_code; // last significant punctuation char, for string-property detection
	let class_ctx = frame.class_ctx;
	let as_ctx = frame.as_ctx;
	let import_ctx = frame.import_ctx;

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
			const was_class_ctx = class_ctx;
			const was_as_ctx = as_ctx;
			const was_import_ctx = import_ctx;
			const was_dot = prev === P_DOT;
			class_ctx = as_ctx = import_ctx = false;
			prev = P_VALUE;
			prev_code = 0;
			i = ident_end;

			const word = text.slice(start, ident_end);
			const kind = c === 35 || was_dot ? undefined : WORDS.get(word);

			if (was_class_ctx && kind === undefined && c !== 35) {
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

			if (was_as_ctx && kind === undefined && c !== 35 && !BUILTIN_WORDS.has(word)) {
				// `x as Foo` — but `as unknown`/`as string` keep their builtin type
				l.leaf(T_TYPE_ASSERTION, start, ident_end);
				continue;
			}

			// keyword classification (with contextual lookaheads)
			if (kind !== undefined) {
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
							continue;
						}
						if (n === 123 || n === 42 || is_ident_start(n)) {
							keyword_id = T_KEYWORD;
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
					if (CLASS_CTX_WORDS.has(word)) class_ctx = true;
					if (AS_WORDS.has(word)) as_ctx = true;
					if (IMPORT_WORDS.has(word)) import_ctx = true;
					if (!VALUE_WORDS.has(word)) prev = P_NONE;
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
			// classified before the call lookahead
			if (is_upper(c)) {
				let all_caps = true;
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

			if (kind === undefined && !was_dot && c !== 35 && BUILTIN_WORDS.has(word)) {
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
			const r = scan_ts_template_body(text, i + 1, to);
			if (r < 0) {
				l.open(T_TEMPLATE_STRING, i);
				l.leaf(T_TEMPLATE_PUNCTUATION, i, i + 1);
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

		// `:` — type annotation (with initializer) or plain operator
		if (c === 58) {
			class_ctx = as_ctx = import_ctx = false;
			if (!type_mode) {
				const type_end = scan_type_annotation(text, i, to, cache);
				if (type_end !== -1) {
					const type_start = skip_space(text, i + 1, to);
					const content_end = trim_space_end(text, type_start, type_end);
					if (content_end > type_start) {
						l.open(T_TYPE_ANNOTATION, i);
						l.leaf(T_COLON, i, i + 1);
						l.open(T_TYPE, type_start);
						frame.i = i;
						frame.prev = prev;
						frame.prev_code = prev_code;
						frame.class_ctx = false;
						frame.as_ctx = false;
						frame.import_ctx = false;
						mac_push_window(
							mac,
							type_start,
							content_end,
							true,
							R_TYPE_ANNO,
							type_end,
							content_end,
							0,
							0
						);
						return false;
					}
				}
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
				return true;
			}
			if (c === 123 && term !== 0) frame.depth++;
			l.leaf(T_PUNCTUATION, i, i + 1);
			prev = c === 41 || c === 93 ? P_VALUE : P_NONE;
			prev_code = c;
			i++;
			class_ctx = as_ctx = import_ctx = false;
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
			l.leaf(T_OPERATOR, i, i + op_len);
			// `?.` is member access — the next word is a property, not a keyword
			prev = c === 63 && op_len === 2 && text.charCodeAt(i + 1) === 46 ? P_DOT : P_NONE;
			i += op_len;
			prev_code = 0;
			class_ctx = as_ctx = import_ctx = false;
			continue;
		}

		// anything else is plain text
		i++;
		prev = P_NONE;
		prev_code = 0;
		class_ctx = as_ctx = import_ctx = false;
	}
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
			case R_TYPE_ANNO:
				l.close(frame.ret_b); // close T_TYPE
				l.close(frame.ret_b); // close T_TYPE_ANNOTATION
				parent.i = frame.ret_a;
				parent.prev = P_NONE;
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

const lex_ts = (l: Lexer): void => {
	let i = l.pos;
	// hashbang at the very start of the document
	if (i === 0 && l.text.charCodeAt(0) === 35 && l.text.charCodeAt(1) === 33) {
		const line_end = scan_to_line_end(l.text, 0, l.end);
		l.leaf(T_HASHBANG, 0, line_end);
		i = line_end;
	}
	const mac: TsMachine = { l, cache: create_ts_scan_cache(), stack: [], sp: 0 };
	mac_push_window(mac, i, l.end, false, R_ROOT, 0, 0, 0, 0);
	run_ts(mac);
	l.pos = l.end;
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
	lex: lex_ts
};
