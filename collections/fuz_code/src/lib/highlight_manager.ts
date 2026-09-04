import { DEV } from 'esm-env';

import type { LexedSyntax, TokenTypeInfo } from './lexer.ts';
import { highlight_priorities } from './highlight_priorities.ts';

export type HighlightMode = 'auto' | 'ranges' | 'html';

/**
 * Checks for CSS Highlights API support.
 */
export const supports_css_highlight_api = (): boolean =>
	!!(globalThis.CSS?.highlights && globalThis.Highlight);

/**
 * How a manager builds ranges for the Highlight API.
 *
 * `StaticRange` is preferred: it's an immutable snapshot the browser does *not*
 * track across DOM mutations. Since highlights are rebuilt wholesale whenever
 * content changes, liveness buys nothing and only costs per-mutation boundary
 * bookkeeping and paint work — the main efficiency (and Safari-stability) lever.
 * Falls back to a live `Range` where `StaticRange` is unavailable.
 */
type RangeKind = 'static' | 'live';

const detect_range_kind = (): RangeKind =>
	typeof globalThis.StaticRange === 'function' ? 'static' : 'live';

/**
 * Finds the first text node child of `element`, or `null` if there is none.
 *
 * The text node might not be `firstChild` because frameworks (e.g. Svelte) can
 * insert comment/anchor nodes around it.
 */
const find_text_node = (element: Element): Node | null => {
	for (const node of element.childNodes) {
		if (node.nodeType === Node.TEXT_NODE) return node;
	}
	return null;
};

const push_range = (
	ranges_by_name: Map<string, Array<AbstractRange>>,
	name: string,
	range: AbstractRange
): void => {
	const existing = ranges_by_name.get(name);
	if (existing) {
		existing.push(range);
	} else {
		ranges_by_name.set(name, [range]);
	}
};

/**
 * Prefixed highlight names (`token_<name>` plus one per alias) per token type,
 * computed once per type instead of once per token — the ranges-path analog of
 * the registry's precomputed `open_tag`. Module-level so managers share it;
 * keyed weakly so custom registries' infos don't leak.
 */
const highlight_names_cache: WeakMap<TokenTypeInfo, Array<string>> = new WeakMap();

const highlight_names_of = (info: TokenTypeInfo): Array<string> => {
	let names = highlight_names_cache.get(info);
	if (names === undefined) {
		names = [`token_${info.name}`];
		for (const alias of info.aliases) names.push(`token_${alias}`);
		highlight_names_cache.set(info, names);
	}
	return names;
};

/**
 * Manages CSS Custom Highlight API ranges for a single element's text node.
 * Tracks ranges per element and only removes its own ranges when clearing,
 * cooperating with other managers that share the global `CSS.highlights` registry.
 *
 * **Experimental** — limited browser support. Use `Code.svelte` for production
 * block code; this powers the experimental `CodeHighlight` and `CodeTextarea`.
 *
 * @example
 * ```ts
 * const manager = new HighlightManager();
 * manager.highlight_from_lexed(element, syntax_styler_global.lex(text, 'ts'));
 * ```
 */
export class HighlightManager {
	/**
	 * This manager's ranges, keyed by prefixed highlight name (e.g. `token_keyword`).
	 * A single range object may be shared across several names (a token type plus
	 * its aliases), since one range can belong to multiple `Highlight` sets.
	 */
	element_ranges: Map<string, Array<AbstractRange>>;

	#range_kind: RangeKind;

	constructor() {
		if (!supports_css_highlight_api()) {
			throw Error('CSS Highlights API not supported');
		}
		this.element_ranges = new Map();
		this.#range_kind = detect_range_kind();
	}

	/**
	 * Highlights `element`'s text node from a lexed event stream. Ranges come
	 * straight from event offsets — no position reconstruction. Clears this
	 * manager's previous ranges first.
	 *
	 * A missing text node is a no-op. Offsets past the text node's length are
	 * clamped (a DOM/source mismatch is the caller's concern, not a throw here).
	 */
	highlight_from_lexed(element: Element, lexed: LexedSyntax): void {
		this.clear_element_ranges();

		const text_node = find_text_node(element);
		if (!text_node) {
			if (lexed.events_len > 0) {
				if (DEV) {
					throw new Error('no text node to highlight');
				} else {
					// eslint-disable-next-line no-console
					console.error('[HighlightManager] tokens present but no text node to highlight');
				}
			}
			return;
		}

		try {
			this.#apply(text_node, lexed);
		} catch (err) {
			// some engines may reject `StaticRange` in `Highlight.add` -- fall back to
			// live `Range` once rather than letting the throw escape into the effect
			if (this.#range_kind === 'static') {
				this.#range_kind = 'live';
				this.clear_element_ranges(); // undo any partial application
				this.#apply(text_node, lexed);
			} else {
				throw err;
			}
		}
	}

