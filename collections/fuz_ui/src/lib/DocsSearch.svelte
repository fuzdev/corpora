<script lang="ts">
	import type { SvelteHTMLElements } from 'svelte/elements';

	import { icon_close } from './icons.ts';
	import Svg from './Svg.svelte';

	let {
		placeholder = 'search modules and declarations...',
		module_count,
		declaration_count,
		filtered_module_count,
		filtered_declaration_count,
		search_query = $bindable(), // eslint-disable-line @typescript-eslint/no-useless-default-assignment
		...rest
	}: SvelteHTMLElements['input'] & {
		placeholder?: string;
		/**
		 * Total number of modules.
		 */
		module_count?: number;
		/**
		 * Total number of declarations.
		 */
		declaration_count?: number;
		/**
		 * Number of modules after filtering.
		 */
		filtered_module_count?: number;
		/**
		 * Number of declarations after filtering.
		 */
		filtered_declaration_count?: number;
		search_query: string;
	} = $props();

	const has_search = $derived(search_query.trim().length > 0);

	const total_text = $derived.by(() => {
		const parts: Array<string> = [];
		if (module_count !== undefined) {
			parts.push(module_count === 1 ? '1 module' : `${module_count} modules`);
		}
		if (declaration_count !== undefined) {
			parts.push(declaration_count === 1 ? '1 declaration' : `${declaration_count} declarations`);
		}
		return parts.join(' · ');
	});

	const result_text = $derived.by(() => {
		const parts: Array<string> = [];
		if (filtered_module_count !== undefined) {
			parts.push(filtered_module_count === 1 ? '1 module' : `${filtered_module_count} modules`);
		}
		if (filtered_declaration_count !== undefined) {
			parts.push(
				filtered_declaration_count === 1
					? '1 declaration'
					: `${filtered_declaration_count} declarations`
			);
		}
		return parts.join(' · ');
	});
</script>

<label class="display:block position:relative">
	<input {...rest} type="search" {placeholder} bind:value={search_query} />
	{#if has_search}
		<button
			type="button"
			class="plain icon_button position:absolute right:0 top:0"
			onclick={() => {
				search_query = '';
			}}
			title="clear search"
			aria-label="clear search"
		>
			<Svg data={icon_close} />
		</button>
	{/if}
</label>

<p>
	{#if has_search && result_text}
		{result_text} found
	{:else if total_text}
		{total_text}
	{/if}
</p>
