<script lang="ts">
	/**
	 * A `<textarea>` with live syntax highlighting via the CSS Custom Highlight API.
	 *
	 * The text is rendered twice: an editable, visually-transparent `<textarea>`
	 * on top, and a backdrop `<pre>` mirror underneath whose text node receives
	 * the highlight ranges. The two share identical box metrics so characters line
	 * up exactly, and the backdrop is scroll-synced to the textarea.
	 *
	 * **Minimal by design**: this is a highlighted input, not a full editor. It
	 * does not provide line numbers, tab-to-indent, auto-resize, or undo handling
	 * — compose those on top via the spread `...rest` props and `bind:value`.
	 *
	 * **Experimental** — the Highlight API has limited browser support and cannot
	 * render font-weight/font-style. Requires importing `theme_highlight.css`.
	 */

	import type { SvelteHTMLElements } from 'svelte/elements';

	import { syntax_styler_global } from './syntax_styler_global.ts';
	import type { SyntaxStyler } from './syntax_styler.ts';
	import { RangeHighlighting } from './range_highlighting.svelte.ts';

	let {
		value = $bindable(''),
		lang = 'svelte',
		syntax_styler = syntax_styler_global,
		wrapper_attrs,
		...rest
	}: SvelteHTMLElements['textarea'] & {
		/** The editable source code. Bindable. */
		value?: string;
		/**
		 * Language identifier (e.g. 'ts', 'css', 'svelte'). `null` disables
		 * highlighting; `undefined` falls back to the default ('svelte').
		 */
		lang?: string | null;
		/** Custom `SyntaxStyler` instance (defaults to the global one). */
		syntax_styler?: SyntaxStyler;
		/**
		 * Attributes for the wrapper `<div>` — the layout box that the textarea
		 * fills and `resize` grows. Use it for sizing/layout classes, `style`,
		 * `id`, or container-level handlers. Its `class` is merged with the
		 * internal `code_textarea` class; `data-lang` stays component-controlled.
		 * (`...rest` spreads onto the `<textarea>`; the backdrop `<pre>` is
		 * internal and intentionally not exposed.)
		 */
		wrapper_attrs?: SvelteHTMLElements['div'];
	} = $props();

	// the backdrop <pre> holds the text node that gets highlighted *and* is the
	// scroll container kept in sync with the textarea
	let backdrop: HTMLElement | undefined = $state.raw();
	let textarea: HTMLTextAreaElement | undefined = $state.raw();

	// A trailing newline keeps the backdrop's last line aligned with the textarea:
	// a textarea shows an empty final line after a trailing "\n", which a <pre>
	// would otherwise collapse. Rendered as a single expression -> one text node,
	// and tokenized as-is so range positions match the text node exactly.
	const display_text = $derived(value + '\n');

	// eslint-disable-next-line no-new
	new RangeHighlighting({
		element: () => backdrop,
		text: () => display_text,
		lang: () => lang,
		syntax_styler: () => syntax_styler,
		dev_label: 'CodeTextarea'
	});

	// keep the (overflow-hidden) backdrop aligned with the textarea's scroll position
	const sync_scroll = () => {
		if (!backdrop || !textarea) return;
		backdrop.scrollTop = textarea.scrollTop;
		backdrop.scrollLeft = textarea.scrollLeft;
	};
</script>

<div {...wrapper_attrs} class={['code_textarea', wrapper_attrs?.class]} data-lang={lang}>
	<pre class="code_textarea_backdrop" aria-hidden="true" bind:this={backdrop}>{display_text}</pre>
	<textarea
		bind:this={textarea}
		spellcheck="false"
		{...rest}
		bind:value
		onscroll={(e) => {
			sync_scroll();
			rest.onscroll?.(e); // preserve a consumer-supplied handler
		}}></textarea>
</div>

<style>
	.code_textarea {
		position: relative;
	}

	/* The textarea keeps fuz_css's native textarea styling — padding, border (with
	   its hover/focus) and the page-inherited font size and tab size. Only the
	   overlay deltas are set: transparent text/background so the backdrop shows
	   through, a mono font, a visible caret (the text itself is transparent), and
	   `line-height: inherit` to undo the `line-height: normal` fuz_css forces on
	   inputs, so it tracks the page and matches the backdrop. */
	.code_textarea textarea {
		position: relative;
		z-index: 1;
		font-family: var(--font_family_mono);
		line-height: inherit;
		background-color: transparent;
		color: transparent;
		caret-color: var(--text_color);
	}

	/* The backdrop `pre` holds the highlighted text under the transparent textarea.
	   It's pulled out of flow so the textarea sizes the box; `inset: 0` fills and
	   clips it to that box (scroll-synced in JS). It mirrors the textarea's fuz_css
	   box — the same padding and border width — and overrides what fuz_css sets
	   differently on a `pre`: `white-space: pre`, and the flow margin that would
	   otherwise shrink this absolute box. */
	.code_textarea_backdrop {
		position: absolute;
		inset: 0;
		margin: 0;
		padding: var(--space_sm) var(--space_lg); /* fuz_css's textarea padding */
		border: var(--border_width) var(--border_style) transparent;
		white-space: pre-wrap;
		overflow: hidden;
		pointer-events: none;
		user-select: none;
	}

	/* both layers reserve a scrollbar gutter so the textarea's scrollbar can't
	   shrink its wrap width relative to the non-scrolling backdrop and drift the
	   highlights */
	.code_textarea_backdrop,
	.code_textarea textarea {
		scrollbar-gutter: stable;
	}
</style>
