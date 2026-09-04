import {
	advance_probe,
	is_ascii_word,
	is_space,
	scan_to_line_end,
	token_type,
	type Lexer,
	type SyntaxLang
} from './lexer.ts';
import {
	create_markup_probe_cache,
	lex_markup_construct,
	MARKUP_MODE_HTML,
	scan_entity_end,
	type MarkupProbeCache
} from './lexer_markup.ts';

/**
 * Hand-written Markdown lexer — the structural rethink: a line-oriented block
 * scan (fences, headings, blockquotes, lists, horizontal rules) with an
 * inline scan per block (bold/italic/strikethrough, inline code, links,
 * entities, and raw markup constructs dispatched through `lexer_markup`).
 *
 * Fenced code is one `fenced_code` container (`code_fence` delimiter lines
 * with the `punctuation` alias + a `lang_*` container embedding the fence
 * language). The rest: `heading`/`blockquote`/`list` containers with aliased
 * `punctuation`, `link` > `link_text_wrapper`/`url_wrapper`, `inline_code`
 * (alias `code`) with `content`, `bold`/`italic`/`strikethrough`, and markup's
 * tag/comment/entity vocabulary for raw HTML.
 *
 * Notable behavior: fence info words match exactly (` ```json ` embeds json,
 * not javascript) and closing fences accept any length ≥ the opener; interior
 * lines starting with backticks are fence *content*, not stray `code_fence`
 * tokens; heading/blockquote/list interiors get the inline scan; list
 * containers span their line rather than swallowing preceding newlines;
 * horizontal rules (`---`/`***`/`___`) get an `hr` token (alias
 * `punctuation`). Emphasis delimiters require non-space-adjacent interiors
 * free of the delimiter (and word boundaries for `_` forms) and are
 * line-bounded — they do not span paragraphs.
 *
 * Resilience: an unterminated fence extends to the end of the window.
 *
 * @module
 */

const T_FENCED_CODE = token_type('fenced_code');
const T_CODE_FENCE = token_type('code_fence', 'punctuation');
const T_LANG_TS = token_type('lang_ts');
const T_LANG_JS = token_type('lang_js');
const T_LANG_CSS = token_type('lang_css');
const T_LANG_MARKUP = token_type('lang_markup');
const T_LANG_JSON = token_type('lang_json');
const T_LANG_SVELTE = token_type('lang_svelte');
const T_LANG_BASH = token_type('lang_bash');
const T_LANG_MD = token_type('lang_md');
const T_LANG_RUST = token_type('lang_rust');
const T_HEADING = token_type('heading');
const T_HEADING_PUNCTUATION = token_type('punctuation', 'heading_punctuation');
const T_BLOCKQUOTE = token_type('blockquote');
const T_BLOCKQUOTE_PUNCTUATION = token_type('punctuation', 'blockquote_punctuation');
const T_LIST = token_type('list');
const T_PUNCTUATION = token_type('punctuation');
const T_HR = token_type('hr', 'punctuation');
const T_LINK = token_type('link');
const T_LINK_TEXT_WRAPPER = token_type('link_text_wrapper');
const T_LINK_TEXT = token_type('link_text');
const T_LINK_PUNCTUATION = token_type('punctuation', 'link_punctuation');
const T_URL_WRAPPER = token_type('url_wrapper');
const T_URL = token_type('url');
const T_INLINE_CODE = token_type('inline_code', 'code');
const T_CODE_PUNCTUATION = token_type('punctuation', 'code_punctuation');
const T_CONTENT = token_type('content');
const T_BOLD = token_type('bold');
const T_ITALIC = token_type('italic');
const T_STRIKETHROUGH = token_type('strikethrough');
const T_ENTITY = token_type('entity');
const T_NAMED_ENTITY = token_type('entity', 'named_entity');

/**
 * Fence info words → embedded language. Exact-word matching: ` ```json `
 * embeds json, not javascript.
 */
interface MdFenceLang {
	id: string;
	container: number;
}

const FENCE_LANGS: Map<string, MdFenceLang> = new Map();
const add_fence_lang = (words: string, id: string, container: number): void => {
	for (const word of words.split(' ')) FENCE_LANGS.set(word, { id, container });
};
add_fence_lang('ts typescript', 'ts', T_LANG_TS);
add_fence_lang('js javascript', 'js', T_LANG_JS);
add_fence_lang('css', 'css', T_LANG_CSS);
add_fence_lang('html markup', 'markup', T_LANG_MARKUP);
add_fence_lang('json', 'json', T_LANG_JSON);
add_fence_lang('svelte', 'svelte', T_LANG_SVELTE);
add_fence_lang('sh bash shell', 'sh', T_LANG_BASH);
add_fence_lang('md markdown', 'md', T_LANG_MD);
add_fence_lang('rust rs', 'rust', T_LANG_RUST);

