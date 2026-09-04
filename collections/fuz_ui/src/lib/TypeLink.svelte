<!--
@component

Renders a type reference, linking the parts that resolve to library declarations.

With `type_info` it delegates to `TypeJsonView`, which renders the structured
tree — reference names become `DeclarationLink`s and everything else is
syntax-highlighted in place, so `Map<string, Tome> | null` links `Map` and
`Tome` independently, with the flat `type` as hover text. Without it the whole
`type` string links only when it names a declaration outright.
-->
<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	import type { HTMLAttributes, SvelteHTMLElements } from 'svelte/elements';
	import type { TypeJson } from 'svelte-docinfo/types.js';

	import DeclarationLink from './DeclarationLink.svelte';
	import TypeJsonView from './TypeJsonView.svelte';
	import { library_context } from './library.svelte.ts';

	const {
		type,
		type_info,
		hash,
		a_attrs,
		code_attrs,
		...rest
	}: // generic element attrs, the common denominator of the rendered roots - // assignable to the anchor rest of `DeclarationLink` and the code rest of `Code`
		HTMLAttributes<HTMLElement> & {
			type: string;
			/**
			 * Structured type tree, when svelte-docinfo emitted one beside the flat
			 * string — rendered via `TypeJsonView` (per-node linkification, with
			 * `type` as hover text) instead of the whole-string match below. An
			 * absent tree falls through to `type`, so call sites pass both fields
			 * unconditionally. `hash` and the rest/`a_attrs`/`code_attrs`
			 * attributes apply only to the flat branches, not the delegated tree.
			 */
			type_info?: TypeJson;
			/** URL fragment to append, with or without the `#`. */
			hash?: string;
			/** Anchor attributes, applied only when the type resolves to a declaration link. */
			a_attrs?: SvelteHTMLElements['a'];
			/** Code attributes, applied only to the fallback `Code` when the type doesn't resolve. */
			code_attrs?: SvelteHTMLElements['code'];
		} = $props();

	const get_library = library_context.get();
	const library = $derived(get_library());

	// TODO maybe better name?
</script>

{#if type_info}
	<!-- the flat string rides along as hover text so the checker's expansion
		stays reachable where the tree replaced it with a recovered name -->
	<TypeJsonView {type_info} title={type} />
{:else if library.declaration_by_name.has(type)}
	<DeclarationLink {...rest} {...a_attrs} name={type} {hash} />
{:else}
	<Code {...rest} {...code_attrs} lang="ts" content={type} inline />
{/if}
