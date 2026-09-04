/**
 * Flat-event lexer substrate — the engine beneath the hand-written per-language
 * lexers (`lexer_json.ts`, `lexer_ts.ts`, …).
 *
 * Tokens are emitted as variable-length records into one `Int32Array`:
 *
 * - leaf:  `[type_id, start, end]` where `type_id > 0`
 * - open:  `[-type_id, start]` — opens a container token
 * - close: `[0, end]` — closes the innermost open container
 *
 * Untyped text is implicit — it's the gap between events, recovered from
 * offsets. Adjacent same-type leaves are coalesced at emit time so runs like
 * `});` become one span.
 *
 * @module
 */

/**
 * Interned metadata for a token type.
 */
export interface TokenTypeInfo {
	id: number;
	name: string;
	aliases: Array<string>;
	/**
	 * Space-separated CSS classes, e.g. `'token_null token_keyword'`.
	 */
	classes: string;
	/**
	 * Precomputed HTML open tag, e.g. `'<span class="token_null token_keyword">'`.
	 */
	open_tag: string;
}

/**
 * An id space of interned token types with precomputed CSS classes and HTML
 * open tags. Ids are only meaningful against the registry that interned them —
 * a lexed event stream resolves back through the registry stamped on its
 * `LexedSyntax`.
 */
export class TokenTypeRegistry {
	/**
	 * Interned infos indexed by id. Hot loops hoist and index this directly;
	 * grow it only via `intern`.
	 */
	readonly infos: Array<TokenTypeInfo> = [
		// id 0 is reserved — it's the close-event tag
		{ id: 0, name: '', aliases: [], classes: '', open_tag: '' }
	];
	#ids: Map<string, number> = new Map();

	/**
	 * Interns a token type by name (+ optional aliases) and returns its id.
	 * Repeated calls with the same name and aliases return the same id. The CSS
	 * class list and HTML open tag are precomputed here so emitters never build
	 * class strings at runtime.
	 */
	intern(name: string, alias?: string | Array<string>): number {
		const aliases = alias === undefined ? [] : Array.isArray(alias) ? alias : [alias];
		const key = name + '\x1F' + aliases.join('\x1F');
		const existing = this.#ids.get(key);
		if (existing !== undefined) return existing;
		let classes = 'token_' + name;
		for (const a of aliases) classes += ' token_' + a;
		const id = this.infos.length;
		this.infos.push({ id, name, aliases, classes, open_tag: '<span class="' + classes + '">' });
		this.#ids.set(key, id);
		return id;
	}

	/**
	 * Looks up the interned info for a token type id.
	 */
	info(id: number): TokenTypeInfo {
		return this.infos[id]!;
	}
}

/**
 * The shared default registry — the single id space used by the built-in
 * lexers' module-load `token_type` constants and by any `SyntaxStyler` not
 * given its own registry. The type vocabulary is global by design, mirroring
 * the global `.token_*` CSS namespace; per-registry isolation exists for
 * fully-custom stylers and tests, whose lexers must intern into the same
 * registry they're rendered against.
 */
export const token_types_global: TokenTypeRegistry = new TokenTypeRegistry();

/**
 * Interns a token type into `token_types_global` — the zero-config authoring
 * path used by the built-in lexers' module-load type constants.
 */
export const token_type = (name: string, alias?: string | Array<string>): number =>
	token_types_global.intern(name, alias);

/**
 * Builds a word→kind classification map from `[kind, words]` entries, where
 * `words` is space-separated — the shared shape of the lexers' keyword tables.
 */
export const words_map = (
	...entries: Array<[kind: number, words: string]>
): Map<string, number> => {
	const map: Map<string, number> = new Map();
	for (const [kind, words] of entries) {
		for (const word of words.split(' ')) map.set(word, kind);
	}
	return map;
};

/**
 * A lexer-based language registration.
 */
export interface SyntaxLang {
	/**
	 * Primary language id, e.g. `'ts'`.
	 */
	id: string;
	/**
	 * Alternate ids resolving to this language, e.g. `['typescript']`.
	 */
	aliases?: Array<string>;
	/**
	 * Lexes the `lexer`'s current `[pos, end)` window, emitting token events.
	 * Must never throw and must always terminate with `lexer.pos === lexer.end`.
	 */
	lex: (lexer: Lexer) => void;
}

