<script lang="ts">
	import { resolve } from '$app/paths';
	import DocsFooter from '@fuzdev/fuz_ui/DocsFooter.svelte';
	import { FUZ_DEV_URL } from '@fuzdev/fuz_ui/constants.ts';
	import { site_context } from '@fuzdev/fuz_ui/site.svelte.ts';
	import Svg from '@fuzdev/fuz_ui/Svg.svelte';
	import { logo_tsv } from '@fuzdev/fuz_ui/logos.ts';

	const site = site_context.get();
</script>

<main>
	<section>
		<header class="box">
			<div class="pt_xl5 pb_xl">
				<Svg data={logo_tsv} size="var(--icon_size_xl2)" />
			</div>
			<h1 class="mt_lg mb_sm">tsv</h1>
			<p class="panel p_md mt_lg" style:text-align="center">
				precise language tools<br />for TypeScript/JS, CSS, and Svelte in Rust
			</p>
		</header>
	</section>
	<section class="box">
		<div class="column gap_lg">
			<a class="font_size_xl chip px_xl py_sm text-align:center" href={resolve('/docs')}>docs</a>
			<a class="font_size_xl chip px_xl py_sm text-align:center" href={resolve('/docs/benchmarks')}>
				benchmarks
			</a>
		</div>
	</section>
	<section class="box">
		<DocsFooter repo_url={site.repo_url} root_url={FUZ_DEV_URL} />
	</section>
</main>

<style>
	main {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin: 0 auto;
	}
</style>
