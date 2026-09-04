import {
	advance_probe,
	is_ascii_alnum,
	is_digit,
	is_hex_digit,
	is_space,
	matches_ci,
	scan_to_line_end,
	skip_space,
	token_type,
	type Lexer,
	type SyntaxLang
} from './lexer.ts';

/**
 * Hand-written HTML/XML lexer.
 *
 * Emits: flat `comment`, `processing_instruction`, `doctype`, `cdata`, and
 * `entity` (alias `named_entity` for the `&amp;`-style form); a `tag` container
 * holding a nested `tag` (the `<name` opener with `punctuation`/`namespace`
 * children — the name itself stays plain text), `attr_name` (with `namespace`),
 * `attr_value` (spanning the `=` and quotes, which are `punctuation` with
 * `attr_equals`/`attr_quote` aliases, plus entities), and a final
 * `punctuation` closer; `special_attr` containers for `style=`/`on*=`
 * attributes whose `value` embeds css/js; and `script`/`style` region
 * containers wrapping `lang_js`/`lang_css` around embedded language windows.
 *
 * Two registrations share this scanner: `lexer_markup` (`markup`/`html`/
 * `mathml`/`svg`) uses HTML semantics — rawtext elements (`script`, `style`)
 * and RCDATA elements (`textarea`/`title`) plus the `style=`/`on*=` attribute
 * embedding; `lexer_xml` (`xml`/`ssml`/`atom`/`rss`) scans plain XML with
 * neither.
 *
 * HTML-semantics details: a comment ends at the first `-->` (even one
 * containing a second `<!--`); doctypes skip a `[…]` internal subset; CDATA
 * sections inside `<script>`/`<style>` are handed to the embedded language
 * as-is (no `included_cdata` structure — HTML treats them as source text);
 * rawtext close tags accept whitespace before `>` (`</script >`).
 *
 * Resilience: unterminated comments, processing instructions, doctypes,
 * CDATA sections, tags, quoted attribute values, and rawtext regions all
 * extend to the end of the window.
 *
 * @module
 */

const T_COMMENT = token_type('comment');
const T_PROCESSING_INSTRUCTION = token_type('processing_instruction');
const T_DOCTYPE = token_type('doctype');
const T_CDATA = token_type('cdata');
const T_TAG = token_type('tag');
const T_TAG_PUNCTUATION = token_type('punctuation', 'tag_punctuation');
const T_NAMESPACE = token_type('namespace');
const T_ATTR_NAME = token_type('attr_name');
const T_ATTR_VALUE = token_type('attr_value');
const T_ATTR_EQUALS = token_type('punctuation', 'attr_equals');
const T_ATTR_QUOTE = token_type('punctuation', 'attr_quote');
const T_NAMED_ENTITY = token_type('entity', 'named_entity');
const T_ENTITY = token_type('entity');
const T_SPECIAL_ATTR = token_type('special_attr');
const T_SCRIPT = token_type('script');
const T_STYLE = token_type('style');
const T_LANG_JS = token_type('lang_js');
const T_LANG_CSS = token_type('lang_css');
const T_VALUE_JS = token_type('value', ['js', 'lang_js']);
const T_VALUE_CSS = token_type('value', ['css', 'lang_css']);
const T_PUNCTUATION = token_type('punctuation');

/**
 * Dialect configuration for the shared markup scanner — how html, xml, and
 * svelte differ. Instances are module-level constants (one per dialect) so
 * the scanner stays monomorphic.
 */
export interface MarkupLexMode {
	/**
	 * Language embedded in `<script>` rawtext regions (resolved through the
	 * lexer registry at lex time), or null to disable rawtext regions
	 * entirely (xml).
	 */
	script_embed: string | null;
	/**
	 * Container type id wrapping script content — `lang_js` for html,
	 * `lang_ts` for svelte. Unused when `script_embed` is null.
	 */
	script_container: number;
	/**
	 * RCDATA `textarea`/`title` regions (html only — svelte keeps
	 * expressions live inside them).
	 */
	rcdata: boolean;
	/**
	 * `style=`/`on*=` attribute embedding (html only).
	 */
	special_attrs: boolean;
	/**
	 * JS-style line and block comments between attributes emit `comment` leaves
	 * (svelte only — in html/xml a `//` inside a tag is ordinary bogus attribute
	 * text, not a comment).
	 */
	attr_comments: boolean;
	/**
	 * Lexes a `{…}` expression at `from`, returning the position after it —
	 * the svelte hook, null for html/xml. `full` enables block/each forms
	 * (top level); tag and attribute contexts get the simple form.
	 */
	lex_expression: ((l: Lexer, from: number, end: number, full: boolean) => number) | null;
}

