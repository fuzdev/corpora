<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import type { SvelteHTMLElements } from 'svelte/elements';

	import DocsList from './DocsList.svelte';
	import { tome_to_pathname, tome_to_title, type Tome } from './tome.ts';
	import DocsMenuHeader from './DocsMenuHeader.svelte';

	const {
		tomes,
		children,
		expand_width = false,
		...rest
	}: SvelteHTMLElements['div'] & {
		tomes: Array<Tome>;
		children?: Snippet<[category: string]>;
		expand_width?: boolean;
	} = $props();

	const tomes_by_category = $derived(
		tomes.reduce<Record<string, Array<Tome>>>((result, c) => {
			(result[c.category] ??= []).push(c);
			return result;
		}, {})
	);
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->

<DocsList {...rest} {expand_width} margin={false} class="docs-menu {rest.class}">
	<ul class="unstyled">
		{#each Object.entries(tomes_by_category) as [category, tomes] (category)}
			<li class="category">
				{#if children}
					{@render children(category)}
				{:else}
					<DocsMenuHeader>{category}</DocsMenuHeader>
				{/if}
				<ul class="unstyled">
					{#each tomes as item (item)}
						{@const pathname = tome_to_pathname(item)}
						<li role="none">
							<a class={['menuitem', { selected: pathname === page.url.pathname }]} href={pathname}>
								<div class="ellipsis">{tome_to_title(item)}</div>
							</a>
						</li>
					{/each}
				</ul>
			</li>
		{/each}
	</ul>
</DocsList>

<style>
	.category {
		margin: var(--space_xl6) 0;
	}
</style>
