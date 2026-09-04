<script lang="ts">
	import ContextmenuEntry from '$lib/ContextmenuEntry.svelte';
	import ContextmenuSubmenu from '$lib/ContextmenuSubmenu.svelte';
	import type { CatPosition, HistoryItem } from './helpers.ts';

	const {
		name = 'Cat',
		icon = '😺',
		position,
		act
	}: {
		name?: string;
		icon?: string;
		position: CatPosition;
		act: (item: HistoryItem) => void;
	} = $props();
</script>

<ContextmenuSubmenu {icon}>
	{name}
	{#snippet menu()}
		<ContextmenuEntry
			run={() => act({ type: position === 'adventure' ? 'cat_go_home' : 'cat_go_adventure', name })}
			icon={position === 'adventure' ? '🏠' : '🌄'}
		>
			{#if position === 'adventure'}go home{:else}go adventure{/if}
		</ContextmenuEntry>
		<ContextmenuEntry
			run={() => act({ type: 'cat_be_or_do', name, position })}
			icon={position === 'adventure' ? '🌄' : '🏠'}
		>
			{#if position === 'adventure'}do adventure{:else}be home{/if}
		</ContextmenuEntry>
	{/snippet}
</ContextmenuSubmenu>
