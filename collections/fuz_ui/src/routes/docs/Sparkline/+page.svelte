<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';

	import { tome_get_by_slug } from '$lib/tome.ts';
	import Sparkline from '$lib/Sparkline.svelte';
	import TomeContent from '$lib/TomeContent.svelte';
	import TomeSection from '$lib/TomeSection.svelte';
	import TomeSectionHeader from '$lib/TomeSectionHeader.svelte';
	import DeclarationLink from '$lib/DeclarationLink.svelte';
	import MdnLink from '$lib/MdnLink.svelte';
	import ModuleLink from '$lib/ModuleLink.svelte';
	import ProjectActivityChart from '$lib/ProjectActivityChart.svelte';
	import { project_stats_data } from '$lib/project_stats_data.ts';
	import { project_stats_to_monthly_series } from '$lib/project_stats.ts';
	import { project_items } from '$lib/projects.ts';

	const TOME_SLUG = 'Sparkline';
	const tome = tome_get_by_slug(TOME_SLUG);

	const a = [3, 5, 2, 8, 6, 9, 4, 7, 5, 10, 8, 12];
	const b = [1, 0, 2, 1, 3, 0, 1, 2, 0, 1, 2, 3];

	const { series, max } = project_stats_to_monthly_series(project_stats_data);
	const color_class_by_name = new Map(project_items.map((p) => [p.name, p.color_class]));
</script>

<TomeContent {tome}>
	<section>
		<p>
			A <DeclarationLink name="Sparkline" /> renders a series of values as a small inline SVG line
			graph, designed for comparable small multiples.
		</p>
		<Code lang="ts" content={`import Sparkline from '@fuzdev/fuz_ui/Sparkline.svelte';`} />
		<Code content={`<Sparkline values={[3, 5, 2, 8, 6, 9, 4, 7, 5, 10, 8, 12]} />`} />
		<p><Sparkline values={a} /></p>
	</section>
	<TomeSection>
		<TomeSectionHeader text="With a shared max" />
		<p>
			By default each sparkline stretches its own max to full height. Pass a shared
			<code>max</code>
			so a set of sparklines renders at the same vertical scale and stays visually comparable:
		</p>
		<Code
			content={`<Sparkline values={a} max={12} />
<Sparkline values={b} max={12} />`}
		/>
		<p>Individually scaled (misleading — the second series peaks at 3):</p>
		<p><Sparkline values={a} /> <Sparkline values={b} /></p>
		<p>Shared scale:</p>
		<p><Sparkline values={a} max={12} /> <Sparkline values={b} max={12} /></p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="With a nonlinear scale" />
		<p>
			Under a large shared <code>max</code>, low-activity series hug the baseline. Set
			<code>scale</code>
			to compress the top of the range so small values stay legible — increasingly so from
			<code>"sqrt"</code>
			to a power exponent (a number in <code>(0, 1]</code>, where <code>1</code> is linear) to
			<code>"log"</code>. The alpha fade still tracks the linear ratio, so it keeps encoding true
			magnitude:
		</p>
		<Code
			content={`<Sparkline values={b} max={12} scale="sqrt" />
<Sparkline values={b} max={12} scale={1 / 3} />
<Sparkline values={b} max={12} scale="log" />`}
		/>
		<p>
			<Sparkline values={b} max={12} /> linear, <Sparkline values={b} max={12} scale="sqrt" /> sqrt,
			<Sparkline values={b} max={12} scale={1 / 3} /> cube root,
			<Sparkline values={b} max={12} scale="log" />
			log
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="With custom color" />
		<p>
			The stroke uses
			<MdnLink path="Web/CSS/color_value" hash="currentcolor_keyword">currentColor</MdnLink>, so set
			<code>color</code> on the component or a parent: (see the
			<a href="https://css.fuz.dev/docs/colors#color-variables">fuz_css colors docs</a>)
		</p>
		<Code content={`<span class="color_b_50"><Sparkline values={a} /></span>`} />
		<p>
			<span class="color_b_50"><Sparkline values={a} /></span>
			<span class="color_d_50"><Sparkline values={a} /></span>
			<span class="color_e_50"><Sparkline values={a} /></span>
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="With alpha scaling" />
		<p>
			Each point's stroke alpha scales with its value, from <code>alpha_floor</code> at 0 (default
			0.4) up to 1 at <code>max</code>, de-emphasizing quiet stretches. Set
			<code>alpha_floor</code>
			to 1 to disable the fade:
		</p>
		<Code content={`<Sparkline values={b} alpha_floor={1} />`} />
		<p>
			<Sparkline values={b} /> default fade, <Sparkline values={b} alpha_floor={1} /> no fade
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="Project commit activity" />
		<p>
			The dataset behind <DeclarationLink name="ProjectLinks" />: monthly commit counts per project
			from <ModuleLink module_path="project_stats_data.ts" />, derived with
			<DeclarationLink name="project_stats_to_monthly_series" /> so every project shares one time
			window and one scale, rendered with a cube-root <code>scale</code>.
		</p>
		<ul class="unstyled mb_lg">
			{#each series as { name, counts } (name)}
				<li class="row gap_md">
					<span class="project-name">{name}</span>
					<span class={color_class_by_name.get(name)}>
						<Sparkline
							values={counts}
							{max}
							scale={1 / 3}
							width={200}
							label="monthly commit activity"
						/>
					</span>
				</li>
			{/each}
		</ul>
		<p>
			<DeclarationLink name="ProjectActivityChart" /> draws every project's weekly series over one
			another at a shared scale, built on the same geometry via
			<ModuleLink module_path="sparkline.ts" />
			— hover a line for the project's stats:
		</p>
		<ProjectActivityChart />
	</TomeSection>
</TomeContent>

<style>
	.project-name {
		/* fits the longest project name so the sparklines align in a column */
		width: 11rem;
		white-space: nowrap;
		flex-shrink: 0;
	}
</style>