// line-internal whitespace — `is_space` from the toolkit includes newlines
const is_line_space = (c: number): boolean => c === 32 || c === 9;

const next_line_start = (text: string, from: number, end: number): number => {
	const nl = text.indexOf('\n', from);
	return nl === -1 || nl >= end ? end : nl + 1;
};

// whether [from, to) contains any non-space char
const has_inline_content = (text: string, from: number, to: number): boolean => {
	for (let i = from; i < to; i++) {
		if (!is_line_space(text.charCodeAt(i))) return true;
	}
	return false;
};

/**
 * Lexes an emphasis form at the delimiter `code` at `i` — the double form
 * (`**`/`__`/`~~`) into `double_type`, falling back to the single form
 * (`*`/`_`) into `italic` when allowed. Matching rules: the interior is
 * free of the delimiter char with non-space first/last chars; `_` forms
 * require word boundaries outside. Returns the next scan position.
 */
const lex_md_emphasis = (
	l: Lexer,
	i: number,
	line_end: number,
	code: number,
	ds: string,
	double_type: number,
	word_boundary: boolean,
	allow_single: boolean
): number => {
	const { text } = l;
	if (word_boundary && is_ascii_word(text.charCodeAt(i - 1))) return i + 1;
	if (text.charCodeAt(i + 1) === code) {
		// double form — interior is [i+2, k), closer [k, k+2)
		const k = text.indexOf(ds, i + 2);
		if (
			k !== -1 &&
			k + 1 < line_end &&
			k > i + 2 &&
			text.charCodeAt(k + 1) === code &&
			!is_space(text.charCodeAt(i + 2)) &&
			!is_space(text.charCodeAt(k - 1)) &&
			(!word_boundary || !is_ascii_word(text.charCodeAt(k + 2)))
		) {
			l.open(double_type, i);
			l.leaf(T_PUNCTUATION, i, i + 2);
			l.leaf(T_PUNCTUATION, k, k + 2);
			l.close(k + 2);
			return k + 2;
		}
		if (!allow_single) return i + 1;
	}
	if (!allow_single) return i + 1;
	// single form — interior is [i+1, k)
	const k = text.indexOf(ds, i + 1);
	if (
		k !== -1 &&
		k < line_end &&
		k > i + 1 &&
		!is_space(text.charCodeAt(i + 1)) &&
		!is_space(text.charCodeAt(k - 1)) &&
		(!word_boundary || !is_ascii_word(text.charCodeAt(k + 1)))
	) {
		l.open(T_ITALIC, i);
		l.leaf(T_PUNCTUATION, i, i + 1);
		l.leaf(T_PUNCTUATION, k, k + 1);
		l.close(k + 1);
		return k + 1;
	}
	return i + 1;
};

/**
 * Monotonic next-occurrence caches for the whole-document md scan: the link
 * scanner's `]`/`)` probes plus the markup probe cache threaded into raw
 * markup constructs. Because these probes target chars *other* than the one
 * that triggered them, a failed probe re-scans text the scan doesn't consume —
 * uncached (or cached only per line), a `[x](`-per-line document pays a full
 * forward `indexOf` per line, O(n²) across the document. The caches advance
 * forward through the block and inline scans (which visit positions in
 * increasing order), so total probe work is O(n). `Infinity` means the char
 * has no further occurrence.
 */
interface MdScanCache {
	rbracket: number;
	rparen: number;
	markup: MarkupProbeCache;
}

/**
 * Lexes a `[text](url)` link at the `[` at `i`, returning the next scan
 * position (`i + 1` when it isn't a link). Constraints: text interior free of
 * `[`/`]`, url interior free of `)`, both line-bounded and non-empty, `(`
 * immediately after `]`.
 */
