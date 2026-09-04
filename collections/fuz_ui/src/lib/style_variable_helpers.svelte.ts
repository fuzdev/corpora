import type { StyleVariable } from '@fuzdev/fuz_css/variable.ts';

import { create_context } from './context_helpers.ts';

export const selected_variable_context = create_context(() => new SelectedStyleVariable(null));

// TODO maybe change this to a generic wrapper class for any value?
export class SelectedStyleVariable {
	value: StyleVariable | null = $state.raw()!;

	constructor(initial: StyleVariable | null = null) {
		this.value = initial;
	}
}
