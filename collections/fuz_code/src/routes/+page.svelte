<script lang="ts">
	import DocsFooter from '@fuzdev/fuz_ui/DocsFooter.svelte';
	import { site_context } from '@fuzdev/fuz_ui/site.svelte.ts';
	import { FUZ_DEV_URL, MAIN_HEADER_MARGIN_TOP } from '@fuzdev/fuz_ui/constants.ts';
	import { DOCS_PATH } from '@fuzdev/fuz_ui/docs_helpers.svelte.ts';
	import Card from '@fuzdev/fuz_ui/Card.svelte';
	import Svg from '@fuzdev/fuz_ui/Svg.svelte';
	import { logo_fuz_code } from '@fuzdev/fuz_ui/logos.ts';
	import { resolve } from '$app/paths';

	import Code from '#lib/Code.svelte';

	const site = site_context.get();

	const hero_example = '<h1>hello {name}</h1>';
</script>

<svelte:head>
	<title>@fuzdev/fuz_code</title>
</svelte:head>

<main class="box width:100% mb_xl5" style:padding="var(--space_xl3) 0">
	<div class="width_atmost_md">
		<section class="box" style:padding-top={MAIN_HEADER_MARGIN_TOP}>
			<h1>fuz_code</h1>
			<Svg data={logo_fuz_code} size="var(--icon_size_xl2)" />
		</section>
		<section>
			<p>
				fuz_code is a syntax styler: it turns source code into HTML with token CSS classes, or
				ranges for the
				<a href="https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API">
					CSS Custom Highlight API
				</a>. It originated as a fork of <a href="https://prismjs.com/">Prism</a> by
				<a href="https://lea.verou.me/">Lea Verou</a> and has since been rewritten: each language
				has a lexer that scans without regular expressions and emits tokens as a flat stream in a
				typed array, for high performance. The flat token stream is an idea borrowed from
				<a href="https://pngwn.at/">pngwn</a>, the author of
				<a href="https://twinkleplop.pngwn.at/">Twinkleplop</a> (a featureful alternative to
				fuz_code). See
				<a href="https://syntax-highlighter-bench.ryanatkn.com/">syntax-highlighter-bench</a> to
				compare them with Prism and Shiki.
			</p>
		</section>
		<section class="box width:100%">
			<Code content={hero_example} />
		</section>
		<section class="box gap_md width:100%">
			<Card href={DOCS_PATH}>docs</Card>
			<Card href={resolve('/docs/samples')}>samples</Card>
			<Card href={resolve('/docs/benchmark')}>benchmark</Card>
		</section>
		<section>
			<DocsFooter repo_url={site.repo_url} root_url={FUZ_DEV_URL} />
		</section>
	</div>
</main>
