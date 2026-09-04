<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';

	import { tome_get_by_slug } from '$lib/tome.ts';
	import { intersect } from '$lib/intersect.svelte.ts';
	import TomeContent from '$lib/TomeContent.svelte';
	import TomeSection from '$lib/TomeSection.svelte';
	import TomeSectionHeader from '$lib/TomeSectionHeader.svelte';
	import MdnLink from '$lib/MdnLink.svelte';
	import ModuleLink from '$lib/ModuleLink.svelte';
	import DeclarationLink from '$lib/DeclarationLink.svelte';

	const TOME_SLUG = 'intersect';
	const tome = tome_get_by_slug(TOME_SLUG);

	const get_initial_count = (): number => {
		if (typeof window === 'undefined') return 15;
		return Math.max(10, Math.floor(window.innerHeight / 60));
	};
	const items = $derived(Array.from({ length: get_initial_count() }, (_, i) => i));

	// configurable demo state
	let threshold = $state.raw(0);
	let count = $state.raw(3);
	let rootMargin = $state.raw('0px');

	// reset keys for forcing remounts
	let count_1_key = $state.raw(0);
	let count_2_key = $state.raw(0);
	let configurable_key = $state.raw(0);
</script>

<TomeContent {tome}>
	<section>
		<p>
			The <DeclarationLink name="intersect" /> helper in
			<ModuleLink module_path="intersect.svelte.ts" /> creates an attachment that observes when an
			element enters or leaves the viewport using the
			<MdnLink path="Web/API/Intersection_Observer_API">Intersection Observer API</MdnLink>.
		</p>
		<p>
			Uses the lazy function pattern to optimize reactivity: callbacks can update without recreating
			the observer, preserving state.
		</p>
	</section>

	<section>
		<Code lang="ts" content={`import {intersect} from '@fuzdev/fuz_ui/intersect.svelte.js';`} />
		<Code
			content={`<div {@attach intersect(() => ({intersecting}) => {
  console.log(intersecting ? 'entered' : 'left');
})}>
  scroll me into view
</div>`}
		/>
		<p>
			The callback receives <code>intersecting</code> (boolean), <code>intersections</code> (number
			count), <code>el</code>, <code>observer</code>, and <code>disconnect</code>.
		</p>
	</section>

	<TomeSection>
		<TomeSectionHeader text="threshold: 0 (default)" />
		<p>
			Triggers when the element enters the viewport by at least a pixel. Scroll to see items change
			state.
		</p>
		<Code
			content={`<div {@attach intersect(() => ({
  onintersect: ({intersecting, el}) => {
    el.classList.toggle('intersecting', intersecting);
  }
}))}>
  content
</div>`}
		/>
		<ul class="demo-list">
			{#each items as item (item)}
				<li
					{@attach intersect(() => ({
						onintersect: ({ intersecting, el }) => {
							el.classList.toggle('intersecting', intersecting);
						}
					}))}
				>
					item {item}
				</li>
			{/each}
		</ul>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="threshold: 0.5" />
		<p>Triggers when 50% of the element is visible.</p>
		<Code
			content={`<div {@attach intersect(() => ({
  onintersect: ({intersecting, el}) => {
    el.classList.toggle('intersecting', intersecting);
  },
  options: {threshold: 0.5}
}))}>
  content
</div>`}
		/>
		<ul class="demo-list">
			{#each items as item (item)}
				<li
					{@attach intersect(() => ({
						onintersect: ({ intersecting, el }) => {
							el.classList.toggle('intersecting', intersecting);
						},
						options: { threshold: 0.5 }
					}))}
				>
					item {item}
				</li>
			{/each}
		</ul>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="threshold: 1" />
		<p>Triggers only when the element is fully visible.</p>
		<Code
			content={`<div {@attach intersect(() => ({
  onintersect: ({intersecting, el}) => {
    el.classList.toggle('intersecting', intersecting);
  },
  options: {threshold: 1}
}))}>
  content
</div>`}
		/>
		<ul class="demo-list">
			{#each items as item (item)}
				<li
					{@attach intersect(() => ({
						onintersect: ({ intersecting, el }) => {
							el.classList.toggle('intersecting', intersecting);
						},
						options: { threshold: 1 }
					}))}
				>
					item {item}
				</li>
			{/each}
		</ul>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="count: 1" />
		<p>
			Disconnects after the first intersection cycle (enter and leave). A <code>count</code> of
			<code>0</code> disables observation. Negative or <code>undefined</code> never disconnects.
			(the default)
		</p>
		<Code
			content={`<div {@attach intersect(() => ({
  onintersect: ({intersecting, el}) => {
    el.classList.toggle('intersecting', intersecting);
  },
  count: 1
}))}>
  content
</div>`}
		/>
		{#key count_1_key}
			<ul class="demo-list">
				{#each items as item (item)}
					<li
						{@attach intersect(() => ({
							onintersect: ({ intersecting, el }) => {
								el.classList.toggle('intersecting', intersecting);
							},
							count: 1
						}))}
					>
						item {item}
					</li>
				{/each}
			</ul>
		{/key}
		<button type="button" onclick={() => count_1_key++}>reset</button>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="count: 2" />
		<p>Disconnects after two intersection cycles.</p>
		<Code
			content={`<div {@attach intersect(() => ({
  onintersect: ({intersecting, el}) => {
    el.classList.toggle('intersecting', intersecting);
  },
  count: 2
}))}>
  content
</div>`}
		/>
		{#key count_2_key}
			<ul class="demo-list">
				{#each items as item (item)}
					<li
						{@attach intersect(() => ({
							onintersect: ({ intersecting, el }) => {
								el.classList.toggle('intersecting', intersecting);
							},
							count: 2
						}))}
					>
						item {item}
					</li>
				{/each}
			</ul>
		{/key}
		<button type="button" onclick={() => count_2_key++}>reset</button>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="Configurable" />
		<p>
			Try different parameter combinations. Positive <code>count</code> values disconnect after N
			cycles.
			<code>0</code> disables observation. Negative or <code>undefined</code> never disconnects.
			(the default)
		</p>
		<div class="controls">
			<label>
				<code>count</code>
				<div class="control-inputs">
					<input type="number" min={-1} max={3} step={1} bind:value={count} />
					<input type="range" min={-1} max={3} step={1} bind:value={count} />
				</div>
			</label>
			<label>
				<code>options.threshold</code>
				<div class="control-inputs">
					<input type="number" step={0.1} min={0} max={1} bind:value={threshold} />
					<input type="range" step={0.1} min={0} max={1} bind:value={threshold} />
				</div>
			</label>
			<label>
				<code>options.rootMargin</code>
				<select bind:value={rootMargin}>
					<option value="0px">0px</option>
					<option value="50px">50px</option>
					<option value="100px">100px</option>
					<option value="-25px">-25px</option>
					<option value="-50px">-50px</option>
				</select>
			</label>
		</div>
		{#key configurable_key}
			<ul class="demo-list">
				{#each items as item (item)}
					<li
						{@attach intersect(() => ({
							onintersect: ({ intersecting, el }) => {
								el.classList.toggle('intersecting', intersecting);
							},
							count,
							options: { threshold, rootMargin }
						}))}
					>
						item {item}
					</li>
				{/each}
			</ul>
		{/key}
		<button type="button" onclick={() => configurable_key++}>reset</button>
	</TomeSection>
	<p>Full API docs at <ModuleLink module_path="intersect.svelte.ts" />.</p>
</TomeContent>

<style>
	.controls {
		display: flex;
		gap: var(--space_xl);
		flex-wrap: wrap;
		margin-bottom: var(--space_lg);
	}
	.controls label {
		display: flex;
		flex-direction: column;
		gap: var(--space_xs);
	}
	.control-inputs {
		display: flex;
		align-items: center;
		gap: var(--space_md);
	}
	.control-inputs input {
		width: var(--input_width_min);
		min-width: var(--input_width_min);
	}
	.demo-list {
		max-height: 250px;
		overflow-y: auto;
		border: var(--border_width_1) var(--border_style) var(--border_color);
		border-radius: var(--border_radius_xs);
	}
	.demo-list li {
		padding: var(--space_lg);
		background-color: oklch(0.83 0.08 var(--hue_g) / 0.3);
		font-weight: 700;
		transition: background-color var(--duration_2);
		border-bottom: var(--border_width_1) var(--border_style) var(--border_color);
	}
	.demo-list li:last-child {
		border-bottom: none;
	}
	.demo-list li:global(.intersecting) {
		color: var(--palette_f_50);
		background-color: oklch(0.83 0.06 var(--hue_f) / 0.15);
	}
</style>
