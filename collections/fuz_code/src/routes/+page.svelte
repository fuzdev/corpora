<script lang="ts">
	import DocsFooter from '@fuzdev/fuz_ui/DocsFooter.svelte';
	import { site_context } from '@fuzdev/fuz_ui/site.svelte.ts';
	import { FUZ_DEV_URL, MAIN_HEADER_MARGIN_TOP } from '@fuzdev/fuz_ui/constants.ts';
	import { DOCS_PATH } from '@fuzdev/fuz_ui/docs_helpers.svelte.ts';
	import Card from '@fuzdev/fuz_ui/Card.svelte';
	import Svg from '@fuzdev/fuz_ui/Svg.svelte';
	import { logo_fuz_code } from '@fuzdev/fuz_ui/logos.ts';
	import { resolve } from '$app/paths';

	import Code from '$lib/Code.svelte';

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
				fuz_code is a syntax highlighter: it turns source code into HTML or highlighted ranges with
				token CSS classes, and knows nothing about the DOM. It originated as a fork and by-hand
				rewrite of
				<a href="https://github.com/PrismJS/prism">Prism</a>
				by <a href="https://lea.verou.me/">Lea Verou</a>, with a redesigned tokenizer that replaces
				regular expressions with lexers per language emitting a flat token event stream.
			</p>
		</section>
		<section class="box width:100%">
			<Code content={hero_example} />
		</section>
		<section class="box gap_md width:100%">
			<Card href={DOCS_PATH}>docs{#snippet icon()}{/snippet}</Card>
			<Card href={resolve('/docs/samples')}>samples{#snippet icon()}{/snippet}</Card>
			<Card href={resolve('/docs/benchmark')}>benchmark{#snippet icon()}{/snippet}</Card>
		</section>
		<section>
			<DocsFooter repo_url={site.repo_url} root_url={FUZ_DEV_URL} />
		</section>
	</div>
</main>
