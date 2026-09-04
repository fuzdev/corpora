<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	import { tome_get_by_slug } from '$lib/tome.ts';
	import TomeContent from '$lib/TomeContent.svelte';
	import TomeLink from '$lib/TomeLink.svelte';
	import type { SvgData } from '$lib/svg.ts';
	import Svg from '$lib/Svg.svelte';
	import * as icons from '$lib/icons.ts';

	const tome = tome_get_by_slug('icons');

	const icon_entries: Array<{ name: string; data: SvgData }> = Object.entries(icons).map(
		([key, data]) => ({ name: key.slice('icon_'.length), data })
	);
</script>

<TomeContent {tome}>
	<section>
		<p>
			Fuz includes a number of icons available as data that can be mounted with the <TomeLink
				slug="Svg"
			/>
			component. Only the ones you use are included in your bundle.
		</p>
		<Code
			content={`import Svg from '@fuzdev/fuz_ui/Svg.svelte';\nimport {icon_add} from '@fuzdev/fuz_ui/icons.js';`}
			lang="ts"
		/>
		<Code content={`<Svg data={icon_add} />`} />
	</section>
	<section>
		<ul class="icon_grid text-align:center unstyled">
			{#each icon_entries as entry (entry.name)}
				<li>
					<Svg
						data={entry.data}
						width="100%"
						height="auto"
						style="max-width: var(--icon_size_xl3)"
					/>
					<div class="icon_name">{entry.name}</div>
				</li>
			{/each}
		</ul>
	</section>
</TomeContent>

<style>
	/* Caps at 4 columns at full width, shrinking each cell down to a 150px
	   minimum before reflowing to fewer columns. */
	.icon_grid {
		--icon_grid_gap: var(--space_lg);
		display: grid;
		grid-template-columns: repeat(
			auto-fit,
			minmax(max(200px, (100% - 3 * var(--icon_grid_gap)) / 4), 1fr)
		);
		gap: var(--icon_grid_gap);
	}

	li :global(svg) {
		background-color: var(--shade_05);
	}

	.icon_name {
		font-family: var(--font_family_mono);
		font-size: var(--font_size_sm);
		margin-top: var(--space_xs);
	}
</style>
