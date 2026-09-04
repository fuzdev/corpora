<script lang="ts">
	import ContextmenuEntry from '$lib/ContextmenuEntry.svelte';
	import ContextmenuSubmenu from '$lib/ContextmenuSubmenu.svelte';
	import ContextmenuSeparator from '$lib/ContextmenuSeparator.svelte';
	import { to_cats_label, type Cat, type HistoryItem } from './helpers.ts';
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

	const cat_to_call_home = $derived(to_cats_label(adventure_cats));
</script>

<ContextmenuSubmenu icon="🏠">
	home
	{#snippet menu()}
		{#if cat_to_call_home}
			<ContextmenuEntry run={() => act({ type: 'call_cats_home' })} icon="🐈‍⬛">
				call
			</ContextmenuEntry>
			{#if home_cats.length > 0}
				<ContextmenuSeparator />
			{/if}
		{/if}
		{#each home_cats as cat (cat.name)}
			<CatContextmenu name={cat.name} icon={cat.icon} position={cat.position} {act} />
		{/each}
		{#if !cat_to_call_home}
			<ContextmenuEntry
				run={() => act({ type: 'cat_be_or_do', name: null, position: 'home' })}
				icon="🏠"
			>
				be
			</ContextmenuEntry>
			<ContextmenuEntry run={() => act({ type: 'call_cats_adventure' })} icon="🦋">
				leave
			</ContextmenuEntry>
		{/if}
	{/snippet}
</ContextmenuSubmenu>
