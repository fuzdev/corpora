<script lang="ts">
	import { page } from '$app/state';
	import { DEV } from 'esm-env';
	import type { SvelteHTMLElements } from 'svelte/elements';

	import { tome_context, tome_to_title } from './tome.ts';
	import Hashlink from './Hashlink.svelte';
	import { docs_links_context, to_docs_path_info } from './docs_helpers.svelte.ts';

	// eslint-disable-next-line @typescript-eslint/no-duplicate-type-constituents
	const props: SvelteHTMLElements['h1'] | SvelteHTMLElements['h2'] = $props();

	const get_tome = tome_context.get();
	if (DEV && !get_tome) throw Error('TomeHeader expects a tome in context');
	const tome = $derived(get_tome());

	const docs_links = docs_links_context.get();

	// The slug is the route segment + anchor fragment; only the visible label uses `title`.
	const fragment = $derived(tome.slug);
	const title = $derived(tome_to_title(tome));
	$effect(() => {
		const id = docs_links.add(fragment, title, page.url.pathname);
		return () => docs_links.remove(id);
	});

	const { path, path_is_selected } = $derived(to_docs_path_info(fragment, page.url.pathname));
</script>

<svelte:element this={path_is_selected ? 'h1' : 'h2'} {...props} class="tome-header">
	{#if path_is_selected}
		{@render content(title)}
	{:else}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href={path}>{@render content(title)}</a>
	{/if}
	<Hashlink {fragment} />
</svelte:element>

{#snippet content(text: string)}
	{text}
{/snippet}

<style>
	.tome-header {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: var(--space_xl4);
	}
	/* TODO @many how can this be done composably? currently using `:global` at usage site - ideally we'd continue to use :hover instead of JS */
	.tome-header:hover :global(.hashlink) {
		opacity: 1;
	}
</style>