/**
 * The result of lexing: the source text plus its flat token event stream.
 */
export interface LexedSyntax {
	text: string;
	events: Int32Array;
	events_len: number;
	/**
	 * The registry that interned the type ids in `events` — consumers resolve
	 * ids through it, so a stream can never be rendered against the wrong
	 * id space.
	 */
	types: TokenTypeRegistry;
}

/**
 * Bounds cross-language `embed` nesting. Embedding runs on the JS call stack
 * (each level re-enters a lexer's `lex`), and the registry graph has a cycle —
 * markdown fences can embed markdown — so without a bound an adversarial
 * cascade of a few thousand unterminated `` ```md `` fences overflows the
 * stack. Past the cap the embedded region stays plain text, the same fallback
 * as an unregistered language; real content nests 2–3 levels deep. The cap is
 * also a linearity guarantee: each fence level rescans its window for a
 * closing fence, so uncapped cascades would be quadratic in document size.
 */
const MAX_EMBED_DEPTH = 64;

/**
 * Shared lexing context passed to language lex functions. Holds the text
 * window, the event buffer, and the language registry for embedding.
 */
export class Lexer {
	text = '';
	pos = 0;
	end = 0;
	/**
	 * Language registry for `embed` — set by `lex_syntax`.
	 */
	langs: Map<string, SyntaxLang> | null = null;

	events: Int32Array;
	events_len = 0;

	// index of the previous event iff it was a leaf, for adjacency coalescing
	#last_leaf = -1;

	// current embed nesting, guarded by MAX_EMBED_DEPTH
	#embed_depth = 0;

	constructor(capacity = 256) {
		this.events = new Int32Array(capacity < 256 ? 256 : capacity);
	}

	// cold path of the emitters' capacity checks — kept out of line so the
	// hot check inlines into `leaf`/`open`/`close`
	#grow(): void {
		const next = new Int32Array(this.events.length * 2);
		next.set(this.events);
		this.events = next;
	}

	/**
	 * Emits a leaf token. Empty spans are dropped; a leaf adjacent to a
	 * preceding leaf of the same type extends it instead (span coalescing).
	 */
	leaf(type_id: number, start: number, end: number): void {
		if (start >= end) return;
		const i = this.#last_leaf;
		const { events } = this;
		if (i !== -1 && events[i] === type_id && events[i + 2] === start) {
			events[i + 2] = end;
			return;
		}
		if (this.events_len + 3 > this.events.length) this.#grow();
		const at = this.events_len;
		this.events[at] = type_id;
		this.events[at + 1] = start;
		this.events[at + 2] = end;
		this.events_len = at + 3;
		this.#last_leaf = at;
	}

	/**
	 * Opens a container token at `start`. Must be balanced by a later `close`.
	 */
	open(type_id: number, start: number): void {
		if (this.events_len + 2 > this.events.length) this.#grow();
		const at = this.events_len;
		this.events[at] = -type_id;
		this.events[at + 1] = start;
		this.events_len = at + 2;
		this.#last_leaf = -1;
	}

	/**
	 * Closes the innermost open container at `end`.
	 */
	close(end: number): void {
		if (this.events_len + 2 > this.events.length) this.#grow();
		const at = this.events_len;
		this.events[at] = 0;
		this.events[at + 1] = end;
		this.events_len = at + 2;
		this.#last_leaf = -1;
	}

	/**
	 * Lexes `[start, end)` with the language registered as `lang_id`,
	 * restoring this lexer's window afterward. Returns `false` (leaving the
	 * region as plain text) when the language isn't registered or embedding
	 * is nested past `MAX_EMBED_DEPTH`.
	 */
	embed(lang_id: string, start: number, end: number): boolean {
		if (start >= end) return false;
		if (this.#embed_depth >= MAX_EMBED_DEPTH) return false;
		const lang = this.langs?.get(lang_id);
		if (!lang) return false;
		const prev_pos = this.pos;
		const prev_end = this.end;
		this.pos = start;
		this.end = end;
		// reset coalescing state so the guest's first leaf can't merge with a
		// leaf the host emitted just before the embedded region
		this.#last_leaf = -1;
		this.#embed_depth++;
		lang.lex(this);
		this.#embed_depth--;
		this.pos = prev_pos;
		this.end = prev_end;
		this.#last_leaf = -1;
		return true;
	}
}