/**
 * The html dialect mode — also used by `lexer_md` for raw markup embedded in
 * markdown text.
 */
export const MARKUP_MODE_HTML: MarkupLexMode = {
	script_embed: 'js',
	script_container: T_LANG_JS,
	rcdata: true,
	special_attrs: true,
	attr_comments: false,
	lex_expression: null
};

const MODE_XML: MarkupLexMode = {
	script_embed: null,
	script_container: 0,
	rcdata: false,
	special_attrs: false,
	attr_comments: false,
	lex_expression: null
};

// a tag-name char — anything except whitespace, `>`, `/`, `=`, `$`, `<`, `%`
// (`$` and `%` are excluded to keep template syntax inert)
const is_tag_name_char = (c: number): boolean =>
	!is_space(c) && c !== 62 && c !== 47 && c !== 61 && c !== 36 && c !== 60 && c !== 37;

// ends an attribute name — whitespace, `>`, `/`, `=`
const is_attr_name_end = (c: number): boolean => is_space(c) || c === 62 || c === 47 || c === 61;

// ends an unquoted attribute value — whitespace, `>`, quotes, `=`
const is_unquoted_value_end = (c: number): boolean =>
	is_space(c) || c === 62 || c === 34 || c === 39 || c === 61;

/**
 * Monotonic next-occurrence caches for the markup scanner's probes (see
 * `advance_probe`). The scan visits constructs in increasing position order,
 * but its probes (`<`/`{` between constructs, `&` in text gaps and attribute
 * values) target chars the current construct doesn't consume — without the
 * caches, input dense in one probe char but lacking another re-scans the
 * document tail per construct, quadratic in document size. One cache spans a
 * whole window scan (or a whole md document scan, threaded through
 * `lex_markup_construct`); embedded guest windows create their own.
 */
export interface MarkupProbeCache {
	lt: number;
	brace: number;
	amp: number;
}

export const create_markup_probe_cache = (): MarkupProbeCache => ({ lt: -1, brace: -1, amp: -1 });

/**
 * Scans an entity reference at the `&` at `i`, returning its exclusive end or
 * -1. Accepts a named form (1–8 case-insensitive alphanumerics, `&…;`) and a
 * numeric form (`&#…;` or `&#x…;`, 1–8 hex digits allowed in both).
 */
export const scan_entity_end = (text: string, i: number, end: number): number => {
	let j = i + 1;
	const numeric = j < end && text.charCodeAt(j) === 35; // #
	if (numeric) {
		j++;
		if (j < end && (text.charCodeAt(j) | 0x20) === 120) j++; // x
	}
	const digits_start = j;
	const is_wanted = numeric ? is_hex_digit : is_ascii_alnum;
	while (j < end && j - digits_start < 8 && is_wanted(text.charCodeAt(j))) j++;
	if (j === digits_start) return -1;
	if (j < end && text.charCodeAt(j) === 59) return j + 1; // ;
	return -1;
};

/**
 * Emits entity leaves found in `[from, to)`. `<` is not special here — this
 * runs over plain text runs, RCDATA regions, and attribute-value contents.
 */
const lex_markup_entities = (l: Lexer, from: number, to: number, cache: MarkupProbeCache): void => {
	const { text } = l;
	let i = from;
	while (i < to) {
		cache.amp = advance_probe(text, cache.amp, i, '&');
		const amp = cache.amp;
		if (amp >= to) return;
		const entity_end = scan_entity_end(text, amp, to);
		if (entity_end === -1) {
			i = amp + 1;
			continue;
		}
		l.leaf(text.charCodeAt(amp + 1) === 35 ? T_ENTITY : T_NAMED_ENTITY, amp, entity_end);
		i = entity_end;
	}
};

/**
 * Detects a `style` or `on*` attribute name (case-insensitive) in html mode,
 * returning the embed language id or `null`.
 */
