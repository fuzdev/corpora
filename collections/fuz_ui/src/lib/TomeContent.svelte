<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { SvelteHTMLElements } from 'svelte/elements';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	import TomeHeader from './TomeHeader.svelte';
	import { tome_context, type Tome } from './tome.ts';
	import { DOCS_PATH_DEFAULT, docs_links_context } from './docs_helpers.svelte.ts';
	import { intersect } from './intersect.svelte.ts';

	const {
		tome,
		docs_path = DOCS_PATH_DEFAULT,
		header,
		children,
		...rest
	}: SvelteHTMLElements['section'] & {
		tome: Tome;
		docs_path?: string;
		header?: Snippet;
		children: Snippet;
	} = $props();

	const docs_links = docs_links_context.get();

	tome_context.set(() => tome);

	const fragment = $derived(tome.slug);

	const at_root = $derived(page.url.pathname === resolve(docs_path as any));
</script>

<section
	{...rest}
	class="tome-content width_atmost_md mb_xl9 {rest.class}"
	{@attach intersect(() =>
		at_root
			? ({ intersecting }) => {
					if (intersecting) {
						docs_links.fragments_onscreen.add(fragment);
					} else {
						docs_links.fragments_onscreen.delete(fragment);
					}
				}
			: null
	)}
>
	<header
		class="mb_xl3 position:sticky top:0"
		{@attach intersect(() =>
			at_root
				? null
				: ({ intersecting }) => {
						if (intersecting) {
							docs_links.fragments_onscreen.add(fragment);
						} else {
							docs_links.fragments_onscreen.delete(fragment);
						}
					}
		)}
	>
		{#if header}
			{@render header()}
		{:else}
			<TomeHeader />
		{/if}
	</header>
	{@render children()}
</section>
