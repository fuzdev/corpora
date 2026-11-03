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

	// `@fuzdev/tsv-wasm` is loaded lazily, in the browser only — a dynamic import
	// so the ~1MB-gzipped wasm lands in its own chunk, fetched the first time this
	// component mounts and never pulled into `/docs` or the prerendered HTML.
	let tsv: typeof import('@fuzdev/tsv-wasm') | null = $state(null);
	let load_error: string | null = $state(null);

	// the editable source — starts as the deliberately-unformatted example so the
	// formatted pane visibly cleans it up
	let source = $state(playground_example);

	const ready = $derived(tsv !== null);

	// A tsv call's outcome: its string result, or its error's message.
	type Outcome = { value: string; error: null } | { value: null; error: string };

	// A returned error as the CLI prints it: the one-line message, then the excerpt
	// and caret.
	const to_outcome_error = (error: { message: string; frame: string }): Outcome => ({
		value: null,
		error: `${error.message}\n${error.frame}`
	});

	// An out-of-bounds engine trap throws this message, and unlike a parse error it can
	// poison the instance: later calls may throw the same thing. Deep nesting no
	// longer reaches it — the parsers refuse it as an ordinary error.
	const WASM_TRAP_MESSAGE = 'memory access out of bounds';

	// Run a tsv call, capturing a thrown error as a message; `null` until the wasm
	// loads. A parse error comes back in the call's result, so only an engine failure
	// like the trap throws. Lets `formatted` and `ast` share one shape and recompute
	// as `source` changes — no blur or button.
	const run = (fn: (t: NonNullable<typeof tsv>) => Outcome): Outcome | null => {
		if (!tsv) return null;
		try {
			return fn(tsv);
		} catch (err) {
			const message = to_error_message(err);
			if (!message.includes(WASM_TRAP_MESSAGE)) return { value: null, error: message };
			// swap in a fresh instance, or the editor stays dead until a reload
			let reloaded = true;
			try {
				tsv.reinstantiate();
			} catch {
				reloaded = false;
			}
			return {
				value: null,
				error: reloaded
					? "tsv's wasm engine trapped on this input and was reloaded."
					: "tsv's wasm engine trapped on this input and could not be reloaded; refresh the page."
			};
		}
	};

	const formatted = $derived.by(() =>
		run((t) => {
			const result = t.format_svelte(source);
			return result.ok ? { value: result.code, error: null } : to_outcome_error(result.error);
		})
	);

	// The AST pane trails the editor by an idle beat while the formatted pane stays
	// live. Formatting is cheap (~1 ms on a 9 KB component), but the AST is parsed,
	// serialized to JSON, and syntax-highlighted — many times the source's size,
	// more again with `locations` on — and rebuilding that DOM per keystroke is what
	// a large paste feels. The default example is small enough that the delay never
	// shows.
	const AST_DEBOUNCE_MS = 150;
	// seeded from the example, like `source`, so the first render has an AST to show
	let ast_source = $state(playground_example);
	$effect(() => {
		const next = source;
		const id = setTimeout(() => (ast_source = next), AST_DEBOUNCE_MS);
		return () => clearTimeout(id);
	});
	// off by default, as in the parsers: the AST is span-only (`start`/`end` offsets)
	// until `{locations: true}` asks for line and column on every node
	let locations = $state(false);
	const ast = $derived.by(() =>
		run((t) => {
			const result = t.parse_svelte(ast_source, { locations });
			return result.ok
				? { value: JSON.stringify(result.ast, null, 2), error: null }
				: to_outcome_error(result.error);
		})
	);

	// The top-level error is the LIVE pane's, so it tracks what is in the editor now;
	// the AST pane renders its own beside its (debounced, possibly still-broken)
	// source rather than folding it in here, where it would read as a message about
	// text the user has already fixed.
	const error = $derived(formatted?.error ?? null);

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
		let cancelled = false;
		void (async () => {
			try {
				const mod = await import('@fuzdev/tsv-wasm');
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
	// the editor; no-op while the wasm is loading or the input doesn't parse
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

{#if !highlight_supported}
	<p>
		This browser doesn't support live syntax highlighting — the editor still works without token
		colors.
	</p>
{/if}

<section>
	<CodeTextarea bind:value={source} lang="svelte" autocapitalize="off" autocomplete="off" />
	{#if load_error}
		<p class="error">Couldn't load tsv: {load_error}</p>
	{:else if !ready}
		<p>loading tsv…</p>
	{:else if error}
		<p class="error">{error}</p>
	{:else}
		<p>formatted:</p>
		<Code lang="svelte" content={formatted?.value ?? ''} />
		<p>AST:</p>
		<label class="row">
			<input type="checkbox" bind:checked={locations} style:margin-right="var(--space_sm)" />
			<Code lang="ts" content={'{locations: true}'} inline />
		</label>
		{#if ast?.error}
			<!-- the debounced source can still be the broken one the live pane has
				already moved past, so this pane carries its own message -->
			<p class="error">{ast.error}</p>
		{:else}
			<div class="ast-output">
				<CopyToClipboard text={ast?.value ?? ''} class="ast-copy" />
				<Code lang="json" content={ast?.value ?? ''} class="ast" />
			</div>
		{/if}
	{/if}
</section>

<style>
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
	.ast-output {
		position: relative;
	}
	.ast-output :global(.ast-copy) {
		--font_size: var(--font_size_lg);
		position: absolute;
		top: var(--space_xs);
		/* clear the pane's scrollbar */
		right: var(--space_md);
		z-index: 1;
		background: var(--shade_00);
	}
	/* TODO hacky: fuz_ui's CopyToClipboard sets an inline `style:width="100%"` on
	   its icon wrapper div, which only `!important` can beat from here — drop this
	   once that wrapper stops hardcoding its width */
	.ast-output :global(.ast-copy > div) {
		width: auto !important;
	}
	.error {
		color: var(--palette_c_50);
		white-space: pre-wrap;
	}
</style>
