<script lang="ts">
	import { resolve } from '$app/paths';

	import DocsFooter from '$lib/DocsFooter.svelte';
	import Card from '$lib/Card.svelte';
	import ProjectActivityChart from '$lib/ProjectActivityChart.svelte';
	import ProjectLinks from '$lib/ProjectLinks.svelte';
	import { site_context } from '$lib/site.svelte.ts';
	import Svg from '$lib/Svg.svelte';
	import { logo_fuz_ui } from '$lib/logos.ts';
	import { FUZ_DEV_URL, MAIN_HEADER_MARGIN_TOP } from '$lib/constants.ts';
	import { DOCS_PATH } from '$lib/docs_helpers.svelte.ts';

	const site = site_context.get();
</script>

<main class="box width:100%">
	<div class="box width_atmost_md mb_xl9">
		<section class="box">
			<h1 class="mb_sm" style:margin-top={MAIN_HEADER_MARGIN_TOP}>fuz_ui</h1>
			<div class="box mb_lg"><Svg data={logo_fuz_ui} size="var(--icon_size_xl2)" /></div>
			<blockquote class="unstyled panel shade_05 shadow_bottom_sm py_sm px_xl mb_xl3">
				friendly user zystem {site.glyph}
			</blockquote>
			<div class="mb_lg p_xs2 shadow_md border_radius_sm">
				<div class="width_atmost_sm panel p_lg shadow_inset_xs shade_00">
					<p>
						fuz_ui is a Svelte UI library with components and helpers for making zippy websites.
						It's built on <a href="https://css.fuz.dev/">fuz_css</a>
						and provides a documentation system built on
						<a href="https://svelte-docinfo.fuz.dev/">svelte-docinfo</a>. fuz_ui emphasizes
						capability and efficiency and tries to be simple for those goals.
					</p>
					<p>
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						To learn more see <a href={DOCS_PATH}>the docs</a>
						and <a href="https://github.com/fuzdev/fuz_ui#readme">readme</a>. Feel free to take the
						ideas and <a href="https://github.com/fuzdev/fuz_ui">code</a> for your own purposes.
					</p>
				</div>
			</div>
		</section>
		<section>
			<!-- TODO add color variants -->
			<Card href={DOCS_PATH}>docs{#snippet icon()}{site.glyph}{/snippet}</Card>
		</section>
		<section class="panel p_lg shadow_inset_xs">
			<ProjectLinks />
		</section>
		<section class="panel p_lg shadow_inset_xs">
			<ProjectActivityChart />
			<small class="display:block text-align:right">weekly commit activity, all projects</small>
		</section>
		<section>
			<DocsFooter repo_url={site.repo_url} root_url={FUZ_DEV_URL}>
				{#snippet logo_header()}
					<a href={resolve('/about')} class="mb_xs">about</a>
				{/snippet}
			</DocsFooter>
		</section>
	</div>
</main>