const lex_md_link = (l: Lexer, i: number, line_end: number, cache: MdScanCache): number => {
	const { text } = l;
	cache.rbracket = advance_probe(text, cache.rbracket, i + 1, ']');
	const rb = cache.rbracket;
	if (rb >= line_end || rb === i + 1) return i + 1;
	const lb2 = text.indexOf('[', i + 1);
	if (lb2 !== -1 && lb2 < rb) return i + 1;
	if (text.charCodeAt(rb + 1) !== 40) return i + 1;
	cache.rparen = advance_probe(text, cache.rparen, rb + 2, ')');
	const cp = cache.rparen;
	if (cp >= line_end || cp === rb + 2) return i + 1;
	l.open(T_LINK, i);
	l.open(T_LINK_TEXT_WRAPPER, i);
	l.leaf(T_LINK_PUNCTUATION, i, i + 1);
	l.leaf(T_LINK_TEXT, i + 1, rb);
	l.leaf(T_LINK_PUNCTUATION, rb, rb + 1);
	l.close(rb + 1);
	l.open(T_URL_WRAPPER, rb + 1);
	l.leaf(T_LINK_PUNCTUATION, rb + 1, rb + 2);
	l.leaf(T_URL, rb + 2, cp);
	l.leaf(T_LINK_PUNCTUATION, cp, cp + 1);
	l.close(cp + 1);
	l.close(cp + 1);
	return cp + 1;
};

/**
 * The inline scan — bold/italic/strikethrough, inline code, links, entities,
 * and raw markup constructs, over `[from, to)`. Markup constructs are
 * allowed to extend to `construct_end` (the window end in paragraph context,
 * so multi-line tags/comments/script regions work; the line end inside block
 * containers, so container nesting stays valid). Returns the final position,
 * which exceeds `to` only when a paragraph construct spanned lines.
 */
const lex_md_inline = (
	l: Lexer,
	from: number,
	to: number,
	construct_end: number,
	cache: MdScanCache
): number => {
	const { text } = l;
	let i = from;
	let line_end = to;
	while (i < line_end) {
		const c = text.charCodeAt(i);
		if (c === 60) {
			// < — raw markup construct
			i = lex_markup_construct(l, i, construct_end, MARKUP_MODE_HTML, cache.markup);
			if (i > line_end) line_end = scan_to_line_end(text, i, construct_end);
			continue;
		}
		if (c === 38) {
			// & — entity
			const entity_end = scan_entity_end(text, i, line_end);
			if (entity_end === -1) {
				i++;
			} else {
				l.leaf(text.charCodeAt(i + 1) === 35 ? T_ENTITY : T_NAMED_ENTITY, i, entity_end);
				i = entity_end;
			}
			continue;
		}
		if (c === 96) {
			// ` — inline code, single backticks, line-bounded, non-empty
			const close = text.indexOf('`', i + 1);
			if (close !== -1 && close < line_end && close > i + 1) {
				l.open(T_INLINE_CODE, i);
				l.leaf(T_CODE_PUNCTUATION, i, i + 1);
				l.leaf(T_CONTENT, i + 1, close);
				l.leaf(T_CODE_PUNCTUATION, close, close + 1);
				l.close(close + 1);
				i = close + 1;
			} else {
				i++;
			}
			continue;
		}
		if (c === 42) {
			// *
			i = lex_md_emphasis(l, i, line_end, 42, '*', T_BOLD, false, true);
			continue;
		}
		if (c === 95) {
			// _
			i = lex_md_emphasis(l, i, line_end, 95, '_', T_BOLD, true, true);
			continue;
		}
		if (c === 126) {
			// ~
			i = lex_md_emphasis(l, i, line_end, 126, '~', T_STRIKETHROUGH, false, false);
			continue;
		}
		if (c === 91) {
			// [
			i = lex_md_link(l, i, line_end, cache);
			continue;
		}
		i++;
	}
	return i;
};

/**
 * Lexes a fenced code block from the opening backticks at `ls` (col 0, ≥3),
 * returning the position after the block. The close fence is a col-0 line of
 * ≥ the opening count of backticks and nothing else; an unterminated fence
 * extends to the window end. Known info words embed their language inside a
 * `lang_*` container; unknown/absent info leaves the content plain.
 */
