import { test, assert, describe } from 'vitest';

import { create_csp_directives } from '$lib/csp.ts';
import { src, srcs } from './csp_test_helpers.ts';

const A = src('a.fuz.dev');
const B = src('b.fuz.dev');

describe('overrides option — replace per directive', () => {
	test('replaces the value, ignoring replace_defaults and extend', () => {
		const csp = create_csp_directives({
			extend: [{ 'script-src': [A] }],
			overrides: {
				'script-src': ['self', B]
			}
		});

		// `A` from extend is dropped — overrides replaces wholesale.
		assert.deepEqual(csp['script-src'], ['self', B]);
	});

	test('only the named directive is affected', () => {
		const csp = create_csp_directives({
			replace_defaults: { 'script-src': ['self'], 'connect-src': ['self'] },
			extend: [
				{
					'script-src': [A],
					'connect-src': [A]
				}
			],
			overrides: {
				'script-src': ['self', B]
			}
		});

		assert.deepEqual(csp, {
			'script-src': ['self', B],
			'connect-src': ['self', A]
		});
	});

	test('multiple directives in one overrides object', () => {
		const csp = create_csp_directives({
			overrides: {
				'script-src': ['self', B],
				'connect-src': ['self', B]
			}
		});

		assert.deepEqual(csp['script-src'], ['self', B]);
		assert.deepEqual(csp['connect-src'], ['self', B]);
	});

	test('boolean directive value', () => {
		const csp = create_csp_directives({
			overrides: {
				'upgrade-insecure-requests': false
			}
		});

		assert.strictEqual(csp['upgrade-insecure-requests'], false);
	});

	test('can set a directive to ["none"] explicitly', () => {
		const csp = create_csp_directives({
			extend: [{ 'connect-src': [A] }],
			overrides: {
				'connect-src': ['none']
			}
		});

		assert.deepEqual(csp['connect-src'], ['none']);
	});
});

describe('overrides option — null removes', () => {
	test('null removes the directive from output', () => {
		const csp = create_csp_directives({
			overrides: {
				'script-src': null
			}
		});

		assert.notProperty(csp, 'script-src');
		assert.property(csp, 'connect-src', 'other directives unaffected');
	});

	test('null on a directive not present is a no-op', () => {
		const csp = create_csp_directives({
			replace_defaults: {},
			overrides: {
				'script-src': null
			}
		});

		assert.deepEqual(csp, {});
	});

	test('null wins over extend in the same call', () => {
		const csp = create_csp_directives({
			extend: [{ 'script-src': [A] }],
			overrides: {
				'script-src': null
			}
		});

		assert.notProperty(csp, 'script-src');
	});
});

describe('overrides option — undefined values', () => {
	test('undefined value in overrides is a no-op', () => {
		// Distinct from `null` (removes) — `undefined` is treated as omission, leaving the
		// pipeline result from earlier stages untouched.
		const csp = create_csp_directives({
			replace_defaults: { 'script-src': ['self'] },
			overrides: {
				'script-src': undefined
			}
		});

		assert.deepEqual(csp, { 'script-src': ['self'] });
	});
});

describe('overrides interaction with extend output', () => {
	test('overrides ["none"] replaces an extend-built array (full pipeline)', () => {
		// replace_defaults seeds, extend appends, overrides replaces wholesale with ['none'].
		// The intermediate ['self', A] never reaches the output.
		const csp = create_csp_directives({
			replace_defaults: { 'img-src': ['self'] },
			extend: [{ 'img-src': [A] }],
			overrides: { 'img-src': ['none'] }
		});

		assert.deepEqual(csp, { 'img-src': ['none'] });
	});
});

describe('precedence: replace_defaults → extend → overrides', () => {
	test('full pipeline: replace_defaults sets, extend appends, overrides replaces', () => {
		const csp = create_csp_directives({
			replace_defaults: { 'connect-src': ['self'] },
			extend: [{ 'connect-src': [A] }],
			overrides: {
				'connect-src': ['self', B]
			}
		});

		assert.deepEqual(csp, { 'connect-src': ['self', B] });
	});

	test('overrides runs after extend even when extend would throw on `none`', () => {
		// `overrides` cannot rescue an `extend` on a `'none'` directive — extend runs first.
		assert.throws(
			() =>
				create_csp_directives({
					extend: [{ 'object-src': [A] }],
					overrides: { 'object-src': ['self'] }
				}),
			/Cannot extend directive 'object-src'/
		);
	});

	test('overrides can independently replace a `none` default', () => {
		const csp = create_csp_directives({
			overrides: { 'object-src': ['self', A] }
		});

		assert.deepEqual(csp['object-src'], ['self', A]);
	});
});

describe('input immutability', () => {
	test('mutating override input does not change output', () => {
		const value = srcs('self', 'https://fuz.dev');
		const csp = create_csp_directives({
			overrides: { 'script-src': value }
		});

		value.push(src('https://modified.fuz.dev'));

		assert.notInclude(
			csp['script-src']! as Array<any>,
			src('https://modified.fuz.dev'),
			'mutating input array does not affect output'
		);
	});
});
