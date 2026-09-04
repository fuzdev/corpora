<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { SvelteHTMLElements } from 'svelte/elements';

	import type { Library } from './library.svelte.ts';
	import type { Tome } from './tome.ts';
	import LibrarySummary from './LibrarySummary.svelte';

	const {
		tomes,
		library,
		repo_name,
		content,
		header,
		...rest
	}: SvelteHTMLElements['div'] & {
		tomes: Array<Tome>;
		library: Library;
		repo_name?: Snippet<[repo_name: string]>;
		content?: Snippet;
		header?: Snippet;
	} = $props();
</script>

<div {...rest} class="width_atmost_md {rest.class}">
	{#if header}
		{@render header()}
	{:else}
		<div class="box mb_xl5">
			<LibrarySummary {library} {repo_name} />
		</div>
	{/if}
	<div>
		{#if content}
			{@render content()}
		{:else}
			{#each tomes as tome (tome)}
				<tome.Component />
			{/each}
		{/if}
	</div>
</div>