const special_attr_lang = (text: string, from: number, to: number): string | null => {
	const len = to - from;
	if (len === 5 && matches_ci(text, from, 'style')) return 'css';
	if (len >= 3 && matches_ci(text, from, 'on')) {
		for (let k = from + 2; k < to; k++) {
			const c = text.charCodeAt(k);
			// \w — letters, digits, `_`
			if (!is_ascii_alnum(c) && c !== 95) return null;
		}
		return 'js';
	}
	return null;
};

/**
 * Lexes plain attribute-value content — entities, plus `{…}` expressions in
 * svelte mode.
 */
const lex_markup_value_content = (
	l: Lexer,
	from: number,
	to: number,
	mode: MarkupLexMode,
	cache: MarkupProbeCache
): void => {
	const { lex_expression } = mode;
	if (lex_expression === null) {
		lex_markup_entities(l, from, to, cache);
		return;
	}
	const { text } = l;
	let i = from;
	while (i < to) {
		cache.brace = advance_probe(text, cache.brace, i, '{');
		const brace = cache.brace >= to ? to : cache.brace;
		if (brace > i) lex_markup_entities(l, i, brace, cache);
		if (brace >= to) break;
		i = lex_expression(l, brace, to, false);
	}
};

/**
 * Emits an attribute value container `[eq, value_end)` — `attr_equals`, the
 * quotes, and the content: entities (plus svelte expressions) for plain
 * values, or (for `style=`/`on*=` special attrs) a `value` container
 * embedding `embed_lang`. The `value` container appears only when the content
 * is non-empty and starts immediately after the opening quote with a non-space
 * char.
 */
const lex_markup_attr_value = (
	l: Lexer,
	eq: number,
	content_start: number,
	content_end: number,
	value_end: number,
	quoted: boolean,
	closed: boolean,
	embed_lang: string | null,
	mode: MarkupLexMode,
	cache: MarkupProbeCache
): void => {
	l.open(T_ATTR_VALUE, eq);
	l.leaf(T_ATTR_EQUALS, eq, eq + 1);
	if (quoted) l.leaf(T_ATTR_QUOTE, content_start - 1, content_start);
	if (embed_lang === null) {
		lex_markup_value_content(l, content_start, content_end, mode, cache);
	} else if (content_end > content_start && !is_space(l.text.charCodeAt(content_start))) {
		l.open(embed_lang === 'css' ? T_VALUE_CSS : T_VALUE_JS, content_start);
		l.embed(embed_lang, content_start, content_end);
		l.close(content_end);
	}
	if (quoted && closed) l.leaf(T_ATTR_QUOTE, content_end, content_end + 1);
	l.close(value_end);
};

/**
 * Emits an `attr_name` — a plain leaf, or a container when the name has a
 * `ns:` prefix (`namespace` leaf) or, in svelte mode, `|modifier` pipes
 * (`punctuation` leaves, e.g. `transition:fade|global`).
 */
const lex_markup_attr_name = (l: Lexer, from: number, to: number, mode: MarkupLexMode): void => {
	const { text } = l;
	const ns_end = scan_namespace_end(text, from, to);
	// directive-modifier pipes come *after* any `ns:` prefix — a `|` inside the
	// namespace span (malformed input like `a|b:c`) is part of the namespace,
	// not a modifier separator, so start the pipe scan at `ns_end` to keep the
	// emitted leaves monotonic (a pipe leaf before `ns_end` would overlap the
	// namespace leaf and produce an invalid event stream)
	let pipe = -1;
	if (mode.lex_expression !== null) {
		for (let k = ns_end === -1 ? from : ns_end; k < to; k++) {
			if (text.charCodeAt(k) === 124) {
				pipe = k;
				break;
			}
		}
	}
	if (ns_end === -1 && pipe === -1) {
		l.leaf(T_ATTR_NAME, from, to);
		return;
	}
	l.open(T_ATTR_NAME, from);
	if (ns_end !== -1) l.leaf(T_NAMESPACE, from, ns_end);
	if (pipe !== -1) {
		for (let k = pipe; k < to; k++) {
			if (text.charCodeAt(k) === 124) l.leaf(T_PUNCTUATION, k, k + 1);
		}
	}
	l.close(to);
};

/**
 * Finds a name span's `ns:` prefix — the run up to the first `:`, containing
 * no whitespace, `>`, or `/`. Returns the namespace end (the index after `:`),
 * or -1.
 */
const scan_namespace_end = (text: string, from: number, to: number): number => {
	for (let k = from; k < to; k++) {
		if (text.charCodeAt(k) === 58) return k > from ? k + 1 : -1;
	}
	return -1;
};

