<script lang="ts">
	import { color_schemes, type ColorScheme } from '@fuzdev/fuz_css/theme.ts';
	import type { SvelteHTMLElements } from 'svelte/elements';

	import { theme_state_context } from './theme_state.svelte.ts';
	import RadioMenu from './RadioMenu.svelte';

	const get_theme_state = theme_state_context.get();

	const {
		value = get_theme_state(),
		...rest
	}: SvelteHTMLElements['menu'] & {
		value?: { color_scheme: ColorScheme };
	} = $props();
</script>

<RadioMenu
	{...rest}
	class={['color-scheme-control', rest.class]}
	options={color_schemes}
	bind:value={value.color_scheme}
	label={(color_scheme) => color_scheme}
	title={(color_scheme, selected) =>
		selected ? `${color_scheme} color scheme is selected` : `select ${color_scheme} color scheme`}
/>
