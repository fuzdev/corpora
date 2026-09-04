<script lang="ts">
	// the Highlight API rules live in theme_highlight.css (not theme.css), and are
	// only needed here — keep them in the lazy playground bundle, off the other routes
	import '@fuzdev/fuz_code/theme_highlight.css';

	import Code from '@fuzdev/fuz_code/Code.svelte';
	import CodeTextarea from '@fuzdev/fuz_code/CodeTextarea.svelte';
	import { supports_css_highlight_api } from '@fuzdev/fuz_code/highlight_manager.ts';
	import CopyToClipboard from '@fuzdev/fuz_ui/CopyToClipboard.svelte';
	import { to_error_message } from '@fuzdev/fuz_util/error.ts';

	import { playground_example } from './playground_example.ts';

	// `@fuzdev/tsv_wasm` is loaded lazily, in the browser only — a dynamic import
	// so the ~900KB-gzipped WASM lands in its own chunk, fetched the first time this
	// component mounts and never pulled into `/docs` or the prerendered HTML.
	let tsv: typeof import('@fuzdev/tsv_wasm') | null = $state(null);
	let load_error: string | null = $state(null);

	// the editable source — starts as the deliberately-unformatted example so the
	// formatted pane visibly cleans it up
	let source = $state(playground_example);

	const ready = $derived(tsv !== null);

	// A tsv call's outcome: its string result, or the thrown error's message.
	type Outcome = { value: string; error: null } | { value: null; error: string };

	// Run a tsv call, capturing a thrown error as a message; `null` until the WASM
	// loads. Lets `formatted` and `ast` share one shape and recompute as `source` changes
	// — no blur or button.
	const run = (fn: (t: NonNullable<typeof tsv>) => string): Outcome | null => {
		if (!tsv) return null;
		try {
			return { value: fn(tsv), error: null };
		} catch (err) {
			return { value: null, error: to_error_message(err) };
		}
	};

	const formatted = $derived.by(() => run((t) => t.format_svelte(source)));
	const ast = $derived.by(() => run((t) => JSON.stringify(t.parse_svelte(source), null, 2)));

	// format and parse fail together on malformed input — surface one message, not two
	const error = $derived(formatted?.error ?? ast?.error ?? null);

	// CodeTextarea highlights via the experimental CSS Custom Highlight API; where
	// it's unsupported the editor still works but shows no token colors. Defaulting to
	// `true` and flipping it in a browser-only effect keeps the note out of the
	// prerendered HTML (a plain `$derived` would render it server-side and mismatch on
	// hydration), so the lint rule's writable-derived suggestion doesn't apply here.
	// eslint-disable-next-line svelte/prefer-writable-derived
	let highlight_supported = $state(true);
	$effect(() => {
		highlight_supported = supports_css_highlight_api();
	});

	$effect(() => {
		if (tsv) return;
		let cancelled = false;
		void (async () => {
			try {
				const mod = await import('@fuzdev/tsv_wasm');
				await mod.init();
				if (cancelled) return;
				tsv = mod;
			} catch (err) {
				if (!cancelled) load_error = to_error_message(err);
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	const is_base = $derived(source === playground_example);

	const reset = (): void => {
		source = playground_example;
	};

	// format the editable source in place — writes the formatted result back into
	// the editor; no-op while the WASM is loading or the input doesn't parse
	const format = (): void => {
		if (!formatted || formatted.error !== null) return;
		source = formatted.value;
	};
</script>

<header class="row mb_xs">
	<button type="button" class="plain" onclick={reset} disabled={!ready || is_base}>reset</button>
	<button type="button" class="plain" onclick={format} disabled={!ready || error !== null}>
		format
	</button>
</header>

{#if load_error}
	<p class="error">Couldn't load the tsv formatter: {load_error}</p>
{/if}

{#if !highlight_supported}
	<p>
		This browser doesn't support live syntax highlighting — the editor still works without token
		colors.
	</p>
{/if}

<section>
	<CodeTextarea bind:value={source} lang="svelte" autocapitalize="off" autocomplete="off" />
	{#if !ready}
		<p>loading the formatter…</p>
	{:else if error}
		<p class="parse_error">{error}</p>
	{:else}
		<p>formatted</p>
		<Code lang="svelte" content={formatted?.value ?? ''} />
		<p>AST</p>
		<div class="ast_output">
			<CopyToClipboard text={ast?.value ?? ''} class="ast_copy" />
			<Code lang="json" content={ast?.value ?? ''} class="ast" />
		</div>
	{/if}
</section>

<style>
	/* The section stacks in normal flow — fuz_css's flow margins space the <p>
	   labels and block `Code` brings its own bottom margin; only the editor wrapper
	   isn't a flow element, so give it the matching margin. */
	section :global(.code_textarea) {
		margin-bottom: var(--space_lg);
	}
	/* the editor defaults to fuz_css's 100px textarea height — give it room to work */
	section :global(.code_textarea textarea) {
		height: 500px;
	}
	/* cap the read-only panes so a long AST scrolls instead of running the page
	   (block `Code` already sets `overflow: auto`) */
	section :global(.ast) {
		max-height: 500px;
	}
	/* float a copy button over the AST pane's top-right corner; it stays pinned as
	   the pane scrolls since it's absolute to this wrapper, not inside the scroller */
	.ast_output {
		position: relative;
	}
	.ast_output :global(.ast_copy) {
		--font_size: var(--font_size_lg);
		position: absolute;
		top: var(--space_xs);
		/* clear the pane's scrollbar */
		right: var(--space_md);
		z-index: 1;
		background: var(--shade_00);
	}
	/* TODO hacky */
	.ast_output :global(.ast_copy > div) {
		width: auto !important;
	}
	.error {
		color: var(--color_e_40);
		white-space: pre-wrap;
	}
	.parse_error {
		color: var(--color_c_50);
		white-space: pre-wrap;
	}
</style>