/**
 * Lexes a tag from the `<` at `i`, returning the position after the closing
 * `>` (or the window end when unterminated). Returns `i + 1` — leaving the
 * `<` as plain text — when no tag name follows.
 */
const lex_markup_tag = (
	l: Lexer,
	i: number,
	end: number,
	mode: MarkupLexMode,
	cache: MarkupProbeCache
): number => {
	const { text } = l;
	const closing = text.charCodeAt(i + 1) === 47;
	const name_start = i + (closing ? 2 : 1);
	if (name_start >= end) return i + 1;
	const c0 = text.charCodeAt(name_start);
	if (!is_tag_name_char(c0) || is_digit(c0)) return i + 1;
	let name_end = name_start + 1;
	while (name_end < end && is_tag_name_char(text.charCodeAt(name_end))) name_end++;

	l.open(T_TAG, i); // the whole tag
	l.open(T_TAG, i); // the `<name` opener
	l.leaf(T_TAG_PUNCTUATION, i, name_start);
	const ns_end = scan_namespace_end(text, name_start, name_end);
	if (ns_end !== -1) l.leaf(T_NAMESPACE, name_start, ns_end);
	l.close(name_end);

	let j = name_end;
	let tag_end = end; // unterminated tags extend to the window end
	while (j < end) {
		const c = text.charCodeAt(j);
		if (is_space(c)) {
			j++;
			continue;
		}
		if (c === 62) {
			// >
			l.leaf(T_TAG_PUNCTUATION, j, j + 1);
			tag_end = j + 1;
			break;
		}
		if (c === 47 && j + 1 < end && text.charCodeAt(j + 1) === 62) {
			// `/>` — guard `j + 1 < end` so a trailing `/` at the window edge
			// (e.g. an embedded sub-window) never reads or emits past `end`
			l.leaf(T_TAG_PUNCTUATION, j, j + 2);
			tag_end = j + 2;
			break;
		}
		if (mode.attr_comments && c === 47 && j + 1 < end) {
			// js-style comment between attributes (svelte); a `//` line comment
			// runs to the newline, a block comment to its closer, and either
			// extends to the window end when unterminated (editor-style)
			const c1 = text.charCodeAt(j + 1);
			if (c1 === 47) {
				const line_end = scan_to_line_end(text, j, end);
				l.leaf(T_COMMENT, j, line_end);
				j = line_end;
				continue;
			}
			if (c1 === 42) {
				const close = text.indexOf('*/', j + 2);
				const comment_end = close === -1 || close + 2 > end ? end : close + 2;
				l.leaf(T_COMMENT, j, comment_end);
				j = comment_end;
				continue;
			}
		}
		if (c === 47 || c === 61) {
			// stray `/` or `=` — plain text inside the tag
			j++;
			continue;
		}
		if (c === 123 && mode.lex_expression !== null) {
			// `{expr}` in attribute position — shorthand, spread, `{@attach …}`
			j = mode.lex_expression(l, j, end, false);
			continue;
		}

		// attribute name
		const an_start = j;
		let an_end = j + 1;
		while (an_end < end && !is_attr_name_end(text.charCodeAt(an_end))) an_end++;

		// `= value`?
		const eq = skip_space(text, an_end, end);
		if (eq >= end || text.charCodeAt(eq) !== 61) {
			// bare attribute
			lex_markup_attr_name(l, an_start, an_end, mode);
			j = an_end;
			continue;
		}

		const v = skip_space(text, eq + 1, end);
		const vc = v < end ? text.charCodeAt(v) : 0;
		if (vc === 123 && mode.lex_expression !== null) {
			// `={expr}` — the value is an expression
			lex_markup_attr_name(l, an_start, an_end, mode);
			l.open(T_ATTR_VALUE, eq);
			l.leaf(T_ATTR_EQUALS, eq, eq + 1);
			const expr_end = mode.lex_expression(l, v, end, false);
			l.close(expr_end);
			j = expr_end;
			continue;
		}
		let content_start;
		let content_end;
		let value_end;
		let quoted = false;
		let closed = true;
		if (vc === 34 || vc === 39) {
			quoted = true;
			content_start = v + 1;
			const close_quote = text.indexOf(vc === 34 ? '"' : "'", v + 1);
			if (close_quote === -1 || close_quote >= end) {
				content_end = end;
				value_end = end;
				closed = false;
			} else {
				content_end = close_quote;
				value_end = close_quote + 1;
			}
		} else {
			content_start = v;
			let ve = v;
			while (ve < end && !is_unquoted_value_end(text.charCodeAt(ve))) ve++;
			content_end = ve;
			value_end = ve;
		}

		// a special attr needs a quoted or non-empty value
		const special_lang = mode.special_attrs ? special_attr_lang(text, an_start, an_end) : null;
		if (special_lang !== null && (quoted || content_end > content_start)) {
			l.open(T_SPECIAL_ATTR, an_start);
			l.leaf(T_ATTR_NAME, an_start, an_end);
			lex_markup_attr_value(
				l,
				eq,
				content_start,
				content_end,
				value_end,
				quoted,
				closed,
				special_lang,
				mode,
				cache
			);
			l.close(value_end);
		} else {
			lex_markup_attr_name(l, an_start, an_end, mode);
			lex_markup_attr_value(
				l,
				eq,
				content_start,
				content_end,
				value_end,
				quoted,
				closed,
				null,
				mode,
				cache
			);
		}
		j = value_end;
	}
	l.close(tag_end);
	return tag_end;
};

