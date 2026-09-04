<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import type { SvelteHTMLElements } from 'svelte/elements';
	import { format_url } from '@fuzdev/fuz_util/url.ts';

	import type { Library } from './library.svelte.ts';
	import ImgOrSvg from './ImgOrSvg.svelte';

	const {
		library,
		repo_name,
		logo,
		tagline,
		description,
		npm_url,
		homepage_url,
		children,
		...rest
	}: SvelteHTMLElements['div'] & {
		library: Library;
		repo_name?: Snippet<[repo_name: string]>;
		logo?: Snippet<[logo_url: string, logo_alt: string]>;
		tagline?: Snippet<[tagline: string, glyph?: string]>;
		description?: Snippet<[description: string, glyph?: string]>;
		npm_url?: Snippet<[npm_url: string]>;
		homepage_url?: Snippet<[homepage_url: string]>;
		children?: Snippet;
	} = $props();

	const { pkg_json } = $derived(library);
</script>

<div {...rest} class="library-summary {rest.class}">
	<!-- TODO maybe continue this snippet pattern, or maybe simplify? -->
	<header class="box mb_lg">
		{#if repo_name}
			{@render repo_name(library.repo_name)}
		{:else}
			<div class="repo-name">{library.repo_name}</div>
		{/if}
		<!-- TODO maybe add `icon_alt` to package.json -->
		<!-- TODO what about svg logos? maybe a package.json logo url that defaults to favicon? -->
		{#if library.logo_url}
			{#if logo}
				{@render logo(library.logo_url, library.logo_alt)}
			{:else}
				<ImgOrSvg
					src={library.logo_url}
					label={library.logo_alt}
					size="var(--font_size, var(--icon_size_xl2))"
				/>
			{/if}
		{/if}
	</header>
	{#if pkg_json.tagline}
		{#if tagline}
			{@render tagline(pkg_json.tagline, pkg_json.glyph)}
		{:else}
			<p class="panel py_md px_xl">
				{pkg_json.tagline}
				{pkg_json.glyph}
			</p>
		{/if}
	{/if}
	{#if pkg_json.description}
		{#if description}
			{@render description(pkg_json.description, pkg_json.glyph)}
		{:else}
			<p class="text-align:center">
				{pkg_json.description}
				{#if !pkg_json.tagline}
					{pkg_json.glyph}
				{/if}
			</p>
		{/if}
	{/if}
	{@render children?.()}
	{#if library.homepage_url}
		{#if homepage_url}
			{@render homepage_url(library.homepage_url)}
		{:else}
			<div class="mb_lg">
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					class={['chip', { selected: library.homepage_url === page.url.href }]}
					href={library.homepage_url}
				>
					{format_url(library.homepage_url)}
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</div>
		{/if}
	{/if}
	<p class="display:flex gap_xs2">
		{#if library.repo_url}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a class="chip" href={library.repo_url}>repo</a>
		{/if}
		{#if library.changelog_url}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a class="chip" title="version" href={library.changelog_url}>{pkg_json.version}</a>
		{/if}
		{#if library.npm_url}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a class="chip" href={library.npm_url}>npm</a>
		{/if}
	</p>
	{#if library.npm_url}
		{#if npm_url}
			{@render npm_url(library.npm_url)}
		{:else}
			<p class="panel py_md px_xl font_family_mono text-align:center">
				npm i -D {pkg_json.name}
			</p>
		{/if}
	{/if}
	<!-- TODO more details behind a `<details>`, including author -->
</div>

<!-- TODO better rendering, also show author, etc -->

<style>
	.library-summary {
		padding: var(--space_lg);
		display: flex;
		flex-direction: column;
		align-items: center;
		max-width: var(--max_width, var(--distance_sm));
	}
	.repo-name {
		font-family: var(--font_family_serif);
		font-size: var(--font_size_xl2);
		font-weight: 400;
		text-align: center;
		margin-bottom: var(--space_lg);
	}
</style>
