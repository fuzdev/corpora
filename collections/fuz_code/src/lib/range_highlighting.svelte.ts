import { onDestroy } from 'svelte';
import { DEV } from 'esm-env';

import type { SyntaxStyler } from './syntax_styler.ts';
import { HighlightManager, supports_css_highlight_api } from './highlight_manager.ts';

/**
 * Reactive inputs for `RangeHighlighting`. All values are getters so the
 * class can track the consuming component's reactive state across the call
 * boundary (the Svelte 5 getter-injection pattern).
 */
export interface RangeHighlightingOptions {
	/** The element whose first text node receives the highlight ranges. */
	element: () => Element | undefined;
	/**
	 * The text to tokenize. Must match the element's text node exactly (e.g. a
	 * textarea backdrop includes its trailing newline here too).
	 */
	text: () => string;
	/** Language id; `null` disables highlighting. */
	lang: () => string | null;
	/** The syntax styler whose registered languages back `lang` lookups. */
	syntax_styler: () => SyntaxStyler;
	/** Extra gate — ranges are only applied when this returns true. Defaults to always-on. */
	enabled?: () => boolean;
	/** Component name used in DEV warnings. */
	dev_label: string;
}

/**
 * Wires up CSS Custom Highlight API range highlighting for a single element's
 * text node, shared by `CodeHighlight` and `CodeTextarea`. Creates a
 * `HighlightManager`, memoizes tokenization, applies/clears ranges in an effect,
 * emits DEV warnings for unsupported languages, and tears down on destroy.
 *
 * Must be constructed during component initialization (it uses `$effect`/`onDestroy`).
 */
export class RangeHighlighting {
	readonly #options: RangeHighlightingOptions;
	readonly #manager: HighlightManager | null;
	readonly #is_enabled: () => boolean;

	readonly #language_supported: boolean = $derived.by(() => {
		const lang = this.#options.lang();
		return lang !== null && this.#options.syntax_styler().has_lang(lang);
	});

	readonly highlighting_disabled: boolean = $derived.by(
		() => this.#options.lang() === null || !this.#language_supported
	);

	// lex once per (text, lang) change -- memoized so unrelated reactivity doesn't
	// trigger a full re-lex (`! safe bc of `highlighting_disabled`)
	readonly #range_lexed = $derived.by(() => {
		if (!this.#manager || !this.#is_enabled() || this.highlighting_disabled) return null;
		const text = this.#options.text();
		if (!text) return null;
		return this.#options.syntax_styler().lex(text, this.#options.lang()!);
	});

	constructor(options: RangeHighlightingOptions) {
		this.#options = options;
		this.#is_enabled = options.enabled ?? (() => true);
		const manager = (this.#manager = supports_css_highlight_api() ? new HighlightManager() : null);

		if (manager) {
			$effect(() => {
				const element = options.element();
				if (!element || !this.#range_lexed) {
					manager.clear_element_ranges();
					return;
				}
				manager.highlight_from_lexed(element, this.#range_lexed);
			});
		}

		if (DEV) {
			$effect(() => {
				// a lang was requested but we can't highlight it (unknown id)
				if (options.lang() && this.highlighting_disabled) {
					const langs = [...options.syntax_styler().langs.keys()].join(', ');
					// eslint-disable-next-line no-console
					console.error(
						`[${options.dev_label}] Language "${options.lang()}" is not supported. ` +
							`Highlighting disabled. Supported: ${langs}`
					);
				}
			});
		}

		onDestroy(() => manager?.destroy());
	}
}
