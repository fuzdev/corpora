<script lang="ts">
	import type { Snippet } from 'svelte';
	import { DEV } from 'esm-env';
	import type { SvelteHTMLElements } from 'svelte/elements';

	import { syntax_styler_global } from './syntax_styler_global.ts';
	import type { SyntaxStyler } from './syntax_styler.ts';

	const {
		content,
		dangerous_raw_html,
		lang = 'svelte',
		inline = false,
		wrap = false,
		nomargin = false,
		syntax_styler = syntax_styler_global,
		children,
		...rest
	}: SvelteHTMLElements['code'] &
		(
			| {
					/** The source code to syntax highlight. */
					content: string;
					dangerous_raw_html?: undefined;
			  }
			| {
					content?: undefined;
					/**
					 * Pre-highlighted HTML from the `svelte_preprocess_fuz_code` preprocessor.
					 * When provided, skips runtime syntax highlighting entirely.
					 *
					 * Named `dangerous_raw_html` to signal that it bypasses sanitization,
					 * matching the `{@html}` pattern already used by this component.
					 */
					dangerous_raw_html: string;
			  }
		) & {
			/**
			 * Language identifier (e.g. 'ts', 'css', 'html', 'json', 'svelte', 'md').
			 * Selects the registered lexer and sets the `data-lang` attribute. `null`
			 * disables highlighting (content renders as plain text); `undefined`
			 * falls back to the default ('svelte').
			 *
			 * @default 'svelte'
			 */
			lang?: string | null;
			/**
			 * Whether to render as inline code instead of a block.
			 *
			 * @default false
			 */
			inline?: boolean;
			/**
			 * Whether to wrap long lines in block code (`white-space: pre-wrap`
			 * instead of `pre`). Wraps at whitespace — long unbroken tokens (URLs,
			 * hashes) still scroll horizontally. Ignored for inline code.
			 *
			 * @default false
			 */
			wrap?: boolean;
			/**
			 * Whether to disable the default margin-bottom on block code
			 * (`var(--space_lg)` when not `:last-child`).
			 *
			 * @default false
			 */
			nomargin?: boolean;
			/**
			 * Custom `SyntaxStyler` instance, e.g. with different languages registered.
			 *
			 * @default syntax_styler_global
			 */
			syntax_styler?: SyntaxStyler;
			/**
			 * Optional snippet to customize how the highlighted markup is rendered.
			 * Receives the generated HTML string as a parameter.
			 */
			children?: Snippet<[markup: string]>;
		} = $props();

	const language_supported = $derived(lang !== null && syntax_styler.has_lang(lang));

	const highlighting_disabled = $derived(lang === null || !language_supported);

	// DEV-only validation warnings
	if (DEV) {
		$effect(() => {
			if (dangerous_raw_html != null) return;

			if (lang && !language_supported) {
				const langs = [...syntax_styler.langs.keys()].join(', ');
				// eslint-disable-next-line no-console
				console.error(
					`[Code] Language "${lang}" is not supported. ` +
						`Highlighting disabled. Supported: ${langs}`
				);
			}
		});
	}

	// Generate HTML markup for syntax highlighting
	const html_content = $derived.by(() => {
		if (dangerous_raw_html != null) return dangerous_raw_html;
		if (!content || highlighting_disabled) return '';
		return syntax_styler.stylize(content, lang!); // ! is safe bc of the `highlighting_disabled` calculation
	});
</script>

<!-- eslint-disable svelte/no-at-html-tags -->

<code {...rest} class:inline class:wrap class:nomargin data-lang={lang}
	>{#if highlighting_disabled && dangerous_raw_html == null}{content}{:else if children}{@render children(
			html_content
		)}{:else}{@html html_content}{/if}</code
>

<style>
	/* inline code inherits fuz_css defaults: pre-wrap, inline-block, baseline alignment */

	code:not(.inline) {
		/* block code: traditional no-wrap, horizontal scroll */
		white-space: pre;
		padding: var(--space_xs3) var(--space_xs);
		display: block;
		overflow: auto;
		max-width: 100%;
	}

	code.wrap:not(.inline) {
		/* unset what we set above, otherwise rely on fuz_css base styles */
		white-space: pre-wrap;
	}

	code:not(.inline):not(.nomargin):not(:last-child) {
		margin-bottom: var(--space_lg);
	}
</style>
