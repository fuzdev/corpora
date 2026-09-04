<script lang="ts">
	import { DEV } from 'esm-env';
	import type { SvelteHTMLElements } from 'svelte/elements';

	import { tome_get_by_slug, tome_to_pathname, tome_to_title, tomes_context } from './tome.ts';
	import { DOCS_PATH_DEFAULT } from './docs_helpers.svelte.ts';

	const {
		slug,
		docs_path = DOCS_PATH_DEFAULT,
		hash,
		children,
		class: class_prop = 'chip',
		...rest
	}: SvelteHTMLElements['a'] & {
		slug: string; // TODO type, generate from `tomes`?
		docs_path?: string;
		/** URL fragment to append, with or without the `#`. */
		hash?: string;
	} = $props();

	if (DEV) {
		$effect(() => {
			tome_get_by_slug(slug); // throws if not found
		});
	}

	// Default link text is the tome's display title, falling back to its `slug`.
	const get_tomes = tomes_context.get_maybe();
	const label = $derived.by(() => {
		const tome = get_tomes?.().get(slug);
		return tome ? tome_to_title(tome) : slug;
	});

	// TODO add contextmenu behavior
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
<a {...rest} class="tome-link {class_prop}" href={tome_to_pathname(slug, docs_path, hash)}>
	{#if children}{@render children()}{:else}{label}{/if}
</a>
