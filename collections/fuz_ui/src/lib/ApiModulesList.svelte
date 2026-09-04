<script lang="ts">
	import type { Module } from './module.svelte.ts';
	import ModuleLink from './ModuleLink.svelte';
	import TomeSection from './TomeSection.svelte';
	import TomeSectionHeader from './TomeSectionHeader.svelte';

	const {
		modules,
		search_query = ''
	}: {
		/**
		 * The modules to display.
		 */
		modules: Array<Module>;
		/**
		 * The current search query for highlighting.
		 */
		search_query?: string;
	} = $props();

	const has_search = $derived(search_query.trim().length > 0);
</script>

{#if modules.length > 0 || has_search}
	<TomeSection>
		<TomeSectionHeader text="Modules" />
		{#if modules.length === 0}
			<p class="color_c">No modules match your search.</p>
		{:else}
			<ul class="modules-list">
				{#each modules as module (module.path)}
					<li>
						<ModuleLink module_path={module.path} />
					</li>
				{/each}
			</ul>
		{/if}
	</TomeSection>
{/if}

<style>
	.modules-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space_xs);
		padding: 0;
		list-style: none;
	}
	.modules-list li {
		margin: 0;
	}
</style>
