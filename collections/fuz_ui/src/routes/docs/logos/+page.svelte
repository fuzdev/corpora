<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	import { tome_get_by_slug } from '#lib/tome.ts';
	import TomeContent from '#lib/TomeContent.svelte';
	import TomeLink from '#lib/TomeLink.svelte';
	import Svg from '#lib/Svg.svelte';
	import {
		logo_gro,
		logo_fuz,
		logo_fuz_css,
		logo_fuz_code,
		logo_fuz_blog,
		logo_fuz_repos,
		logo_github,
		logo_mdn,
		logo_fuz_template,
		logo_fuz_util,
		logo_fuz_ui,
		logo_tsv,
		logo_fuz_app,
		logo_fuz_docs,
		logo_svelte_docinfo,
		logo_mdz
	} from '#lib/logos.ts';

	const TOME_SLUG = 'logos';

	const tome = tome_get_by_slug(TOME_SLUG);
</script>

<TomeContent {tome}>
	<section>
		<p>
			Fuz includes a number of logos available as data that can be mounted with the
			<TomeLink slug="Svg" /> component. Only the ones you use are included in your bundle.
		</p>
	</section>
	<section>
		<ul
			class="display:flex flex-wrap:wrap justify-content:center gap_lg text-align:center unstyled"
		>
			<li>
				<a class="box" href="https://www.fuz.dev/">
					<Svg data={logo_fuz} size="var(--icon_size_xl3)" />
				</a>
				<Code content={`<Svg data={logo_fuz} />`} />
			</li>
			<li>
				<a class="box" href="https://ui.fuz.dev/">
					<Svg data={logo_fuz_ui} size="var(--icon_size_xl3)" />
				</a>
				<Code content={`<Svg data={logo_fuz_ui} />`} />
			</li>
			<li>
				<a class="box" href="https://app.fuz.dev/">
					<Svg data={logo_fuz_app} size="var(--icon_size_xl3)" />
				</a>
				<Code content={`<Svg data={logo_fuz_app} />`} />
			</li>
			<li>
				<a class="box" href="https://css.fuz.dev/">
					<Svg data={logo_fuz_css} size="var(--icon_size_xl3)" />
				</a>
				<Code content={`<Svg data={logo_fuz_css} />`} />
			</li>
			<li>
				<a class="box" href="https://template.fuz.dev/">
					<Svg data={logo_fuz_template} size="var(--icon_size_xl3)" />
				</a>
				<Code content={`<Svg data={logo_fuz_template} />`} />
			</li>
			<li>
				<a class="box" href="https://code.fuz.dev/">
					<Svg data={logo_fuz_code} size="var(--icon_size_xl3)" />
				</a>
				<Code content={`<Svg data={logo_fuz_code} />`} />
			</li>
			<li>
				<a class="box" href="https://mdz.fuz.dev/">
					<Svg data={logo_mdz} size="var(--icon_size_xl3)" />
				</a>
				<Code content={`<Svg data={logo_mdz} />`} />
			</li>
			<li>
				<a class="box" href="https://blog.fuz.dev/">
					<Svg data={logo_fuz_blog} size="var(--icon_size_xl3)" />
				</a>
				<Code content={`<Svg data={logo_fuz_blog} />`} />
			</li>
			<li>
				<a class="box" href="https://repos.fuz.dev/">
					<Svg data={logo_fuz_repos} size="var(--icon_size_xl3)" />
				</a>
				<Code content={`<Svg data={logo_fuz_repos} />`} />
			</li>
			<li>
				<a class="box" href="https://docs.fuz.dev/">
					<Svg data={logo_fuz_docs} size="var(--icon_size_xl3)" />
				</a>
				<Code content={`<Svg data={logo_fuz_docs} />`} />
			</li>
			<li>
				<a class="box" href="https://util.fuz.dev/">
					<Svg data={logo_fuz_util} size="var(--icon_size_xl3)" />
				</a>
				<Code content={`<Svg data={logo_fuz_util} />`} />
			</li>
			<li>
				<a class="box" href="https://gro.ryanatkn.com/">
					<Svg data={logo_gro} size="var(--icon_size_xl3)" />
				</a>
				<Code content={`<Svg data={logo_gro} />`} />
			</li>
			<li>
				<a class="box" href="https://tsv.fuz.dev/">
					<Svg data={logo_tsv} size="var(--icon_size_xl3)" />
				</a>
				<Code content={`<Svg data={logo_tsv} />`} />
			</li>
			<li>
				<a class="box" href="https://svelte-docinfo.fuz.dev/">
					<Svg data={logo_svelte_docinfo} size="var(--icon_size_xl3)" />
				</a>
				<Code content={`<Svg data={logo_svelte_docinfo} />`} />
			</li>
			<li>
				<a class="box" href="https://github.com/">
					<Svg data={logo_github} size="var(--icon_size_xl3)" />
				</a>
				<Code content={`<Svg data={logo_github} />`} />
			</li>
			<li>
				<a class="box" href="https://developer.mozilla.org/">
					<Svg data={logo_mdn} size="var(--icon_size_xl3)" />
				</a>
				<Code content={`<Svg data={logo_mdn} />`} />
			</li>
		</ul>
	</section>
</TomeContent>

<style>
	li {
		margin-bottom: var(--space_xl7);
	}

	li :global(svg) {
		background-color: var(--shade_05);
	}

	a {
		--text_color: var(--text_90);
		margin-bottom: var(--space_lg);
	}
</style>
