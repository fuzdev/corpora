<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes, SvelteHTMLElements } from 'svelte/elements';
	import type { OmitStrict } from '@fuzdev/fuz_util/types.ts';

	import ModuleLink from './ModuleLink.svelte';
	import DeclarationLink from './DeclarationLink.svelte';
	import { library_context } from './library.svelte.ts';
	import type { Declaration } from './declaration.svelte.ts';
	import type { Module } from './module.svelte.ts';

	const {
		reference,
		hash,
		display_text,
		a_attrs,
		code_attrs,
		children: children_prop,
		...rest
	}: // generic element attrs, the common denominator of the rendered roots - // assignable to the anchor rest of `DeclarationLink`/`ModuleLink` and exact for `<code>`
		OmitStrict<HTMLAttributes<HTMLElement>, 'children'> & {
			reference: string;
			/** URL fragment to append, with or without the `#`. */
			hash?: string;
			display_text?: string | null;
			/** Anchor attributes, applied only when the reference resolves to a declaration or module link. */
			a_attrs?: SvelteHTMLElements['a'];
			/** Code attributes, applied only to the fallback `<code>` when the reference doesn't resolve. */
			code_attrs?: SvelteHTMLElements['code'];
			children?: Snippet<[Declaration | undefined, Module | undefined]>;
		} = $props();

	const get_library = library_context.get();
	const library = $derived(get_library());

	// Try to find as declaration first, then module
	const declaration = $derived(library.declaration_by_name.get(reference));
	const module = $derived(declaration ? declaration.module : library.module_by_path.get(reference));
</script>

{#if declaration}
	<DeclarationLink {...rest} {...a_attrs} name={reference} {hash}>
		{@render children()}
	</DeclarationLink>
{:else if module}
	<ModuleLink {...rest} {...a_attrs} module_path={module.path} {hash}>
		{@render children()}
	</ModuleLink>
{:else}
	<code {...rest} {...code_attrs}>{@render children()}</code>
{/if}

{#snippet children()}
	{#if children_prop}
		{@render children_prop(declaration, module)}
	{:else}
		{display_text ?? reference}
	{/if}
{/snippet}