/**
 * Lexes `text` with `lang`, returning the flat token event stream.
 *
 * @param langs - registry used to resolve embedded languages by id
 * @param types - token-type registry stamped on the result; must be the one
 *   `lang` (and any embedded language) interned its type ids into
 */
export const lex_syntax = (
	text: string,
	lang: SyntaxLang,
	langs?: Map<string, SyntaxLang>,
	types: TokenTypeRegistry = token_types_global
): LexedSyntax => {
	// capacity heuristic: dense token streams run ~1 int per source char
	const lexer = new Lexer(text.length);
	lexer.text = text;
	lexer.pos = 0;
	lexer.end = text.length;
	lexer.langs = langs ?? null;
	lang.lex(lexer);
	return { text, events: lexer.events, events_len: lexer.events_len, types };
};

/**
 * Escapes `text[from..to)` for HTML text content in a single pass.
 * Only `&`, `<`, and non-breaking spaces need handling (nbsp normalizes to a
 * regular space).
 */
const escape_html_slice = (text: string, from: number, to: number): string => {
	let out = '';
	let seg = from;
	for (let i = from; i < to; i++) {
		const c = text.charCodeAt(i);
		if (c === 38) {
			out += text.slice(seg, i) + '&amp;';
			seg = i + 1;
		} else if (c === 60) {
			out += text.slice(seg, i) + '&lt;';
			seg = i + 1;
		} else if (c === 160) {
			out += text.slice(seg, i) + ' ';
			seg = i + 1;
		}
	}
	return seg === from ? text.slice(from, to) : out + text.slice(seg, to);
};

/**
 * Renders a lexed token event stream to HTML in one forward pass.
 * Gap text is copy-escaped; token spans use the precomputed open tags.
 */
export const render_syntax_html = (lexed: LexedSyntax): string => {
	const { text, events, events_len } = lexed;
	const { infos } = lexed.types;
	let out = '';
	let pos = 0;
	let i = 0;
	while (i < events_len) {
		const tag = events[i]!;
		if (tag > 0) {
			const start = events[i + 1]!;
			const end = events[i + 2]!;
			if (start > pos) out += escape_html_slice(text, pos, start);
			out += infos[tag]!.open_tag + escape_html_slice(text, start, end) + '</span>';
			pos = end;
			i += 3;
		} else if (tag < 0) {
			const start = events[i + 1]!;
			if (start > pos) out += escape_html_slice(text, pos, start);
			out += infos[-tag]!.open_tag;
			pos = start;
			i += 2;
		} else {
			const end = events[i + 1]!;
			if (end > pos) out += escape_html_slice(text, pos, end);
			out += '</span>';
			pos = end;
			i += 2;
		}
	}
	if (pos < text.length) out += escape_html_slice(text, pos, text.length);
	return out;
};

/**
 * A flattened token span, in document order with containers before their
 * children. Used by fixtures, tests, and range building.
 */
export interface SyntaxEventToken {
	type: string;
	start: number;
	end: number;
}

/**
 * Flattens a lexed event stream to `SyntaxEventToken`s in document order
 * (containers precede their children).
 */
export const syntax_events_to_tokens = (lexed: LexedSyntax): Array<SyntaxEventToken> => {
	const { events, events_len } = lexed;
	const { infos } = lexed.types;
	const tokens: Array<SyntaxEventToken> = [];
	const stack: Array<SyntaxEventToken> = [];
	let i = 0;
	while (i < events_len) {
		const tag = events[i]!;
		if (tag > 0) {
			tokens.push({ type: infos[tag]!.name, start: events[i + 1]!, end: events[i + 2]! });
			i += 3;
		} else if (tag < 0) {
			const t: SyntaxEventToken = { type: infos[-tag]!.name, start: events[i + 1]!, end: -1 };
			tokens.push(t);
			stack.push(t);
			i += 2;
		} else {
			const t = stack.pop();
			if (t) t.end = events[i + 1]!;
			i += 2;
		}
	}
	return tokens;
};

/**
 * Validates a lexed event stream's structural invariants, returning a list of
 * human-readable issues (empty when valid): records well-formed, offsets
 * monotonic and in-bounds, containers balanced.
 */
