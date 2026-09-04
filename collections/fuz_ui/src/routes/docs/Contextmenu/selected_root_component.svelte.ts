import { create_context } from '$lib/context_helpers.ts';
import ContextmenuRoot from '$lib/ContextmenuRoot.svelte';
import ContextmenuRootForSafariCompatibility from '$lib/ContextmenuRootForSafariCompatibility.svelte';

export const selected_contextmenu_root_component_context = create_context(
	() => new SelectedContextmenuRootComponent('standard')
);

export type ContextmenuRootVariant = 'standard' | 'compat';

export class SelectedContextmenuRootComponent {
	variant: ContextmenuRootVariant = $state.raw()!;

	component = $derived(
		this.variant === 'standard' ? ContextmenuRoot : ContextmenuRootForSafariCompatibility
	);

	name = $derived(
		this.component === ContextmenuRoot ? 'ContextmenuRoot' : 'ContextmenuRootForSafariCompatibility'
	);

	constructor(initial_variant: ContextmenuRootVariant = 'standard') {
		this.variant = initial_variant;
	}
}