	#apply(text_node: Node, lexed: LexedSyntax): void {
		const ranges_by_name: Map<string, Array<AbstractRange>> = new Map();
		this.#collect_ranges(lexed, text_node, ranges_by_name);

		// TODO: cross-instance coupling -- all managers share one global `Highlight`
		// per token type, so re-highlighting one element (e.g. a textarea on every
		// keystroke) mutates highlights that also hold ranges from every other code
		// block on the page, forcing the browser to re-evaluate the shared set.
		// Isolating per-instance needs unique highlight names + runtime-injected
		// `::highlight()` CSS (≈50 token types × N instances), trading the static
		// theme file for generated CSS. Only worth it with many concurrently-updating
		// instances; revisit if profiling shows it.
		for (const [name, ranges] of ranges_by_name) {
			this.element_ranges.set(name, ranges);

			let highlight = CSS.highlights.get(name);
			if (!highlight) {
				highlight = new Highlight();
				// priority follows CSS cascade order (higher = later in CSS = wins)
				highlight.priority = highlight_priorities[name as keyof typeof highlight_priorities] ?? 0;
				CSS.highlights.set(name, highlight);
			}

			for (const range of ranges) {
				highlight.add(range);
			}
		}
	}

	/**
	 * Clears only this manager's ranges from the shared highlights. Defensive:
	 * a highlight may already be gone (e.g. another manager removed the last
	 * range, or HMR reset the registry), which is a valid state, not an error.
	 */
	clear_element_ranges(): void {
		for (const [name, ranges] of this.element_ranges) {
			const highlight = CSS.highlights.get(name);
			if (!highlight) continue;

			for (const range of ranges) {
				highlight.delete(range);
			}

			if (highlight.size === 0) {
				CSS.highlights.delete(name);
			}
		}

		this.element_ranges.clear();
	}

	destroy(): void {
		this.clear_element_ranges();
	}

	#make_range(text_node: Node, start: number, end: number): AbstractRange {
		if (this.#range_kind === 'static') {
			return new StaticRange({
				startContainer: text_node,
				startOffset: start,
				endContainer: text_node,
				endOffset: end
			});
		}
		const range = new Range();
		range.setStart(text_node, start);
		range.setEnd(text_node, end);
		return range;
	}

	/**
	 * Walks the flat event stream, collecting one range per token (leaf or
	 * container, shared across its type and aliases) directly from event offsets.
	 * Offsets past the text node's length are clamped.
	 */
	#collect_ranges(
		lexed: LexedSyntax,
		text_node: Node,
		ranges_by_name: Map<string, Array<AbstractRange>>
	): void {
		const { events, events_len } = lexed;
		const { infos } = lexed.types;
		const text_length = text_node.textContent?.length ?? 0;
		// open containers awaiting their close, so a container's range spans
		// `[open_start, close_end)`
		const open_stack: Array<{ id: number; start: number }> = [];
		let i = 0;
		while (i < events_len) {
			const tag = events[i]!;
			if (tag > 0) {
				this.#push_token(
					infos[tag]!,
					events[i + 1]!,
					events[i + 2]!,
					text_node,
					ranges_by_name,
					text_length
				);
				i += 3;
			} else if (tag < 0) {
				open_stack.push({ id: -tag, start: events[i + 1]! });
				i += 2;
			} else {
				const open = open_stack.pop();
				if (open) {
					this.#push_token(
						infos[open.id]!,
						open.start,
						events[i + 1]!,
						text_node,
						ranges_by_name,
						text_length
					);
				}
				i += 2;
			}
		}
	}

	/**
	 * Pushes one range for `[start, end)` (clamped to `text_length`), shared
	 * across the token type's own class and each of its aliases — the same range
	 * object can belong to multiple `Highlight` sets. Names come precomputed
	 * from `highlight_names_of`, so nothing allocates per token here except the
	 * range itself.
	 */
	#push_token(
		info: TokenTypeInfo,
		start: number,
		end: number,
		text_node: Node,
		ranges_by_name: Map<string, Array<AbstractRange>>,
		text_length: number
	): void {
		const safe_end = end > text_length ? text_length : end;
		if (safe_end <= start) return;
		const range = this.#make_range(text_node, start, safe_end);
		for (const name of highlight_names_of(info)) {
			push_range(ranges_by_name, name, range);
		}
	}
}
