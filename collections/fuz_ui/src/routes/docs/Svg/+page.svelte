<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';

	import { tome_get_by_slug } from '$lib/tome.ts';
	import Svg from '$lib/Svg.svelte';
	import TomeContent from '$lib/TomeContent.svelte';
	import TomeSection from '$lib/TomeSection.svelte';
	import TomeSectionHeader from '$lib/TomeSectionHeader.svelte';
	import { logo_fuz, logo_github } from '$lib/logos.ts';
	import type { SvgData } from '$lib/svg.ts';

	const TOME_SLUG = 'Svg';
	const tome = tome_get_by_slug(TOME_SLUG);

	const logo_fuz_gradient = {
		label: 'a friendly green-to-blue gradient spider facing you',
		fill: 'url(#logo_fuz_gradient)',
		paths: logo_fuz.paths,
		gradients: [
			{
				type: 'linear',
				id: 'logo_fuz_gradient',
				stops: [
					{ offset: '0%', color: '#3db33d' },
					{ offset: '100%', color: '#6199d1' }
				]
			}
		]
	} satisfies SvgData;
</script>

<!-- eslint-disable svelte/no-useless-mustaches -->

<TomeContent {tome}>
	<section>
		<!-- TODO make this a generic data-driven helper -->
		<Code lang="ts" content={`import Svg from '@fuzdev/fuz_ui/Svg.svelte';`} />
		<Code content={`<Svg data={logo_fuz} />`} />
		<p>Fills available space by default:</p>
		<Svg data={logo_fuz} />
	</section>
	<TomeSection>
		<TomeSectionHeader text="With custom size" />
		<p>
			Set <code>size</code>: (see the
			<a href="https://css.fuz.dev/docs/typography#font-sizes">fuz_css typography docs</a>)
		</p>
		<Code content={`<Svg data={logo_fuz} size="var(--icon_size_xl)" />`} />
		<p><Svg data={logo_fuz} size="var(--icon_size_xl)" /></p>
		<Code content={`<Svg data={logo_fuz} size="var(--icon_size_sm)" />`} />
		<p><Svg data={logo_fuz} size="var(--icon_size_sm)" /></p>
		<p>
			Set <code>--font_size</code> on the component or a parent:
		</p>
		<Code
			content={`<span style:--font_size="var(--icon_size_xl)"><Svg data={logo_fuz} /></span>`}
		/>
		<p><span style:--font_size="var(--icon_size_xl)"><Svg data={logo_fuz} /></span></p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="With custom color" />
		<p>
			Set <code>fill</code>: (see the
			<a href="https://css.fuz.dev/docs/colors#color-variables">fuz_css colors docs</a>)
		</p>
		<Code content={`<Svg data={logo_fuz} fill="var(--palette_d_50)" />`} />
		<p class="width_atmost_sm">
			<Svg data={logo_fuz} fill="var(--palette_d_50)" />
		</p>
		<Code content={`<Svg data={logo_fuz} fill="var(--palette_b_50)" />`} />
		<p class="width_atmost_sm">
			<Svg data={logo_fuz} fill="var(--palette_b_50)" />
		</p>
		<p>
			Set <code>--text_color</code> on the component or a parent, for svgs that have no default
			fill:
		</p>
		<Code
			content={`<span style:--text_color="var(--palette_i_50)"><Svg data={logo_github} /></span>`}
		/>
		<p class="width_atmost_sm">
			<span style:--text_color="var(--palette_i_50)"><Svg data={logo_github} /></span>
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="With gradients" />
		<p>
			Define gradients on the data with <code>gradients</code> and reference them by id from a
			<code>fill</code> or <code>stroke</code>:
		</p>
		<Code
			lang="ts"
			content={`const logo_fuz_gradient = {
	label: 'a friendly green-to-blue gradient spider facing you',
	fill: 'url(#logo_fuz_gradient)',
	paths: logo_fuz.paths,
	gradients: [
		{
			type: 'linear',
			id: 'logo_fuz_gradient',
			stops: [
				{offset: '0%', color: '#3db33d'},
				{offset: '100%', color: '#6199d1'},
			],
		},
	],
} satisfies SvgData;`}
		/>
		<Code content={`<Svg data={logo_fuz_gradient} />`} />
		<p class="width_atmost_sm">
			<Svg data={logo_fuz_gradient} />
		</p>
	</TomeSection>
</TomeContent>
