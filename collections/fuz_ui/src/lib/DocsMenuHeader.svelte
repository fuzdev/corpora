<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { SvelteHTMLElements } from 'svelte/elements';

	const {
		children,
		...rest
	}: SvelteHTMLElements['h4'] & {
		// TODO maybe add an optional `selected` status? if any children are selected
		children: Snippet;
	} = $props();
</script>

<h4 {...rest} class="mb_sm {rest.class}">{@render children()}</h4>
