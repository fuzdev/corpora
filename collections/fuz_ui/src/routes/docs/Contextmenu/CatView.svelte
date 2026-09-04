<script lang="ts">
	import type { Snippet } from 'svelte';

	const {
		name = 'Cat',
		icon = '😺',
		children
	}: {
		name?: string;
		icon?: string | null;
		children?: Snippet;
	} = $props();
</script>

<!-- TODO add link option? -->

<span class="cat">
	<span class="icon">{icon}</span><span class="name">{@render children?.()}{name}</span>
</span>

<style>
	.cat {
		display: flex;
		align-items: center;
		background-color: var(--shade_10);
		border-radius: var(--border_radius_md);
		border: transparent var(--border_width_4) double;
	}
	.cat:hover {
		border-color: var(--border_color_20);
	}
	.name {
		font-weight: 700;
		padding: var(--space_md);
	}
	.icon {
		font-size: var(--icon_size_md);
		padding: var(--space_md);
	}
</style>
