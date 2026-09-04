<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { SvelteHTMLElements } from 'svelte/elements';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	import Hashlink from './Hashlink.svelte';
	import {
		register_section_header_context,
		section_depth_context,
		section_id_context
	} from './TomeSection.svelte';
	import { docs_links_context, docs_slugify, type DocsLinkTag } from './docs_helpers.svelte.ts';

	const {
		text,
		tag,
		children,
		...rest
	}: // eslint-disable-next-line @typescript-eslint/no-duplicate-type-constituents
		(SvelteHTMLElements['h2'] | SvelteHTMLElements['h3'] | SvelteHTMLElements['h4']) & {
			text: string;
			tag?: DocsLinkTag;
			children?: Snippet;
		} = $props();

	const fragment = $derived(docs_slugify(text));

	const register_section_header = register_section_header_context.get();
	if (!register_section_header) {
		throw Error('TomeSectionHeader must be a child of TomeSection');
	}

	const docs_links = docs_links_context.get();

	// Auto-detect tag based on depth if not explicitly provided
	const depth = section_depth_context.get();
	const final_tag = $derived(tag ?? (depth === 1 ? 'h2' : depth === 2 ? 'h3' : 'h4'));

	// Get own section's ID from context
	const my_section_id = section_id_context.get();

	// Register with parent section to get parent's ID back
	const parent_section_id = register_section_header(() => fragment);

	// Register with docs_links — re-registers when reactive values change
	$effect(() => {
		if (page.url.pathname === resolve(docs_links.root_path as any)) return;
		const id = docs_links.add(
			fragment,
			text,
			page.url.pathname,
			final_tag,
			depth,
			parent_section_id,
			my_section_id
		);
		return () => docs_links.remove(id);
	});
</script>

<header>
	<svelte:element this={final_tag} {...rest} class={['tome-section-header', rest.class]}>
		<div class="flex:1">
			{#if children}
				{@render children()}
			{:else}
				{text}
			{/if}
		</div>
		<Hashlink {fragment} />
	</svelte:element>
</header>

<style>
	.tome-section-header {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	/* TODO @many how can this be done composably? currently using `:global` at usage site - ideally we'd continue to use :hover instead of JS */
	.tome-section-header:hover :global(.hashlink) {
		opacity: 1;
	}
</style>