const lex_md_fence = (l: Lexer, ls: number, le: number, next: number, end: number): number => {
	const { text } = l;
	let bt = ls;
	while (bt < le && text.charCodeAt(bt) === 96) bt++;
	const count = bt - ls;
	// info word — immediately after the backticks, ending at whitespace or the
	// line end
	let w = bt;
	while (w < le && !is_line_space(text.charCodeAt(w))) w++;
	const lang = w > bt ? FENCE_LANGS.get(text.slice(bt, w)) : undefined;

	// find the close fence line
	let close_ls = -1;
	let close_le = end;
	let search = next;
	while (search < end) {
		const sle = scan_to_line_end(text, search, end);
		if (text.charCodeAt(search) === 96) {
			let b2 = search;
			while (b2 < sle && text.charCodeAt(b2) === 96) b2++;
			if (b2 - search >= count && b2 === sle) {
				close_ls = search;
				close_le = sle;
				break;
			}
		}
		search = next_line_start(text, search, end);
	}

	l.open(T_FENCED_CODE, ls);
	l.leaf(T_CODE_FENCE, ls, le);
	const content_start = le; // includes the newline
	const content_end = close_ls === -1 ? end : close_ls;
	if (lang !== undefined && content_end > content_start) {
		l.open(lang.container, content_start);
		l.embed(lang.id, content_start, content_end);
		l.close(content_end);
	}
	if (close_ls === -1) {
		l.close(end);
		return end;
	}
	l.leaf(T_CODE_FENCE, close_ls, close_le);
	l.close(close_le);
	return next_line_start(text, close_le, end);
};

/**
 * Lexes one line starting at `ls`, returning the next scan position.
 */
const lex_md_line = (
	l: Lexer,
	ls: number,
	le: number,
	next: number,
	end: number,
	cache: MdScanCache
): number => {
	const { text } = l;
	const c = text.charCodeAt(ls);

	// fenced code block — col 0, 3+ backticks
	if (c === 96 && text.charCodeAt(ls + 1) === 96 && text.charCodeAt(ls + 2) === 96) {
		return lex_md_fence(l, ls, le, next, end);
	}

	// heading — 1-6 `#`s, then whitespace, then content
	if (c === 35) {
		let h = ls + 1;
		while (h < le && h - ls < 6 && text.charCodeAt(h) === 35) h++;
		if (
			h < le &&
			text.charCodeAt(h) !== 35 &&
			is_line_space(text.charCodeAt(h)) &&
			has_inline_content(text, h + 1, le)
		) {
			l.open(T_HEADING, ls);
			l.leaf(T_HEADING_PUNCTUATION, ls, h);
			lex_md_inline(l, h, le, le, cache);
			l.close(le);
			return next;
		}
	}

	// blockquote — col-0 `>` with content
	if (c === 62 && has_inline_content(text, ls + 1, le)) {
		l.open(T_BLOCKQUOTE, ls);
		l.leaf(T_BLOCKQUOTE_PUNCTUATION, ls, ls + 1);
		lex_md_inline(l, ls + 1, le, le, cache);
		l.close(le);
		return next;
	}

	// horizontal rule — a col-0 line of 3+ identical `-`/`*`/`_`
	if (c === 45 || c === 42 || c === 95) {
		let k = ls;
		while (k < le && text.charCodeAt(k) === c) k++;
		if (k === le && k - ls >= 3) {
			l.leaf(T_HR, ls, le);
			return next;
		}
	}

	// list item — optional indent, `-`/`*` marker, whitespace, content
	{
		let m = ls;
		while (m < le && is_line_space(text.charCodeAt(m))) m++;
		const mc = text.charCodeAt(m);
		if (
			(mc === 45 || mc === 42) &&
			m + 1 < le &&
			is_line_space(text.charCodeAt(m + 1)) &&
			has_inline_content(text, m + 2, le)
		) {
			l.open(T_LIST, ls);
			l.leaf(T_PUNCTUATION, ls, m + 1);
			lex_md_inline(l, m + 1, le, le, cache);
			l.close(le);
			return next;
		}
	}

	// paragraph text — markup constructs may span lines
	const after = lex_md_inline(l, ls, le, end, cache);
	return next_line_start(text, after > le ? after : le, end);
};

const lex_md = (l: Lexer): void => {
	const { text, end } = l;
	// one cache for the whole document scan — see `MdScanCache`
	const cache: MdScanCache = { rbracket: -1, rparen: -1, markup: create_markup_probe_cache() };
	let i = l.pos;
	while (i < end) {
		const le = scan_to_line_end(text, i, end);
		if (le === i) {
			// blank line
			i = next_line_start(text, i, end);
			continue;
		}
		i = lex_md_line(l, i, le, next_line_start(text, i, end), end, cache);
	}
	l.pos = end;
};

/**
 * The Markdown language registration for the lexer engine.
 */
export const lexer_md: SyntaxLang = { id: 'md', aliases: ['markdown'], lex: lex_md };
