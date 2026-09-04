<script lang="ts">
	import ContextmenuEntry from '$lib/ContextmenuEntry.svelte';
	import ContextmenuSubmenu from '$lib/ContextmenuSubmenu.svelte';
	import ContextmenuSeparator from '$lib/ContextmenuSeparator.svelte';
	import { type HistoryItem, type Cat, to_cats_label } from './helpers.ts';
	import CatContextmenu from './CatContextmenu.svelte';

	const {
		home_cats,
		adventure_cats,
		act
	}: {
		home_cats: Array<Cat>;
		adventure_cats: Array<Cat>;
		act: (item: HistoryItem) => void;
	} = $props();

	const cat_to_call_to_adventure = $derived(to_cats_label(home_cats));
</script>

<ContextmenuSubmenu icon="🌄">
	adventure
	{#snippet menu()}
		{#if cat_to_call_to_adventure}
			<ContextmenuEntry run={() => act({ type: 'call_cats_adventure' })} icon="🦋">
				call
			</ContextmenuEntry>
			{#if adventure_cats.length > 0}
				<ContextmenuSeparator />
			{/if}
		{/if}
		{#each adventure_cats as cat (cat.name)}
			<CatContextmenu name={cat.name} icon={cat.icon} position={cat.position} {act} />
		{/each}
		{#if !cat_to_call_to_adventure}
			<ContextmenuEntry
				run={() => act({ type: 'cat_be_or_do', name: null, position: 'adventure' })}
				icon="🌄"
			>
				do
			</ContextmenuEntry>
			<ContextmenuEntry run={() => act({ type: 'call_cats_home' })} icon="🐈‍⬛">
				leave
			</ContextmenuEntry>
		{/if}
	{/snippet}
</ContextmenuSubmenu>
