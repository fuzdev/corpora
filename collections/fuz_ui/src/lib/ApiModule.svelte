<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	import Mdz from '@fuzdev/mdz/Mdz.svelte';
	import {
		mdz_code_context,
		mdz_codeblock_context,
		mdz_set_context_with_fallback
	} from '@fuzdev/mdz/mdz_contexts.ts';

	import { set_library_context_with_fallback, type Library } from './library.svelte.ts';
	import { tome_get_by_slug, type Tome } from './tome.ts';
	import TomeContent from './TomeContent.svelte';
	import TomeSection from './TomeSection.svelte';
	import TomeSectionHeader from './TomeSectionHeader.svelte';
	import DocsSearch from './DocsSearch.svelte';
	import ModuleLink from './ModuleLink.svelte';
	import DocsLink from './DocsLink.svelte';
	import DeclarationLink from './DeclarationLink.svelte';
	import ApiDeclarationList from './ApiDeclarationList.svelte';
	import { DeclarationSearchState } from './api_search.svelte.ts';

	const {
		module_path: module_path_param,
		library: library_prop,
		tome = tome_get_by_slug('api')
	}: {
		/**
		 * The module path parameter from the route (e.g., "lib/Button.svelte").
		 */
		module_path: string | Array<string>;
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
	} = $props();

	const get_library = set_library_context_with_fallback(() => library_prop, 'ApiModule');
	const library = $derived(get_library());

	// render mdz inline `code` as API-linking `DocsLink` and fenced blocks as syntax-highlighted
	// `Code`, matching the rest of the docs — the injection mdz core leaves open
	mdz_set_context_with_fallback(mdz_code_context, () => DocsLink);
	mdz_set_context_with_fallback(mdz_codeblock_context, () => Code);

	// normalize module_path to string (could be array from [...module_path] route param)
	const module_path = $derived(
		Array.isArray(module_path_param) ? module_path_param.join('/') : module_path_param
	);

	// find the module using the lookup helper
	const module = $derived(library.module_by_path.get(module_path));

	// check if this is a directory prefix containing child modules
	const directory_modules = $derived(module ? null : library.lookup_directory_modules(module_path));

	// fallback for 404
	const module_name = $derived(
		module?.path || (directory_modules ? module_path : '[missing module]')
	);

	const search = $derived(new DeclarationSearchState(module?.declarations ?? []));

	// GitHub source URL for the module
	const source_url = $derived(module?.url_github);
</script>

<svelte:head>
	<title>{module_name} - API docs - {library.pkg_json.name}</title>
</svelte:head>

<TomeContent {tome}>
	{#snippet header()}
		<h1 class="mt_xl4">{module_name}</h1>
	{/snippet}

	{#if !module}
		<!-- no module, maybe a dir? -->
		{#if !directory_modules}
			<section>
				<p>Module not found: {module_path}</p>
			</section>
		{:else}
			<section>
				<p>{directory_modules.length} module{directory_modules.length === 1 ? '' : 's'}</p>
				<ul class="unstyled">
					{#each directory_modules as child_module (child_module.path)}
						<li>
							<h3><ModuleLink module_path={child_module.path} /></h3>
							{#if child_module.module_comment}
								<Mdz content={child_module.module_comment} />
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{:else}
		{#if module.module_comment}
			<section>
				<Mdz content={module.module_comment} />
			</section>
		{/if}
		{#if source_url}
			<section>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href={source_url} class="chip" target="_blank" rel="noopener">view source</a>
			</section>
		{/if}
		<!-- Declarations section -->
		{#if module.has_declarations}
			<TomeSection>
				<TomeSectionHeader text="Declarations" />

				{#if search.declarations.length > 1}
					<section>
						<DocsSearch
							placeholder="search declarations in this module..."
							declaration_count={search.declarations.length}
							filtered_declaration_count={search.query.trim() ? search.filtered.length : undefined}
							bind:search_query={search.query}
						/>
					</section>
				{/if}

				<ApiDeclarationList declarations={search.filtered} search_query={search.query} />
			</TomeSection>
		{/if}

		<!-- Re-exports section -->
		{#if module.has_any_re_exports}
			<TomeSection>
				<TomeSectionHeader text="Re-exports" />
				<ul class="unstyled">
					{#each module.star_exports as star_path (star_path)}
						<li class="mb_lg">
							<p class="mb_sm">everything from <ModuleLink module_path={star_path} /></p>
						</li>
					{/each}
					{#each module.external_star_exports as specifier (specifier)}
						<li class="mb_lg">
							<p class="mb_sm">everything from <code>{specifier}</code></p>
						</li>
					{/each}
					{#each module.re_exports_by_module as [from_path, entries] (from_path)}
						<li class="mb_lg">
							<p class="mb_sm">from <ModuleLink module_path={from_path} /></p>
							<div class="row gap_md flex-wrap:wrap">
								{#each entries as entry (entry.name)}
									<DeclarationLink name={entry.name} module_path={from_path}>
										{#if entry.typeOnly}
											<small>type</small>
										{/if}{entry.name}
									</DeclarationLink>
								{/each}
							</div>
						</li>
					{/each}
					{#each module.external_re_exports_by_specifier as [specifier, entries] (specifier)}
						<li class="mb_lg">
							<p class="mb_sm">from <code>{specifier}</code></p>
							<div class="row gap_md flex-wrap:wrap">
								{#each entries as entry (entry.name)}
									<span class="chip">
										{#if entry.typeOnly}
											<small>type</small>
										{/if}{#if entry.originalName}
											<small>{entry.originalName} as</small>
										{/if}{entry.name}
									</span>
								{/each}
							</div>
						</li>
					{/each}
				</ul>
			</TomeSection>
		{/if}

		<!-- Depends on section -->
		{#if module.has_dependencies}
			<TomeSection>
				<TomeSectionHeader text="Depends on" />
				<ul>
					{#each module.dependencies as dep_path (dep_path)}
						<li>
							<ModuleLink module_path={dep_path} />
						</li>
					{/each}
				</ul>
			</TomeSection>
		{/if}

		<!-- Imported by section -->
		{#if module.has_dependents}
			<TomeSection>
				<TomeSectionHeader text="Imported by" />
				<ul>
					{#each module.dependents as dependent_path (dependent_path)}
						<li>
							<ModuleLink module_path={dependent_path} />
						</li>
					{/each}
				</ul>
			</TomeSection>
		{/if}
	{/if}
</TomeContent>
