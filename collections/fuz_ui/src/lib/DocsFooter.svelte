<script lang="ts">
	import { format_url, type Url } from '@fuzdev/fuz_util/url.ts';
	import type { Snippet } from 'svelte';
	import type { SvelteHTMLElements } from 'svelte/elements';

	import Svg from './Svg.svelte';
	import { logo_github } from './logos.ts';

	const {
		repo_url,
		root_url = null,
		logo,
		logo_header,
		logo_footer,
		children,
		...rest
	}: SvelteHTMLElements['footer'] & {
		/**
		 * Link target for the logo, e.g. the project's source repository.
		 */
		repo_url?: Url | null;
		root_url?: Url | null;
		/**
		 * Overrides the default GitHub logo mark, e.g. for repos hosted elsewhere.
		 */
		logo?: Snippet;
		logo_header?: Snippet;
		logo_footer?: Snippet;
	} = $props();
</script>

<footer {...rest} class="box {rest.class}">
	{@render children?.()}
	<div class="logo box panel p_lg shadow_inset_xs">
		{@render logo_header?.()}
		{#if repo_url}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href={repo_url} rel="me" title="source code">{@render logo_mark()}</a>
		{:else}
			{@render logo_mark()}
		{/if}
		{@render logo_footer?.()}
	</div>
	{#if root_url}
		<div class="root-url">
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href={root_url}>{format_url(root_url)}</a>
		</div>
	{/if}
</footer>

{#snippet logo_mark()}
	{#if logo}{@render logo()}{:else}<Svg data={logo_github} size="var(--icon_size_lg)" />{/if}
{/snippet}

<style>
	/* TODO probably extract */
	.logo a {
		--border_width: var(--border_width_4);
		--border_color: transparent;
		text-decoration: none;
		display: flex;
		border-radius: 50%;
		border: var(--border_width) double var(--border_color);
	}
	.logo a:hover {
		--border_color: var(--palette_a_50);
	}
	.root-url {
		/* TODO messy */
		margin-top: var(--space_md);
	}
</style>
