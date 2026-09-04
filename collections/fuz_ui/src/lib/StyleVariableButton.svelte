<script lang="ts">
	import type { SvelteHTMLElements } from 'svelte/elements';
	import { default_variables } from '@fuzdev/fuz_css/variables.ts';

	import { selected_variable_context } from './style_variable_helpers.svelte.ts';

	const {
		name,
		inline = false,
		plain = true,
		onclick,
		children,
		...rest
	}: SvelteHTMLElements['button'] & {
		name: string; // TODO type? generate from `tomes`? or keep extensible?
		inline?: boolean;
		plain?: boolean;
	} = $props();

	// TODO add contextmenu behavior

	const variable = $derived.by(() => {
		const v = default_variables.find((v) => v.name === name);
		if (!v) throw new Error(`cannot find variable named "${name}"`);
		return v;
	});

	const selected_variable = selected_variable_context.get();
</script>

<button
	type="button"
	{...rest}
	class={[rest.class, { inline, plain }]}
	onclick={(e) => {
		selected_variable.value = variable;
		onclick?.(e);
	}}
>
	{#if children}{@render children()}{:else}<span class="font_family_mono">{name}</span>{/if}
</button>

<style>
	button {
		min-height: var(--input_height_compact);
	}
</style>