// a rawtext close-tag name boundary — whitespace, `/`, `>`, or the window end
const is_rawtext_close_boundary = (text: string, i: number, end: number): boolean => {
	if (i >= end) return true;
	const c = text.charCodeAt(i);
	return is_space(c) || c === 47 || c === 62;
};

// a tag-name end boundary — the window end or any non-name char
const at_name_boundary = (text: string, i: number, end: number): boolean =>
	i >= end || !is_tag_name_char(text.charCodeAt(i));

/**
 * Returns the rawtext element name when the tag name at `name_start` is one
 * of html's rawtext (or, with `rcdata`, RCDATA) elements, else null.
 */
const rawtext_name_at = (
	text: string,
	name_start: number,
	end: number,
	rcdata: boolean
): string | null => {
	const c = text.charCodeAt(name_start) | 0x20;
	if (c === 115) {
		// s
		if (matches_ci(text, name_start, 'script') && at_name_boundary(text, name_start + 6, end)) {
			return 'script';
		}
		if (matches_ci(text, name_start, 'style') && at_name_boundary(text, name_start + 5, end)) {
			return 'style';
		}
	} else if (c === 116 && rcdata) {
		// t
		if (matches_ci(text, name_start, 'textarea') && at_name_boundary(text, name_start + 8, end)) {
			return 'textarea';
		}
		if (matches_ci(text, name_start, 'title') && at_name_boundary(text, name_start + 5, end)) {
			return 'title';
		}
	}
	return null;
};

/**
 * Lexes a rawtext region from `from` to the matching case-insensitive close
 * tag (`</script` etc. followed by whitespace, `/`, `>`, or the window end),
 * returning the content end — the `<` of the closer, which the main loop then
 * lexes as an ordinary tag. Script/style content embeds js/css inside
 * `script`+`lang_js` / `style`+`lang_css` containers; RCDATA (`textarea`/
 * `title`) content emits entities only.
 */
const lex_markup_rawtext = (
	l: Lexer,
	name: string,
	from: number,
	end: number,
	mode: MarkupLexMode,
	cache: MarkupProbeCache
): number => {
	const { text } = l;
	let content_end = end;
	let search = from;
	while (true) {
		const lt = text.indexOf('</', search);
		if (lt === -1 || lt >= end) break;
		if (
			matches_ci(text, lt + 2, name) &&
			is_rawtext_close_boundary(text, lt + 2 + name.length, end)
		) {
			content_end = lt;
			break;
		}
		search = lt + 2;
	}
	if (content_end > from) {
		if (name === 'script') {
			l.open(T_SCRIPT, from);
			l.open(mode.script_container, from);
			l.embed(mode.script_embed!, from, content_end);
			l.close(content_end);
			l.close(content_end);
		} else if (name === 'style') {
			l.open(T_STYLE, from);
			l.open(T_LANG_CSS, from);
			l.embed('css', from, content_end);
			l.close(content_end);
			l.close(content_end);
		} else {
			lex_markup_entities(l, from, content_end, cache);
		}
	}
	return content_end;
};

