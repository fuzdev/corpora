<script lang="ts">
	import { parse_path_pieces } from '@fuzdev/fuz_util/path.ts';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import { strip_start, ensure_end } from '@fuzdev/fuz_util/string.ts';
	import type { SvelteHTMLElements } from 'svelte/elements';

	import Svg from './Svg.svelte';
	import { site_context } from './site.svelte.ts';

	const {
		path,
		selected_path,
		base_path,
		separator,
		children,
		...rest
	}: SvelteHTMLElements['div'] & {
		/**
		 * Prefixed with a slash and relative to the base path.
		 */
		path?: string | undefined;
		/**
		 * Prefixed with a slash and relative to the base path.
		 * `null` means none and `undefined` is detected from the current url.
		 */
		selected_path?: string | null | undefined;
		/**
		 * Sets a custom base path of `path` and `selected_path`.
		 * Defaults to `base` from `$app/paths`.
		 */
		base_path?: string;
		separator?: Snippet;
		/**
		 * Content of the root link. Defaults to the `site_context` icon rendered as
		 * an `Svg`, then the `site_context` glyph, then `•`.
		 */
		children?: Snippet;
	} = $props();

	const site = site_context.get_maybe();
	const icon_data = $derived(site?.icon ?? null);
	const glyph_text = $derived(site?.glyph ?? null);

	const final_base_path = $derived(base_path ?? resolve('/').slice(0, -1));

	const final_path = $derived(path ?? strip_start(page.url.pathname, final_base_path));

	const final_selected_path = $derived(
		selected_path === null ? null : (selected_path ?? final_path)
	);

	const path_pieces = $derived(parse_path_pieces(final_path));

	const root_path = $derived(ensure_end(final_base_path, '/'));

	// TODO animate these
	// `transition:slide={{axis: 'x'}}`
</script>

<div {...rest} class="breadcrumb {rest.class}">
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a href={root_path} class={{ selected: root_path === final_base_path + final_selected_path }}>
		{#if children}
			{@render children()}
		{:else if icon_data}
			<Svg data={icon_data} size="1em" />
		{:else if glyph_text}
			{glyph_text}
		{:else}
			•
		{/if}
	</a>{#each path_pieces as path_piece (path_piece)}
		{#if path_piece.type === 'piece'}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve --><a
				href={final_base_path + path_piece.path}
				class={{ selected: path_piece.path === final_selected_path }}
			>
				{path_piece.name}
			</a>
		{:else}
			<span class="separator">
				{#if separator}{@render separator()}{:else}/{/if}
			</span>
		{/if}
	{/each}
</div>

<style>
	.breadcrumb {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		font-size: var(--font_size, var(--font_size_md));
	}
	a {
		position: relative;
		z-index: 1;
		padding: 0 calc(var(--font_size, var(--font_size_md)) * 0.5);
		display: flex;
		align-items: center;
	}
	.separator {
		position: relative;
		z-index: 0;
		display: flex;
		justify-content: center;
		align-items: center;
		width: 0;
	}
</style>
