import { test, assert, describe } from 'vitest';

import { create_csp_directives } from '$lib/csp.ts';
import { src } from './csp_test_helpers.ts';

const A = src('a.fuz.dev');
const B = src('b.fuz.dev');
const C = src('c.fuz.dev');

describe('extend basic behavior', () => {
	test('appends a source to an existing directive', () => {
		const csp = create_csp_directives({
			replace_defaults: { 'img-src': ['self'] },
			extend: [{ 'img-src': [A] }]
		});

		assert.deepEqual(csp, { 'img-src': ['self', A] });
	});

	test('only the named directive is affected', () => {
		const csp = create_csp_directives({
			replace_defaults: {
				'img-src': ['self'],
				'script-src': ['self'],
				'connect-src': ['self'],
				'style-src': ['self']
			},
			extend: [{ 'img-src': [A] }]
		});

		assert.deepEqual(csp, {
			'img-src': ['self', A],
			'script-src': ['self'],
			'connect-src': ['self'],
			'style-src': ['self']
		});
	});

	test('multiple directives in one layer', () => {
		const csp = create_csp_directives({
			replace_defaults: { 'img-src': ['self'], 'connect-src': ['self'] },
			extend: [
				{
					'img-src': [A],
					'connect-src': [B]
				}
			]
		});

		assert.deepEqual(csp, {
			'img-src': ['self', A],
			'connect-src': ['self', B]
		});
	});

	test('empty array is a no-op', () => {
		const csp = create_csp_directives({
			extend: [{ 'img-src': [] }]
		});

		assert.deepEqual(
			csp['img-src'],
			['self', 'data:', 'blob:', 'filesystem:'],
			'img-src unchanged from defaults'
		);
	});

	test('extending a directive not in replace_defaults creates it', () => {
		const csp = create_csp_directives({
			replace_defaults: {},
			extend: [{ 'img-src': [A] }]
		});

		assert.deepEqual(csp, { 'img-src': [A] });
	});
});

describe('extend layering', () => {
	test('layers compose left-to-right', () => {
		const csp = create_csp_directives({
			replace_defaults: {},
			extend: [{ 'img-src': [A] }, { 'img-src': [B] }, { 'img-src': [C] }]
		});

		assert.deepEqual(csp, { 'img-src': [A, B, C] });
	});

	test('layers from different directives are independent', () => {
		const csp = create_csp_directives({
			replace_defaults: { 'img-src': ['self'], 'connect-src': ['self'] },
			extend: [{ 'img-src': [A] }, { 'connect-src': [B] }, { 'img-src': [C] }]
		});

		assert.deepEqual(csp, {
			'img-src': ['self', A, C],
			'connect-src': ['self', B]
		});
	});
});

describe('extend deduplication', () => {
	test('duplicate within a single layer is collapsed', () => {
		const csp = create_csp_directives({
			replace_defaults: {},
			extend: [{ 'img-src': [A, A] }]
		});

		assert.deepEqual(csp, { 'img-src': [A] });
	});

	test('duplicate across layers is collapsed', () => {
		const csp = create_csp_directives({
			replace_defaults: {},
			extend: [{ 'img-src': [A] }, { 'img-src': [A] }]
		});

		assert.deepEqual(csp, { 'img-src': [A] });
	});

	test('source already present in starting state is deduplicated when re-added', () => {
		const csp = create_csp_directives({
			replace_defaults: { 'img-src': ['self'] },
			extend: [{ 'img-src': ['self'] }]
		});

		assert.deepEqual(csp, { 'img-src': ['self'] });
	});

	test('insertion order preserved across deduplication', () => {
		const csp = create_csp_directives({
			replace_defaults: {},
			extend: [{ 'img-src': [A, B] }, { 'img-src': [A, C] }]
		});

		assert.deepEqual(csp, { 'img-src': [A, B, C] });
	});
});

describe('extend on `none` directives', () => {
	test('throws when extending a directive whose current value is [`none`]', () => {
		assert.throws(
			() =>
				create_csp_directives({
					extend: [{ 'object-src': [A] }]
				}),
			/Cannot extend directive 'object-src'/
		);
	});

	test('error message points to replace_defaults/overrides as the opt-in path', () => {
		assert.throws(
			() =>
				create_csp_directives({
					extend: [{ 'default-src': [A] }]
				}),
			/replace_defaults.*default-src.*overrides/s
		);
	});

	test('error message explains that overrides cannot rescue extend', () => {
		// The pipeline order means an `overrides` entry runs *after* extend, so it cannot
		// pre-empt the ['none'] check. The error message must explain this so users don't
		// keep trying to use `overrides` to fix it.
		assert.throws(
			() =>
				create_csp_directives({
					extend: [{ 'object-src': [A] }],
					overrides: { 'object-src': null }
				}),
			/pipeline runs.*extend.*overrides.*cannot rescue/s
		);
	});

	test('opting in via `replace_defaults` first then extending works', () => {
		const csp = create_csp_directives({
			replace_defaults: {
				'object-src': ['self']
			},
			extend: [{ 'object-src': [A] }]
		});

		assert.deepEqual(csp, { 'object-src': ['self', A] });
	});

	test('empty extend on a `none` directive does not throw', () => {
		// Empty arrays are no-ops — they aren't actually extending anything.
		assert.doesNotThrow(() =>
			create_csp_directives({
				extend: [{ 'object-src': [] }]
			})
		);
	});

	test('extending [`none`] onto an undefined directive sets it to [`none`]', () => {
		// `is_none` only fires against `current`, so the *first* layer can stamp `['none']`
		// onto a fresh directive — but a follow-up extend would then trip the check.
		const csp = create_csp_directives({
			replace_defaults: {},
			extend: [{ 'img-src': ['none'] }]
		});

		assert.deepEqual(csp, { 'img-src': ['none'] });
	});

	test('a follow-up extend after stamping [`none`] throws', () => {
		assert.throws(
			() =>
				create_csp_directives({
					replace_defaults: {},
					extend: [{ 'img-src': ['none'] }, { 'img-src': [A] }]
				}),
			/Cannot extend directive 'img-src'/
		);
	});
});

