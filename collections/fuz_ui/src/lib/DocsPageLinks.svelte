<script lang="ts">
	import { page } from '$app/state';
	import type { SvelteHTMLElements } from 'svelte/elements';

	import DocsList from './DocsList.svelte';
	import { docs_links_context } from './docs_helpers.svelte.ts';

	const {
		sidebar = true,
		expand_width = false,
		...rest
	}: SvelteHTMLElements['div'] & {
		sidebar?: boolean; // TODO @many dialog navs (this shouldn't exist)
		expand_width?: boolean;
	} = $props();

	const docs_links = docs_links_context.get();

	const hash = $derived(page.url.hash.slice(1));
</script>

<DocsList {...rest} {expand_width} class="docs-page-links {rest.class}">
	<h4 class="mb_sm">on this page</h4>
	{#if sidebar}
		<div class="sidebar-wrapper">{@render content()}</div>
	{:else}
		{@render content()}
	{/if}
</DocsList>

{#snippet content()}
	<nav aria-label="on this page" class="width:100%">
		<ul class="unstyled">
			{#each docs_links.docs_links as item (item.id)}
				<li
					role="none"
					class={{ pl_xl: item.depth === 2, pl_xl2: item.depth === 3, pl_xl3: item.depth >= 4 }}
				>
					<a
						class={[
							'menuitem',
							{
								selected: item.fragment === hash,
								highlighted: docs_links.fragments_onscreen.has(item.fragment)
							}
						]}
						href="#{item.fragment}"
					>
						<div class="ellipsis">{item.text}</div>
					</a>
				</li>
			{/each}
		</ul>
	</nav>
{/snippet}

<style>
	/* this is needed because `.docs-page-links` needs to be a block to collapse the vertical margin */
	.sidebar-wrapper {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
	}
</style>
