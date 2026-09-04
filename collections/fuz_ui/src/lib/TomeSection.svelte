<script lang="ts" module>
	import { create_context } from './context_helpers.ts';

	export type RegisterSectionHeader = (get_fragment: () => string) => string | undefined;
	export const register_section_header_context = create_context<RegisterSectionHeader>();
	export const section_depth_context = create_context(() => 0);
	export const section_id_context = create_context<string | undefined>();
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { SvelteHTMLElements } from 'svelte/elements';
	import { DEV } from 'esm-env';

	import { intersect } from './intersect.svelte.ts';
	import { docs_links_context } from './docs_helpers.svelte.ts';

	const {
		children,
		...rest
	}: SvelteHTMLElements['section'] & {
		children: Snippet;
	} = $props();

	const docs_links = docs_links_context.get();

	// Get parent depth and increment for children
	const parent_depth = section_depth_context.get();
	const current_depth = parent_depth + 1;
	section_depth_context.set(current_depth);

	// Read parent section ID before overwriting context (undefined for root sections)
	const parent_section_id = section_id_context.get_maybe();

	// Generate unique section ID immediately (before children render)
	// Uses page-scoped counter from docs_links to ensure SSR/client consistency
	const section_id = docs_links.generate_section_id();

	// Provide own section ID to direct children (header) via context
	section_id_context.set(section_id);

	let get_fragment: (() => string) | undefined = $state.raw();

	register_section_header_context.set((gf) => {
		if (DEV && get_fragment !== undefined) {
			throw Error(
				`TomeSection already has header "${get_fragment()}", cannot add "${gf()}". Did you forget to wrap a TomeSectionHeader in its own TomeSection?`
			);
		}
		get_fragment = gf;
		return parent_section_id; // Return parent section ID to header
	});
</script>

<section
	{...rest}
	{@attach intersect(() => ({ intersecting }) => {
		const fragment = get_fragment?.();
		if (!fragment) {
			if (DEV) console.error('TomeSectionHeader must be a child of TomeSection'); // eslint-disable-line no-console
			return;
		}
		if (intersecting) {
			docs_links.fragments_onscreen.add(fragment);
		} else {
			docs_links.fragments_onscreen.delete(fragment);
		}
	})}
>
	{@render children()}
</section>
