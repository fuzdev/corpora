<script lang="ts">
	import type { SvelteHTMLElements } from 'svelte/elements';
	import { ensure_start } from '@fuzdev/fuz_util/string.ts';

	import { library_context } from './library.svelte.ts';
	import { contextmenu_attachment } from './contextmenu_state.svelte.ts';
	import { create_module_contextmenu } from './module_contextmenu.ts';

	const {
		module_path,
		hash,
		full = false,
		children,
		class: class_prop = 'chip',
		...rest
	}: SvelteHTMLElements['a'] & {
		module_path: string; // TODO maybe rename?
		/** URL fragment to append, with or without the `#`. */
		hash?: string;
		/**
		 * Link to the library's own deployed docs (`url_api_full`) instead of a
		 * site-local path (`url_api`). Use when rendering a foreign library on a
		 * different site, e.g. an aggregator, so links don't dangle locally.
		 */
		full?: boolean;
	} = $props();

	const get_library = library_context.get();
	const library = $derived(get_library());

	const module = $derived(library.module_by_path.get(module_path));

	// When linking a foreign library's docs, prefer its full URL; fall back to
	// the site-local path if `homepage_url` is unavailable.
	const url_api = $derived((full && module?.url_api_full) || module?.url_api);

	const color_class = $derived(module_path.endsWith('.svelte') ? 'color_h' : '');

	const contextmenu_entries = $derived(module ? create_module_contextmenu(module) : undefined);
</script>

{#if module}
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<a
		{...rest}
		class="module-link {class_prop} {color_class}"
		href={url_api + (hash ? ensure_start(hash, '#') : '')}
		{@attach contextmenu_attachment(contextmenu_entries)}
	>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{#if children}
			{@render children()}
		{:else}
			{module_path}
		{/if}
	</a>
{:else}
	<!-- Fallback to plain text if not found -->
	{#if children}
		{@render children()}
	{:else}
		{module_path}
	{/if}
{/if}
