<script lang="ts">
	import type { Snippet } from 'svelte';

	import Docs from '$lib/Docs.svelte';
	import { tomes } from './tomes.ts';
	import { selected_variable_context } from '$lib/style_variable_helpers.svelte.ts';
	import StyleVariableDetail from '$routes/StyleVariableDetail.svelte';
	import Dialog from '$lib/Dialog.svelte';
	import DialogContent from '$lib/DialogContent.svelte';
	import { Library, library_context } from '$lib/library.svelte.ts';
	import { library_json } from '$routes/library.ts';

	const {
		children
	}: {
		children: Snippet;
	} = $props();

	const library = new Library(library_json);
	library_context.set(() => library);

	const selected_variable = selected_variable_context.set();
</script>

<Docs {tomes}>
	{@render children()}
</Docs>

{#if selected_variable.value}
	<Dialog onclose={() => (selected_variable.value = null)}>
		<DialogContent>
			{#snippet children({ close })}
				<div class="panel p_lg box">
					<StyleVariableDetail variable={selected_variable.value} />
					<aside>⚠️ This is unfinished and will change.</aside>
					<button type="button" onclick={close}>ok</button>
				</div>
			{/snippet}
		</DialogContent>
	</Dialog>
{/if}
