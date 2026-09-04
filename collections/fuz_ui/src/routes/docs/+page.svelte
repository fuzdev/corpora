<script lang="ts">
	import DocsContent from '$lib/DocsContent.svelte';
	import { tomes_context } from '$lib/tome.ts';
	import { library_context } from '$lib/library.svelte.ts';

	const get_tomes_by_slug = tomes_context.get();
	const tomes = $derived(Array.from(get_tomes_by_slug().values()));

	const get_library = library_context.get();
	const library = $derived(get_library());
</script>

<DocsContent {tomes} {library}>
	{#snippet repo_name()}
		<h1 class="mb_sm">fuz_ui</h1>
	{/snippet}
</DocsContent>
