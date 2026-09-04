<script lang="ts">
	import { set_library_context_with_fallback, type Library } from './library.svelte.ts';
	import { tome_get_by_slug, type Tome } from './tome.ts';
	import TomeContent from './TomeContent.svelte';
	import TomeLink from './TomeLink.svelte';
	import DocsSearch from './DocsSearch.svelte';
	import ApiModulesList from './ApiModulesList.svelte';
	import ApiDeclarationList from './ApiDeclarationList.svelte';
	import { ApiSearchState } from './api_search.svelte.ts';

	const {
		library: library_prop,
		tome = tome_get_by_slug('api'),
		minimal = false
	}: {
		/**
		 * The library instance to render API docs for.
		 * Defaults to getting from `library_context`.
		 */
		library?: Library;
		/**
		 * The tome for the API docs page.
		 * Defaults to looking up the 'api' tome.
		 */
		tome?: Tome;
		/**
		 * Whether to show minimal content (just a link to full API docs).
		 * Used when the API index is shown on a parent docs page.
		 */
		minimal?: boolean;
	} = $props();

	const get_library = set_library_context_with_fallback(() => library_prop, 'ApiIndex');
	const library = $derived(get_library());

	const search = $derived(new ApiSearchState(library));
</script>

<svelte:head>
	<title>API docs - {library.pkg_json.name}</title>
</svelte:head>

<TomeContent {tome}>
	{#if minimal}
		<section>
			<p>Browse the full <TomeLink slug="api" /> docs.</p>
		</section>
	{:else}
		<section>
			<p>{library.pkg_json.description}</p>

			{#if search.modules.length + search.declarations.length > 1}
				<DocsSearch
					module_count={search.modules.length}
					declaration_count={search.declarations.length}
					filtered_module_count={search.query.trim() ? search.modules_filtered.length : undefined}
					filtered_declaration_count={search.query.trim()
						? search.declarations_filtered.length
						: undefined}
					bind:search_query={search.query}
				/>
			{/if}
		</section>

		<ApiModulesList modules={search.modules_filtered} search_query={search.query} />

		<ApiDeclarationList declarations={search.declarations_filtered} search_query={search.query} />
	{/if}
</TomeContent>
