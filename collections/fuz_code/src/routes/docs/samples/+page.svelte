<script lang="ts">
	// the Highlight API rules live in theme_highlight.css (not theme.css)
	import '$lib/theme_highlight.css';

	import { page } from '$app/state';
	import { SvelteSet } from 'svelte/reactivity';
	import { DOCS_PATH } from '@fuzdev/fuz_ui/docs_helpers.svelte.ts';
	import { tome_get_by_slug } from '@fuzdev/fuz_ui/tome.ts';
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import TomeLink from '@fuzdev/fuz_ui/TomeLink.svelte';
	import DeclarationLink from '@fuzdev/fuz_ui/DeclarationLink.svelte';

	import Code from '$lib/Code.svelte';
	import CodeHighlight from '$lib/CodeHighlight.svelte';
	import { sample_langs } from '$lib/code_sample.ts';
	import { samples } from '$routes/samples/all.ts';
	import { lang_colors } from '$routes/lang_color.ts';

	const TOME_SLUG = 'samples';
	const tome = tome_get_by_slug(TOME_SLUG);

	// `DocsContent` mounts every tome inline on the `/docs` index; render a stub
	// there so the full interactive sample grid only renders on this route.
	const at_root = $derived(page.url.pathname === DOCS_PATH);

	// language filter — every language shown at first, toggle each off/on
	const shown_langs = new SvelteSet<string>(sample_langs);
	const toggle_lang = (lang: string): void => {
		if (shown_langs.has(lang)) shown_langs.delete(lang);
		else shown_langs.add(lang);
	};

	// `all` flips the whole row between every language and none
	const all_shown = $derived(shown_langs.size === sample_langs.length);
	const toggle_all = (): void => {
		if (all_shown) shown_langs.clear();
		else for (const lang of sample_langs) shown_langs.add(lang);
	};

	// renderer toggles — HTML (`Code`) on by default, the experimental CSS
	// Custom Highlight API (`CodeHighlight` ranges) off by default; with both
	// on, each sample renders side by side
	let show_html = $state(true);
	let show_highlight = $state(false);

	// each renderer takes half the row when both show, otherwise the full width
	const column_width = $derived(show_html && show_highlight ? '50%' : '100%');

	const shown_samples = $derived(
		Object.values(samples).filter((sample) => shown_langs.has(sample.lang))
	);
</script>

<TomeContent {tome}>
	{#if at_root}
		<section>
			<p>
				Syntax-highlighted <TomeLink slug="samples" /> in every supported language, rendered with
				<DeclarationLink name="Code" /> and the experimental <DeclarationLink
					name="CodeHighlight"
				/>.
			</p>
		</section>
	{:else}
		<section>
			<p>
				Code samples in every supported language. Filter by language and toggle the renderers:
				<DeclarationLink name="Code" /> (standard HTML with <code>.token_*</code> classes) and the
				experimental <DeclarationLink name="CodeHighlight" /> (CSS Custom Highlight API, ranges). With
				both on, each sample renders side by side.
			</p>

			<div class="row gap_xs flex-wrap:wrap mb_md">
				{#each sample_langs as lang (lang)}
					<button
						type="button"
						class="sm deselectable {lang_colors[lang]}"
						class:selected={shown_langs.has(lang)}
						onclick={() => toggle_lang(lang)}
					>
						{lang}
					</button>
				{/each}
				<button
					type="button"
					class="sm deselectable"
					class:selected={all_shown}
					onclick={toggle_all}
				>
					all
				</button>
			</div>

			<div class="row gap_xs flex-wrap:wrap mb_lg">
				<button
					type="button"
					class="deselectable"
					class:selected={show_html}
					onclick={() => (show_html = !show_html)}
				>
					html renderer
				</button>
				<button
					type="button"
					class="deselectable"
					class:selected={show_highlight}
					onclick={() => (show_highlight = !show_highlight)}
				>
					highlight renderer
				</button>
			</div>

			{#if show_highlight}
				<aside class="panel p_md mb_lg">
					<p>
						⚠️ <strong>Experimental:</strong> the <code>highlight</code> renderer uses the
						<a href="https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API"
							>CSS Custom Highlight API</a
						>, which has limited browser support and can't apply layout-affecting styles like font
						weight (<a href="https://github.com/w3c/csswg-drafts/issues/8355">csswg-drafts#8355</a
						>). It requires <code>theme_highlight.css</code> instead of <code>theme.css</code>.
					</p>
				</aside>
			{/if}

			{#each shown_samples as sample (sample.name)}
				<section class="box mb_xl3">
					<h3 class="panel p_md mb_xs width:100% box">{sample.lang}</h3>
					<div class="renderers">
						{#if show_html}
							<div style:width={column_width}>
								<Code content={sample.content} lang={sample.lang} />
							</div>
						{/if}
						{#if show_highlight}
							<div style:width={column_width}>
								<CodeHighlight content={sample.content} lang={sample.lang} mode="ranges" />
							</div>
						{/if}
					</div>
					{#if !show_html && !show_highlight}
						<p class="color_e_50">Select a renderer above.</p>
					{/if}
				</section>
			{/each}
		</section>
	{/if}
</TomeContent>

<style>
	.renderers {
		max-width: 100%;
		display: flex;
		gap: var(--space_md);
		align-items: flex-start;
	}
	/* width is set inline (50% when both renderers show, else 100%); min-width:0
	   lets the column shrink to that width so the code scrolls internally */
	.renderers > div {
		min-width: 0;
	}
</style>