describe('extend validation', () => {
	test('throws when extending a non-array directive', () => {
		assert.throws(
			() =>
				create_csp_directives({
					extend: [{ 'upgrade-insecure-requests': true as any }]
				}),
			/Cannot extend directive 'upgrade-insecure-requests'/
		);
	});

	test('non-array error message names the offending type', () => {
		assert.throws(
			() =>
				create_csp_directives({
					extend: [{ 'img-src': 'self' as any }]
				}),
			/Cannot extend directive 'img-src': value must be an array of sources, got string/
		);
	});

	test('throws when extending an array onto a directive set to a boolean by replace_defaults', () => {
		// `replace_defaults` seeds a boolean, then extend tries to add an array. The extend
		// value passes the array check at stage 2, but `current` is non-array, so the
		// "non-array value" branch fires.
		assert.throws(
			() =>
				create_csp_directives({
					replace_defaults: { 'upgrade-insecure-requests': true },
					extend: [{ 'upgrade-insecure-requests': [A] as any }]
				}),
			/Cannot extend directive 'upgrade-insecure-requests': it has a non-array value/
		);
	});
});

describe('extend per-key undefined and null', () => {
	test('per-key undefined is treated as omitted (no-op)', () => {
		// Supports the conditional pattern `{'connect-src': cond ? [API] : undefined}` —
		// matches the no-op semantics of `replace_defaults` and `overrides`.
		const csp = create_csp_directives({
			replace_defaults: { 'img-src': ['self'] },
			extend: [{ 'img-src': undefined as any }]
		});

		assert.deepEqual(csp, { 'img-src': ['self'] });
	});

	test('per-key undefined alongside other keys leaves the other keys intact', () => {
		const csp = create_csp_directives({
			replace_defaults: { 'img-src': ['self'], 'connect-src': ['self'] },
			extend: [{ 'img-src': [A], 'connect-src': undefined as any }]
		});

		assert.deepEqual(csp, {
			'img-src': ['self', A],
			'connect-src': ['self']
		});
	});

	test('per-key null throws with a pointer to overrides', () => {
		// Distinct from `undefined` (no-op) — `null` in extend is almost always a typo for
		// "remove this directive", which lives on `overrides`.
		assert.throws(
			() =>
				create_csp_directives({
					extend: [{ 'img-src': null as any }]
				}),
			/Cannot extend directive 'img-src' with null.*overrides.*'img-src': null/s
		);
	});

	test('per-key null does not leak the generic "must be an array" error', () => {
		try {
			create_csp_directives({
				extend: [{ 'connect-src': null as any }]
			});
		} catch (error: any) {
			assert.notInclude(
				error.message,
				'value must be an array of sources',
				'null gets its own error path, not the generic non-array message'
			);
			return;
		}
		assert.fail('should have thrown');
	});
});

describe('extend layer entry validation', () => {
	// `Object.entries(undefined)` throws a cryptic native TypeError; the library guards
	// the boundary so callers see a friendly error pointing at `options.extend`.
	test('undefined layer entry throws a friendly error', () => {
		assert.throws(
			() =>
				create_csp_directives({
					extend: [undefined as any]
				}),
			/Invalid entry in options.extend: expected an object, got undefined/
		);
	});

	test('null layer entry throws a friendly error', () => {
		assert.throws(
			() =>
				create_csp_directives({
					extend: [null as any]
				}),
			/Invalid entry in options.extend: expected an object, got null/
		);
	});

	test('primitive layer entry throws a friendly error', () => {
		assert.throws(
			() =>
				create_csp_directives({
					extend: ['oops']
				}),
			/Invalid entry in options.extend: expected an object, got string/
		);
	});
});

describe('extend with custom replace_defaults', () => {
	test('extend works against a wholesale-replaced replace_defaults', () => {
		const csp = create_csp_directives({
			replace_defaults: { 'connect-src': ['self'] },
			extend: [{ 'connect-src': [A] }]
		});

		// Whole-CSP deepEqual covers both the connect-src value and that no library defaults leaked.
		assert.deepEqual(csp, { 'connect-src': ['self', A] });
	});

	test('extend on a blank replace_defaults produces only the extended values', () => {
		const csp = create_csp_directives({
			replace_defaults: {},
			extend: [{ 'img-src': [A] }]
		});

		assert.deepEqual(csp, { 'img-src': [A] });
	});
});

describe('input immutability', () => {
	test('extending does not mutate the input layer object', () => {
		const layer = { 'img-src': [A] };
		const layer_snapshot = JSON.stringify(layer);

		create_csp_directives({ extend: [layer] });

		assert.strictEqual(JSON.stringify(layer), layer_snapshot, 'input layer untouched');
	});

	test('two calls with the same layer produce identical results', () => {
		const layer = { 'img-src': [A] };

		const csp1 = create_csp_directives({ extend: [layer] });
		const csp2 = create_csp_directives({ extend: [layer] });

		assert.deepEqual(csp1, csp2);
	});
});
