import { test, assert, describe } from 'vitest';

import { create_csp_directives, COLOR_SCHEME_SCRIPT_HASH } from '$lib/csp.ts';
import { src, srcs } from './csp_test_helpers.ts';

const A = src('a.fuz.dev');
const B = src('b.fuz.dev');
const C = src('c.fuz.dev');

describe('default output snapshot', () => {
	// Snapshot of the canonical library default policy. This is the only test that asserts
	// the full output of `create_csp_directives()` — any change to `csp_directive_value_defaults`
	// surfaces here as a focused diff. Update by hand; do not generate from the constant.
	test('omitted replace_defaults uses library defaults', () => {
		const csp = create_csp_directives();

		assert.deepEqual(csp, {
			'default-src': ['none'],
			'script-src': ['self', 'wasm-unsafe-eval', COLOR_SCHEME_SCRIPT_HASH],
			'script-src-elem': ['self', COLOR_SCHEME_SCRIPT_HASH],
			'script-src-attr': ['none'],
			'style-src': ['self', 'unsafe-inline'],
			'style-src-elem': ['self', 'unsafe-inline'],
			'style-src-attr': ['unsafe-inline'],
			'img-src': ['self', 'data:', 'blob:', 'filesystem:'],
			'media-src': ['self', 'data:', 'blob:', 'mediastream:', 'filesystem:'],
			'font-src': ['self', 'data:'],
			'manifest-src': ['self'],
			'child-src': ['none'],
			'connect-src': ['self'],
			'frame-src': ['self'],
			'frame-ancestors': ['self'],
			'form-action': ['self'],
			'worker-src': ['self', 'blob:', 'wasm-unsafe-eval'],
			'object-src': ['none'],
			'base-uri': ['none'],
			'upgrade-insecure-requests': true
		});
	});

	test('empty options object is equivalent to no options', () => {
		assert.deepEqual(create_csp_directives({}), create_csp_directives());
	});
});

describe('replace_defaults option — wholesale replace semantics', () => {
	test('provided replace_defaults replaces library defaults wholesale — no inheritance', () => {
		const csp = create_csp_directives({
			replace_defaults: {
				'script-src': ['self', B]
			}
		});

		// Whole-CSP deepEqual asserts both the script-src value and that no library defaults leaked.
		assert.deepEqual(csp, { 'script-src': ['self', B] });
	});

	test('replace_defaults: {} produces an empty starting state', () => {
		const csp = create_csp_directives({
			replace_defaults: {}
		});

		assert.deepEqual(csp, {});
	});

	test('replace_defaults: null throws — omit the option or pass {}', () => {
		// `null` is intentionally rejected to avoid the null/undefined footgun where a
		// conditional that produces null silently disables all security defaults.
		assert.throws(
			() =>
				create_csp_directives({
					replace_defaults: null as any
				}),
			/Invalid value 'null' for options.replace_defaults/
		);
	});

	test('null values in replace_defaults throw — omit the key or use overrides', () => {
		assert.throws(
			() =>
				create_csp_directives({
					replace_defaults: {
						'script-src': ['self'],
						'img-src': null as any
					}
				}),
			/Invalid value 'null' for directive 'img-src' in options.replace_defaults/
		);
	});

	test('undefined values in replace_defaults are skipped', () => {
		// Distinct from `null`, which throws. `undefined` mirrors omitting the key.
		const csp = create_csp_directives({
			replace_defaults: {
				'script-src': ['self', B],
				'img-src': undefined
			}
		});

		assert.deepEqual(csp, { 'script-src': ['self', B] });
	});

	test('boolean values pass through', () => {
		const csp = create_csp_directives({
			replace_defaults: {
				'upgrade-insecure-requests': false
			}
		});

		assert.strictEqual(csp['upgrade-insecure-requests'], false);
	});

	test('multiple directives in replace_defaults', () => {
		const csp = create_csp_directives({
			replace_defaults: {
				'script-src': ['self', B],
				'img-src': ['self', C]
			}
		});

		assert.deepEqual(csp, {
			'script-src': ['self', B],
			'img-src': ['self', C]
		});
	});
});

describe('replace_defaults interaction with extend', () => {
	test('extend appends to replace_defaults values', () => {
		const csp = create_csp_directives({
			replace_defaults: { 'connect-src': ['self'] },
			extend: [{ 'connect-src': [A] }]
		});

		assert.deepEqual(csp, { 'connect-src': ['self', A] });
	});

	test('extend on a directive not present in custom replace_defaults creates it', () => {
		const csp = create_csp_directives({
			replace_defaults: { 'script-src': ['self'] },
			extend: [{ 'img-src': [A] }]
		});

		assert.deepEqual(csp, {
			'script-src': ['self'],
			'img-src': [A]
		});
	});

	test('blank replace_defaults + extend produces only extended directives', () => {
		const csp = create_csp_directives({
			replace_defaults: {},
			extend: [{ 'img-src': [A] }]
		});

		assert.deepEqual(csp, { 'img-src': [A] });
	});
});

describe('replace_defaults immutability', () => {
	test('mutating the input does not change the output', () => {
		const original = srcs('self', 'https://fuz.dev');
		const csp = create_csp_directives({
			replace_defaults: { 'script-src': original }
		});

		original.push(src('https://modified.fuz.dev'));

		assert.notInclude(
			csp['script-src']! as Array<any>,
			src('https://modified.fuz.dev'),
			'mutating input array does not affect output'
		);
	});

	test('two calls with the same options produce independent results', () => {
		const options = { replace_defaults: { 'script-src': srcs('self', 'https://fuz.dev') } };

		const csp1 = create_csp_directives(options);
		const csp2 = create_csp_directives(options);

		csp1['script-src']!.push(src('https://modified.fuz.dev'));

		assert.notInclude(
			csp2['script-src']! as Array<any>,
			src('https://modified.fuz.dev'),
			'modifying first result does not affect second'
		);
	});
});

describe('minimal configurations', () => {
	test('blank replace_defaults with explicit directives via overrides', () => {
		const csp = create_csp_directives({
			replace_defaults: {},
			overrides: { 'script-src': ['self'] }
		});

		assert.deepEqual(csp, { 'script-src': ['self'] });
	});

	test('blank replace_defaults with single extend layer', () => {
		const csp = create_csp_directives({
			replace_defaults: {},
			extend: [{ 'script-src': ['self'] }]
		});

		assert.deepEqual(csp, { 'script-src': ['self'] });
	});
});
