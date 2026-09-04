<script lang="ts">
	// the Highlight API rules live in theme_highlight.css (not theme.css)
	import '$lib/theme_highlight.css';

	import { page } from '$app/state';
	import { DOCS_PATH } from '@fuzdev/fuz_ui/docs_helpers.svelte.ts';
	import { tome_get_by_slug } from '@fuzdev/fuz_ui/tome.ts';
	import TomeContent from '@fuzdev/fuz_ui/TomeContent.svelte';
	import TomeLink from '@fuzdev/fuz_ui/TomeLink.svelte';
	import DeclarationLink from '@fuzdev/fuz_ui/DeclarationLink.svelte';

	import { supports_css_highlight_api } from '$lib/highlight_manager.ts';
	import CodeTextarea from '$lib/CodeTextarea.svelte';
	import { sample_langs, type SampleLang } from '$lib/code_sample.ts';
	import { samples } from '$routes/samples/all.ts';
	import { lang_colors } from '$routes/lang_color.ts';

	const TOME_SLUG = 'textarea';
	const tome = tome_get_by_slug(TOME_SLUG);

	// `DocsContent` mounts every tome inline on the `/docs` index; render a stub
	// there so the live editor only mounts on this route.
	const at_root = $derived(page.url.pathname === DOCS_PATH);

	const supported = supports_css_highlight_api();

	let lang: SampleLang = $state('ts');

	const sample_for = (l: string): string =>
		Object.values(samples).find((s) => s.lang === l)?.content ?? '';

	let value = $state(sample_for('ts'));

	const select_lang = (l: SampleLang): void => {
		lang = l;
		value = sample_for(l);
	};
</script>

<TomeContent {tome}>
	{#if at_root}
		<section>
			<p>
				An experimental editable, live-highlighted <TomeLink slug="textarea" /> backed by
				<DeclarationLink name="CodeTextarea" />.
			</p>
		</section>
	{:else}
		<section>
			<p>
				<DeclarationLink name="CodeTextarea" /> highlights an editable <code>&lt;textarea&gt;</code>
				live using the
				<a href="https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API"
					>CSS Custom Highlight API</a
				>. Type below to see it re-highlight. Requires <code>theme_highlight.css</code>.
			</p>
			{#if !supported}
				<p class="color_e_50">
					⚠️ This browser does not support the CSS Custom Highlight API — the textarea still works,
					but text is shown without highlighting.
				</p>
			{/if}

			<div class="row gap_xs flex-wrap:wrap mb_md">
				{#each sample_langs as l (l)}
					<button
						type="button"
						class="sm {lang_colors[l]}"
						class:selected={l === lang}
						onclick={() => select_lang(l)}
					>
						{l}
					</button>
				{/each}
			</div>

			<CodeTextarea bind:value {lang} />
		</section>
	{/if}
</TomeContent>

<style>
	/* the editor defaults to fuz_css's 100px textarea height — give the demo room */
	section :global(.code_textarea textarea) {
		height: 600px;
	}
</style>
