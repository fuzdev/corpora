<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import Docs from '@fuzdev/fuz_ui/Docs.svelte';
	import { DOCS_PATH } from '@fuzdev/fuz_ui/docs_helpers.svelte.ts';
	import { Library, library_context } from '@fuzdev/fuz_ui/library.svelte.ts';

	import { tomes } from './tomes.ts';
	import { library_json } from '#routes/library.ts';

	const {
		children
	}: {
		children: Snippet;
	} = $props();

	const library = new Library(library_json);
	library_context.set(() => library);

	// the tab title names the page — a tome's own slug, or `docs` at the index, which
	// renders every tome so no single tome can set it
	const title_slug = $derived(
		tomes.find((t) => page.url.pathname === `${DOCS_PATH}/${t.slug}`)?.slug ?? 'docs'
	);
</script>

<svelte:head>
	<title>{title_slug} - tsv.fuz.dev</title>
</svelte:head>

<Docs {tomes}>
	{@render children()}
</Docs>
