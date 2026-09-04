<script lang="ts">
	import type { SvelteHTMLElements } from 'svelte/elements';

	const { ...rest }: SvelteHTMLElements['li'] = $props();
</script>

<!-- `aria-orientation` is omitted - it defaults to horizontal, correct for a vertical menu's rule -->
<li role="separator" {...rest} class={['contextmenu-separator', rest.class]}></li>

<style>
	.contextmenu-separator {
		height: var(--border_width);
		margin: var(--space_xs) var(--space_sm);
		background-color: var(--border_color_10);
		list-style: none;
	}
</style>