/**
 * Lexes one `<…` construct at `i`, returning the next scan position.
 * Exported for `lexer_md`, which dispatches raw markup out of markdown text.
 */
export const lex_markup_construct = (
	l: Lexer,
	i: number,
	end: number,
	mode: MarkupLexMode,
	cache: MarkupProbeCache
): number => {
	const { text } = l;
	const c1 = i + 1 < end ? text.charCodeAt(i + 1) : 0;
	if (c1 === 33) {
		// <!
		if (i + 4 <= end && text.startsWith('<!--', i)) {
			const close = text.indexOf('-->', i + 4);
			const comment_end = close === -1 || close + 3 > end ? end : close + 3;
			l.leaf(T_COMMENT, i, comment_end);
			return comment_end;
		}
		if (i + 9 <= end && matches_ci(text, i + 2, 'doctype')) {
			let j = i + 9;
			while (j < end) {
				const c = text.charCodeAt(j);
				if (c === 62) break; // >
				if (c === 91) {
					// [ internal subset — skip to the matching ]
					const close_bracket = text.indexOf(']', j + 1);
					j = close_bracket === -1 || close_bracket >= end ? end : close_bracket + 1;
					continue;
				}
				j++;
			}
			const doctype_end = j < end ? j + 1 : end;
			l.leaf(T_DOCTYPE, i, doctype_end);
			return doctype_end;
		}
		if (
			i + 9 <= end &&
			text.charCodeAt(i + 2) === 91 &&
			matches_ci(text, i + 3, 'cdata') &&
			text.charCodeAt(i + 8) === 91
		) {
			const close = text.indexOf(']]>', i + 9);
			const cdata_end = close === -1 || close + 3 > end ? end : close + 3;
			l.leaf(T_CDATA, i, cdata_end);
			return cdata_end;
		}
	} else if (c1 === 63) {
		// <? processing instruction
		const close = text.indexOf('?>', i + 2);
		const pi_end = close === -1 || close + 2 > end ? end : close + 2;
		l.leaf(T_PROCESSING_INSTRUCTION, i, pi_end);
		return pi_end;
	}
	const after_tag = lex_markup_tag(l, i, end, mode, cache);
	// rawtext elements — opening tags only; a self-closing slash is ignored
	// (per HTML parsing, `<script/>` still opens script data)
	if (mode.script_embed !== null && after_tag > i + 1 && text.charCodeAt(i + 1) !== 47) {
		const raw_name = rawtext_name_at(text, i + 1, end, mode.rcdata);
		if (raw_name !== null) {
			return lex_markup_rawtext(l, raw_name, after_tag, end, mode, cache);
		}
	}
	return after_tag;
};

/**
 * The shared markup window lexer — lexes `[l.pos, l.end)` per `mode`.
 * The entry point for the html/xml registrations here and for `lexer_svelte`.
 */
export const lex_markup_window = (l: Lexer, mode: MarkupLexMode): void => {
	const { text, end } = l;
	const { lex_expression } = mode;
	const cache = create_markup_probe_cache();
	let i = l.pos;
	while (i < end) {
		cache.lt = advance_probe(text, cache.lt, i, '<');
		let next = cache.lt >= end ? end : cache.lt;
		if (lex_expression !== null) {
			cache.brace = advance_probe(text, cache.brace, i, '{');
			if (cache.brace < next) next = cache.brace;
		}
		if (next > i) lex_markup_entities(l, i, next, cache);
		if (next >= end) break;
		i =
			text.charCodeAt(next) === 123
				? lex_expression!(l, next, end, true)
				: lex_markup_construct(l, next, end, mode, cache);
	}
	l.pos = end;
};

const lex_markup_html = (l: Lexer): void => {
	lex_markup_window(l, MARKUP_MODE_HTML);
};

const lex_markup_xml = (l: Lexer): void => {
	lex_markup_window(l, MODE_XML);
};

/**
 * The HTML markup language registration for the lexer engine.
 */
export const lexer_markup: SyntaxLang = {
	id: 'markup',
	aliases: ['html', 'mathml', 'svg'],
	lex: lex_markup_html
};

/**
 * The XML language registration — the same scanner without HTML's rawtext
 * elements or `style=`/`on*=` attribute embedding.
 */
export const lexer_xml: SyntaxLang = {
	id: 'xml',
	aliases: ['ssml', 'atom', 'rss'],
	lex: lex_markup_xml
};
