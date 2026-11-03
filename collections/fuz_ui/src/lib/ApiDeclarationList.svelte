<script lang="ts">
	import type { Declaration } from './declaration.svelte.ts';
	import DeclarationDetail from './DeclarationDetail.svelte';
	import TomeSection from './TomeSection.svelte';
	import TomeSectionHeader from './TomeSectionHeader.svelte';

	const {
		declarations,
		search_query = ''
	}: {
		declarations: Array<Declaration>;
		search_query?: string;
	} = $props();
</script>

{#if declarations.length === 0}
	<section>
		{#if search_query.trim()}
			<p class="text_70">No declarations match your search.</p>
		{:else}
			<p class="text_70">No declarations.</p>
		{/if}
	</section>
{:else}
	{#each declarations as declaration (`${declaration.module_path}:${declaration.name}`)}
		<TomeSection>
			<!-- Show the bare name; generic parameters are documented in the detail below (generics/type signature). -->
			<TomeSectionHeader text={declaration.name}>
				<div class="word-break:break-all">{declaration.name}</div>
			</TomeSectionHeader>
			<article id={declaration.name}>
				<DeclarationDetail {declaration} />
			</article>
		</TomeSection>
	{/each}
{/if}
