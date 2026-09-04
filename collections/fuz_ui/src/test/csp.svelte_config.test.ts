import { test, assert } from 'vitest';

import config from '../../svelte.config.js';
import { create_csp_directives } from '$lib/csp.ts';
import { csp_directives_of_fuzdev } from '$lib/csp_of_fuzdev.ts';

// The CSP in svelte.config.js is hand-rolled (not produced by `create_csp_directives`)
// because self-import-from-dist is fragile during builds. This test enforces that the
// hand-rolled value still equals what the helper would produce, so the two can't drift.
test('svelte.config.js mirrors create_csp_directives({extend: [csp_directives_of_fuzdev]})', () => {
	assert.deepEqual(
		config.kit?.csp?.directives,
		create_csp_directives({ extend: [csp_directives_of_fuzdev] })
	);
});
