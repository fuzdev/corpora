<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { SvelteHTMLElements } from 'svelte/elements';

	const {
		expand_width = false,
		margin = true,
		children,
		...rest
	}: SvelteHTMLElements['div'] & {
		expand_width?: boolean;
		margin?: boolean;
		children: Snippet;
	} = $props();
</script>

<div {...rest} class={['docs-list', rest.class, { 'expand-width': expand_width, margin }]}>
	{@render children()}
</div>

<style>
	.docs-list {
		width: var(--docs_menu_width);
		min-width: var(--docs_menu_width);
	}
	.docs-list.expand-width {
		width: 100%;
		max-width: var(--distance_md);
	}
	.docs-list.margin {
		margin: var(--space_xl6) 0;
	}

	/* TODO should be fixed upstream in fuz_css */
	.docs-list :global(a.highlighted) {
		background-color: var(--fg_10);
	}
	.docs-list :global(a:hover) {
		background-color: var(--fg_10);
	}
	.docs-list :global(a:is(:active, .selected)) {
		background-color: var(--fg_20);
	}
</style>
