<script module lang="ts">
	const minute_of_day = (): number => {
		const now = new Date();
		return now.getHours() * 60 + now.getMinutes();
	};
</script>

<script lang="ts">
	import { random_int, shuffle } from '@fuzdev/fuz_util/random.ts';
	import { create_random_alea } from '@fuzdev/fuz_util/random_alea.ts';
	import type { SvelteHTMLElements } from 'svelte/elements';

	import Svg from './Svg.svelte';
	import { logo_fuz } from './logos.ts';

	const {
		spiders = [
			'var(--palette_a_50)',
			'var(--palette_b_50)',
			'var(--palette_c_50)',
			'var(--palette_d_50)',
			'var(--palette_e_50)',
			'var(--palette_f_50)',
			'var(--palette_g_50)',
			'var(--palette_h_50)',
			'var(--palette_i_50)',
			'var(--palette_j_50)'
		],
		seed = minute_of_day(),
		random = create_random_alea(seed),
		...rest
	}: {
		spiders?: Array<string>; // for now, just colors
		seed?: unknown;
		random?: typeof Math.random;
	} & SvelteHTMLElements['div'] = $props();

	const shuffled = $derived(shuffle(spiders.slice(), (min, max) => random_int(min, max, random)));
	const rotations = $derived(shuffled.map(() => random_int(0, 359, random)));
</script>

<!-- TODO animate each in randomly -->
<!-- TODO show when intersected in viewport, maybe inline `svelte-intersect` in Fuz? -->
<div {...rest} class="spiders {rest.class}" style:--spider_count={spiders.length}>
	{#each shuffled as color, i (color)}
		<Svg data={logo_fuz} fill={color} style="transform: rotate(${rotations[i]}deg)" />
	{/each}
</div>

<style>
	.spiders {
		--width: calc(100% / var(--spider_count));
		pointer-events: none;
		position: relative;
		z-index: 1;
		overflow: hidden;
		display: grid;
		grid-template-columns: repeat(var(--spider_count), 1fr);
	}
</style>