export const validate_syntax_events = (lexed: LexedSyntax): Array<string> => {
	const { text, events, events_len } = lexed;
	const { infos } = lexed.types;
	const issues: Array<string> = [];
	const stack: Array<number> = [];
	let cursor = 0;
	let i = 0;
	while (i < events_len) {
		const tag = events[i]!;
		if (tag > 0) {
			if (i + 3 > events_len) {
				issues.push(`truncated leaf record at ${i}`);
				break;
			}
			const start = events[i + 1]!;
			const end = events[i + 2]!;
			if (tag >= infos.length) issues.push(`unknown type id ${tag} at ${i}`);
			if (start < cursor) issues.push(`leaf start ${start} overlaps cursor ${cursor} at ${i}`);
			if (end <= start) issues.push(`empty or inverted leaf [${start}, ${end}) at ${i}`);
			if (end > text.length) issues.push(`leaf end ${end} out of bounds at ${i}`);
			cursor = end;
			i += 3;
		} else if (tag < 0) {
			if (i + 2 > events_len) {
				issues.push(`truncated open record at ${i}`);
				break;
			}
			const start = events[i + 1]!;
			if (-tag >= infos.length) issues.push(`unknown type id ${-tag} at ${i}`);
			if (start < cursor) issues.push(`open start ${start} overlaps cursor ${cursor} at ${i}`);
			if (start > text.length) issues.push(`open start ${start} out of bounds at ${i}`);
			stack.push(start);
			cursor = start;
			i += 2;
		} else {
			if (i + 2 > events_len) {
				issues.push(`truncated close record at ${i}`);
				break;
			}
			const end = events[i + 1]!;
			const open_start = stack.pop();
			if (open_start === undefined) {
				issues.push(`close without open at ${i}`);
			} else if (end < open_start) {
				issues.push(`container inverted: open ${open_start}, close ${end} at ${i}`);
			}
			if (end < cursor) issues.push(`close end ${end} before cursor ${cursor} at ${i}`);
			if (end > text.length) issues.push(`close end ${end} out of bounds at ${i}`);
			cursor = end;
			i += 2;
		}
	}
	if (stack.length > 0) issues.push(`${stack.length} unclosed container(s)`);
	return issues;
};

// Shared ASCII char-class flags. Code units >= 0xa0 are identifier chars by
// policy (matches the inherited U+00A0-U+FFFF identifier ranges; surrogate
// halves are >= 0xa0 so astral chars behave consistently).
const CF_SPACE = 1;
const CF_IDENT_START = 2;
const CF_IDENT = 4;

const CHAR_FLAGS: Uint8Array = new Uint8Array(128);
for (let c = 48; c <= 57; c++) CHAR_FLAGS[c] = CF_IDENT; // 0-9
for (let c = 65; c <= 90; c++) CHAR_FLAGS[c] = CF_IDENT_START | CF_IDENT; // A-Z
for (let c = 97; c <= 122; c++) CHAR_FLAGS[c] = CF_IDENT_START | CF_IDENT; // a-z
CHAR_FLAGS[36] = CF_IDENT_START | CF_IDENT; // $
CHAR_FLAGS[95] = CF_IDENT_START | CF_IDENT; // _
CHAR_FLAGS[9] = CF_SPACE; // \t
CHAR_FLAGS[10] = CF_SPACE; // \n
CHAR_FLAGS[11] = CF_SPACE; // \v
CHAR_FLAGS[12] = CF_SPACE; // \f
CHAR_FLAGS[13] = CF_SPACE; // \r
CHAR_FLAGS[32] = CF_SPACE; // space

export const is_space = (c: number): boolean => c < 128 && (CHAR_FLAGS[c]! & CF_SPACE) !== 0;

/**
 * Case-insensitive ASCII match of `word` (must be lowercase) at
 * `text[from..]`, via `code | 0x20` folding — never allocates, unlike
 * `toLowerCase()` comparisons.
 */
export const matches_ci = (text: string, from: number, word: string): boolean => {
	for (let k = 0; k < word.length; k++) {
		if ((text.charCodeAt(from + k) | 0x20) !== word.charCodeAt(k)) return false;
	}
	return true;
};

export const is_digit = (c: number): boolean => c >= 48 && c <= 57;

export const is_upper = (c: number): boolean => c >= 65 && c <= 90;

