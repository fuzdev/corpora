<!--
@component

Renders library metadata (name, description, links, license) and a module index
with file-type coloring. Uses svelte-docinfo's file type predicates for module classification.

@see `library.svelte.ts` for the `Library` wrapper class
@see {@link https://github.com/ryanatkn/svelte-docinfo svelte-docinfo} for the analysis library
-->
<script lang="ts">
	import { page } from '$app/state';
	import { format_url } from '@fuzdev/fuz_util/url.ts';
	import type { OmitStrict } from '@fuzdev/fuz_util/types.ts';
	import type { Snippet } from 'svelte';
	import type { SvelteHTMLElements } from 'svelte/elements';

	import { library_context, type Library } from './library.svelte.ts';
	import ImgOrSvg from './ImgOrSvg.svelte';
	import DeclarationLink from './DeclarationLink.svelte';
	import ModuleLink from './ModuleLink.svelte';
	import { url_github_file } from '@fuzdev/fuz_util/package_helpers.ts';
	import { isTypescript, isSvelte, isCss, isJson } from 'svelte-docinfo/source.js';

	const {
		library,
		links_full = false,
		repo_name,
		description,
		tagline,
		npm_url,
		homepage_url,
		children,
		...rest
	}: OmitStrict<SvelteHTMLElements['div'], 'children'> & {
		library: Library;
		/**
		 * Link the module/declaration index to the library's own deployed docs
		 * (`url_api_full`) instead of site-local paths. Use when rendering a
		 * foreign library on a different site, e.g. an aggregator.
		 */
		links_full?: boolean;
		repo_name?: Snippet<[repo_name: string]>;
		description?: Snippet<[description: string]>;
		tagline?: Snippet<[description: string]>;
		npm_url?: Snippet<[npm_url: string]>;
		homepage_url?: Snippet<[homepage_url: string]>;
		children?: Snippet<[library: Library]>;
	} = $props();

	library_context.set(() => library);

	// TODO show other data (lines of code)

	const { pkg_json } = $derived(library);

	const license_url = $derived(
		pkg_json.license ? url_github_file(library.repo_url, 'LICENSE') : null
	);
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->

<div {...rest} class="library-detail {rest.class}">
	<!-- TODO maybe continue this snippet pattern, or maybe simplify? -->
	<div class="info">
		<div class="display:flex flex:1">
			<!-- add yet another wrapper so it flows like we want -->
			<div>
				<header>
					{#if repo_name}
						{@render repo_name(library.repo_name)}
					{:else}
						<div class="repo-name">
							{library.repo_name}{#if pkg_json.glyph}&nbsp;{pkg_json.glyph}{/if}
						</div>
					{/if}
				</header>
				{@render children?.(library)}
				{#if pkg_json.description}
					{#if description}
						{@render description(pkg_json.description)}
					{:else}
						<div class="description">{pkg_json.description}</div>
					{/if}
				{/if}
				{#if pkg_json.tagline}
					{#if tagline}
						{@render tagline(pkg_json.tagline)}
					{:else}
						<div class="tagline">{pkg_json.tagline}</div>
					{/if}
				{/if}
				{#if library.npm_url}
					{#if npm_url}
						{@render npm_url(library.npm_url)}
					{:else}
						<blockquote class="npm-url">npm i -D {pkg_json.name}</blockquote>
					{/if}
				{/if}
				<!-- TODO accessible HTML -->
				<section class="properties">
					{#if library.homepage_url}
						{#if homepage_url}
							{@render homepage_url(library.homepage_url)}
						{:else}
							<span class="title">homepage</span>
							<div class="content">
								<a
									class={['chip', { selected: library.homepage_url === page.url.href }]}
									href={library.homepage_url}
								>
									{#if library.logo_url}
										<ImgOrSvg
											src={library.logo_url}
											label={library.logo_alt}
											size="16px"
											class="mr_xs"
										/>
									{/if}
									{format_url(library.homepage_url)}
								</a>
							</div>
						{/if}
					{/if}
					{#if library.repo_url}
						<span class="title">repo</span>
						<div class="content">
							<a class="chip" title="repo" href={library.repo_url}>
								{library.owner_name}/{library.repo_name}
							</a>
						</div>
					{/if}
					{#if library.npm_url}
						<span class="title">npm</span>
						<div class="content">
							<a class="chip" title="npm" href={library.npm_url}>{pkg_json.name}</a>
						</div>
					{/if}
					{#if library.changelog_url}
						<span class="title">version</span>
						<div class="content">
							<a class="chip" title="version" href={library.changelog_url}>{pkg_json.version}</a>
						</div>
					{/if}
					{#if license_url}
						<span class="title">license</span>
						<div class="content">
							<a class="chip" title="license" href={license_url}>{pkg_json.license}</a>
						</div>
					{/if}
				</section>
			</div>
		</div>
		{#if library.logo_url}
			<div class="logo">
				<ImgOrSvg
					src={library.logo_url}
					label={library.logo_alt}
					size="var(--font_size, var(--icon_size_xl2))"
				/>
			</div>
		{/if}
	</div>
	{#if library.modules.length > 0 && library.repo_url}
		<section>
			<menu class="unstyled">
				{#each library.modules as module (module.path)}
					<!-- TODO improve rendering and enrich data - start with the type (not just extension - mime?) -->
					<li
						class={[
							'module',
							{
								ts: isTypescript(module.path),
								svelte: isSvelte(module.path),
								css: isCss(module.path),
								json: isJson(module.path)
							}
						]}
					>
						<div class="module-content">
							<span class="font_size_xl">
								<ModuleLink module_path={module.path} full={links_full}>
									{module.path}
								</ModuleLink>
							</span>
							{#if module.has_declarations}
								<ul class="declarations unstyled">
									{#each module.declarations as declaration (declaration.name)}
										<li>
											<DeclarationLink
												name={declaration.name}
												module_path={module.path}
												full={links_full}
											/>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					</li>
				{/each}
			</menu>
		</section>
	{/if}

	<!-- TODO maybe add more details, possibly behind a `<details>`, including author -->
	<!-- TODO render exports, then link to source, then tomes -->
</div>

<!-- TODO better rendering, also show author, etc -->

<style>
	.library-detail {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		width: 100%;
		max-width: var(--max_width, var(--distance_md));
		overflow-x: auto;
	}

	.info {
		width: 100%;
		display: flex;
		flex-wrap: wrap;
	}

	.logo {
		flex-shrink: 0;
		padding: 0 var(--space_xl);
	}

	header {
		margin-bottom: var(--space_lg);
	}

	section {
		width: 100%;
		margin-bottom: var(--space_lg);
	}
	.repo-name {
		font-family: var(--font_family_serif);
		font-size: var(--font_size_xl2);
		font-weight: 400;
	}
	.npm-url {
		font-family: var(--font_family_mono);
		text-align: center;
		margin-bottom: var(--space_lg);
	}
	.description {
		margin-bottom: var(--space_lg);
	}
	.tagline {
		margin-bottom: var(--space_lg);
	}
	.properties {
		display: grid;
		grid-template-columns: 80px 1fr;
		gap: var(--space_xs2);
		margin-bottom: var(--space_lg);
	}
	.title {
		text-align: right;
	}
	.content {
		display: flex;
	}
	.content a {
		display: flex;
		align-items: center;
		margin-left: var(--space_xs);
	}
	.module {
		margin-bottom: var(--space_xs);
		--link_color: var(--text_70);
	}
	.module-content {
		background-color: var(--shade_10);
		border-radius: var(--border_radius_sm);
		padding: var(--space_xs);
	}
	/* TODO probably add variables/classes for these */
	.ts {
		--link_color: var(--palette_a_50);
	}
	.svelte {
		--link_color: var(--palette_h_50);
	}
	.css {
		--link_color: var(--palette_b_50);
	}
	.json {
		--link_color: var(--palette_f_50);
	}
	/* TODO extract */
	.declarations {
		display: flex;
		flex: 1;
		flex-direction: row;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: var(--space_xs) 0;
		padding-top: var(--space_xs);
	}
</style>
