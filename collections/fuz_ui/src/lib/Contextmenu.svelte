<script lang="ts" generics="T extends string = 'span'">
	import type { Snippet } from 'svelte';
	import type { SvelteHTMLElements } from 'svelte/elements';

	import { contextmenu_attachment } from './contextmenu_state.svelte.ts';

	/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */

	const {
		tag = 'span' as any, // TODO why is casting needed?
		entries,
		children,
		...rest
	}: SvelteHTMLElements[T] & {
		// TODO custom tag?
		tag?: T;
		entries: Snippet;
		children: Snippet;
	} = $props();

	// Ideally this wouldn't have a wrapper element,
	// but I don't see a decent way to map DOM click events
	// from anywhere to the Svelte context without gross overhead.
</script>

<svelte:element
	this={tag}
	style:display="contents"
	{...rest}
	{@attach contextmenu_attachment(entries)}
>
	{@render children()}
</svelte:element>