export const is_ascii_alnum = (c: number): boolean =>
	(c >= 48 && c <= 57) || ((c | 0x20) >= 97 && (c | 0x20) <= 122);

/**
 * A `\w` word char — ASCII letters, digits, and `_`.
 */
export const is_ascii_word = (c: number): boolean => is_ascii_alnum(c) || c === 95;

export const is_hex_digit = (c: number): boolean =>
	(c >= 48 && c <= 57) || ((c | 0x20) >= 97 && (c | 0x20) <= 102);

export const is_ident_start = (c: number): boolean =>
	c < 128 ? (CHAR_FLAGS[c]! & CF_IDENT_START) !== 0 : c >= 0xa0;

export const is_ident = (c: number): boolean =>
	c < 128 ? (CHAR_FLAGS[c]! & CF_IDENT) !== 0 : c >= 0xa0;

/**
 * Scans an identifier starting at `from` (assumed to be an identifier start),
 * returning the exclusive end index.
 */
export const scan_ident = (text: string, from: number, end: number): number => {
	let i = from + 1;
	while (i < end && is_ident(text.charCodeAt(i))) i++;
	return i;
};

/**
 * Skips whitespace (including newlines) from `from`, returning the next
 * non-space index.
 */
export const skip_space = (text: string, from: number, end: number): number => {
	let i = from;
	while (i < end && is_space(text.charCodeAt(i))) i++;
	return i;
};

/**
 * Trims trailing whitespace from a `[from, to)` span, returning the new
 * exclusive end.
 */
export const trim_space_end = (text: string, from: number, to: number): number => {
	let end = to;
	while (end > from && is_space(text.charCodeAt(end - 1))) end--;
	return end;
};

/**
 * Returns the index of the next `\n` at or after `i` (exclusive end of the
 * line's content, excluding a preceding `\r`), or `end` when there is none.
 * Uses native `indexOf` — the fast path for line-oriented scans.
 */
export const scan_to_line_end = (text: string, i: number, end: number): number => {
	const nl = text.indexOf('\n', i);
	if (nl === -1 || nl >= end) return end;
	return nl > i && text.charCodeAt(nl - 1) === 13 ? nl - 1 : nl;
};

/**
 * Skips a js-style quoted span from the quote at `from` (used inside balanced
 * scans), returning the index after the closing quote. Unterminated `'`/`"`
 * strings stop at the newline; templates (`` ` ``) span lines.
 */
export const skip_quoted = (text: string, from: number, end: number, quote: number): number => {
	let i = from + 1;
	while (i < end) {
		const c = text.charCodeAt(i);
		if (c === 92) i += 2;
		else if (c === quote) return i + 1;
		else if ((c === 10 || c === 13) && quote !== 96) return i;
		else i++;
	}
	return end;
};

/**
 * Returns the cached next occurrence of `ch` at or after `from`, re-probing
 * with `indexOf` only when the cached position has fallen behind. `Infinity`
 * when the text has no further occurrence — a monotonic probe that keeps
 * delimiter scans linear across a construct that is dense in `ch`.
 */
export const advance_probe = (text: string, cached: number, from: number, ch: string): number => {
	if (cached >= from) return cached;
	const found = text.indexOf(ch, from);
	return found === -1 ? Infinity : found;
};

/**
 * Finds the matching `}` for the `{` at `i`, skipping js-style strings,
 * templates, and comments. Returns -1 when unbalanced within the window.
 */
export const scan_balanced_braces = (text: string, i: number, end: number): number => {
	let depth = 0;
	let j = i;
	while (j < end) {
		const c = text.charCodeAt(j);
		if (c === 123) {
			depth++;
			j++;
		} else if (c === 125) {
			depth--;
			if (depth === 0) return j;
			j++;
		} else if (c === 34 || c === 39 || c === 96) {
			j = skip_quoted(text, j, end, c);
		} else if (c === 47) {
			const c2 = text.charCodeAt(j + 1);
			if (c2 === 47) {
				j = scan_to_line_end(text, j, end);
			} else if (c2 === 42) {
				const close = text.indexOf('*/', j + 2);
				j = close === -1 || close + 2 > end ? end : close + 2;
			} else {
				j++;
			}
		} else {
			j++;
		}
	}
	return -1;
};
