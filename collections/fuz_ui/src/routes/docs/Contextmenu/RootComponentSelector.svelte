<script lang="ts">
	import DeclarationLink from '$lib/DeclarationLink.svelte';
	import { selected_contextmenu_root_component_context } from './selected_root_component.svelte.ts';

	const selected_root_component = selected_contextmenu_root_component_context.get();
</script>

<fieldset>
	<legend><h4>Selected root component:</h4></legend>
	<label class="row">
		<input type="radio" bind:group={selected_root_component.variant} value="standard" />
		<div>standard <DeclarationLink name="ContextmenuRoot" /></div>
	</label>
	<label class="row">
		<input type="radio" bind:group={selected_root_component.variant} value="compat" />
		<div>iOS compat <DeclarationLink name="ContextmenuRootForSafariCompatibility" /></div>
	</label>
</fieldset>
