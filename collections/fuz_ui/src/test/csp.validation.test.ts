import { test, assert, describe } from 'vitest';

import {
	create_csp_directives,
	parse_csp_directive,
	csp_directive_specs,
	csp_directive_spec_by_name
} from '$lib/csp.ts';
import { src, srcs } from './csp_test_helpers.ts';

const A = src('a.fuz.dev');

describe('parse_csp_directive', () => {
	test('accepts valid directive names', () => {
		assert.strictEqual(parse_csp_directive('default-src'), 'default-src');
		assert.strictEqual(parse_csp_directive('script-src'), 'script-src');
		assert.strictEqual(parse_csp_directive('img-src'), 'img-src');
		assert.strictEqual(parse_csp_directive('style-src'), 'style-src');
		assert.strictEqual(parse_csp_directive('connect-src'), 'connect-src');
		assert.strictEqual(
			parse_csp_directive('upgrade-insecure-requests'),
			'upgrade-insecure-requests'
		);
	});

	test('returns null for invalid directive names', () => {
		assert.strictEqual(parse_csp_directive('invalid-src'), null);
		assert.strictEqual(parse_csp_directive('script'), null);
		assert.strictEqual(parse_csp_directive('SCRIPT-SRC'), null);
		assert.strictEqual(parse_csp_directive('script_src'), null);
		assert.strictEqual(parse_csp_directive(''), null);
	});

	test('returns null for non-string types', () => {
		assert.strictEqual(parse_csp_directive(undefined), null);
		assert.strictEqual(parse_csp_directive(null), null);
		assert.strictEqual(parse_csp_directive(123), null);
		assert.strictEqual(parse_csp_directive({}), null);
		assert.strictEqual(parse_csp_directive([]), null);
		assert.strictEqual(parse_csp_directive(true), null);
	});

	test('validates all known directives', () => {
		for (const spec of csp_directive_specs) {
			assert.strictEqual(
				parse_csp_directive(spec.name),
				spec.name,
				`${spec.name} should be a valid directive`
			);
		}
	});
});

describe('error handling', () => {
	test('throws on invalid directive in replace_defaults', () => {
		assert.throws(
			() =>
				create_csp_directives({
					replace_defaults: { 'invalid-directive': ['self'] } as any
				}),
			/Invalid directive in options.replace_defaults/
		);
	});

	test('throws on invalid directive in extend', () => {
		assert.throws(
			() =>
				create_csp_directives({
					extend: [{ 'invalid-directive': ['self'] as any }]
				}),
			/Invalid directive in options.extend/
		);
	});

	test('throws on invalid directive in overrides', () => {
		assert.throws(
			() =>
				create_csp_directives({
					overrides: { 'invalid-directive': ['self'] } as any
				}),
			/Invalid directive in options.overrides/
		);
	});

	test('error message includes the invalid directive name', () => {
		try {
			create_csp_directives({
				overrides: { 'my-bad-directive': ['self'] } as any
			});
		} catch (error: any) {
			assert.include(error.message, 'my-bad-directive');
			assert.include(error.message, 'options.overrides');
			return;
		}
		assert.fail('should have thrown');
	});

	test('error message identifies extend as the source', () => {
		try {
			create_csp_directives({
				extend: [{ 'my-bad-directive': [A] as any }]
			});
		} catch (error: any) {
			assert.include(error.message, 'my-bad-directive');
			assert.include(error.message, 'options.extend');
			return;
		}
		assert.fail('should have thrown');
	});
});

describe('immutability', () => {
	test('modifying returned directives does not affect subsequent calls', () => {
		const csp1 = create_csp_directives();
		const csp2 = create_csp_directives();

		csp1['script-src']!.push(src('https://modified.fuz.dev'));

		assert.notInclude(
			csp2['script-src']! as Array<any>,
			src('https://modified.fuz.dev'),
			'arrays are independent between calls'
		);
	});

	test('modifying replace_defaults input array does not affect output', () => {
		const value = srcs('self', 'https://fuz.dev');

		const csp = create_csp_directives({
			replace_defaults: { 'script-src': value }
		});

		value.push(src('https://modified.fuz.dev'));

		assert.notInclude(csp['script-src']! as Array<any>, src('https://modified.fuz.dev'));
	});

	test('modifying extend layer array does not affect output', () => {
		const value = [src('https://fuz.dev')];

		const csp = create_csp_directives({
			extend: [{ 'connect-src': value }]
		});

		value.push(src('https://modified.fuz.dev'));

		assert.notInclude(csp['connect-src']! as Array<any>, src('https://modified.fuz.dev'));
	});

	test('modifying overrides array does not affect output', () => {
		const value = srcs('self', 'https://fuz.dev');

		const csp = create_csp_directives({
			overrides: { 'script-src': value }
		});

		value.push(src('https://modified.fuz.dev'));

		assert.notInclude(csp['script-src']! as Array<any>, src('https://modified.fuz.dev'));
	});
});

describe('stage-4 output validation', () => {
	test('overrides setting empty array throws', () => {
		// Empty arrays drop the directive in some parsers, which can fall back to default-src
		// and effectively widen the policy. Catch via stage 4 across all input paths.
		assert.throws(
			() => create_csp_directives({ overrides: { 'img-src': [] } }),
			/has an empty array/
		);
	});

	test('replace_defaults with empty array throws', () => {
		assert.throws(
			() => create_csp_directives({ replace_defaults: { 'img-src': [] } }),
			/has an empty array/
		);
	});

	test('overrides producing `none` alongside other tokens throws', () => {
		assert.throws(
			() =>
				create_csp_directives({
					overrides: {
						'script-src': ['none', 'self', A] as any
					}
				}),
			/'none' alongside other tokens/
		);
	});

	test('replace_defaults producing `none` alongside other tokens throws', () => {
		assert.throws(
			() =>
				create_csp_directives({
					replace_defaults: {
						'script-src': ['none', 'self']
					}
				}),
			/'none' alongside other tokens/
		);
	});

	test('extend producing `none` alongside other tokens throws', () => {
		// Stage 2 only blocks extending a directive whose *current* value is exactly ['none'];
		// if the user pre-seeds with non-`none` and then extends with `'none'`, stage 4 catches
		// the resulting `['self', 'none']`.
		assert.throws(
			() =>
				create_csp_directives({
					replace_defaults: { 'img-src': ['self'] },
					extend: [{ 'img-src': ['none'] }]
				}),
			/'none' alongside other tokens/
		);
	});

	test('non-array, non-boolean value via replace_defaults throws', () => {
		// Stage 2 (extend) already threw on non-array, but stages 1 and 3 forwarded the value
		// to stage 4, where the array-only validation skipped it. Stage 4 now catches
		// `as any` escapes uniformly across all three stages.
		assert.throws(
			() =>
				create_csp_directives({
					replace_defaults: { 'img-src': 'self' as any }
				}),
			/Directive 'img-src' has an invalid value: expected an array of sources or a boolean, got string/
		);
	});

	test('non-array, non-boolean value via overrides throws', () => {
		assert.throws(
			() =>
				create_csp_directives({
					overrides: { 'img-src': 'self' as any }
				}),
			/Directive 'img-src' has an invalid value: expected an array of sources or a boolean, got string/
		);
	});

	test('non-array, non-boolean value (number) via replace_defaults throws', () => {
		assert.throws(
			() =>
				create_csp_directives({
					replace_defaults: { 'img-src': 42 as any }
				}),
			/expected an array of sources or a boolean, got number/
		);
	});

	test('non-array, non-boolean value (number) via overrides throws', () => {
		assert.throws(
			() =>
				create_csp_directives({
					overrides: { 'img-src': 42 as any }
				}),
			/expected an array of sources or a boolean, got number/
		);
	});

	test('non-string source element via overrides throws', () => {
		// The `CspSource` template-string type gates this at the type layer, but `as any`
		// callers can slip non-strings through. A non-string source would render as
		// `undefined` / `[object Object]` in the emitted CSP header.
		assert.throws(
			() =>
				create_csp_directives({
					overrides: { 'img-src': ['self', undefined as any, 'data:'] }
				}),
			/Directive 'img-src' has a non-string source at index 1: got undefined/
		);
	});

	test('non-string source element (null) via replace_defaults throws', () => {
		assert.throws(
			() =>
				create_csp_directives({
					replace_defaults: { 'img-src': ['self', null as any] }
				}),
			/Directive 'img-src' has a non-string source at index 1: got null/
		);
	});

	test('non-string source element via extend (after dedup) throws', () => {
		assert.throws(
			() =>
				create_csp_directives({
					replace_defaults: { 'img-src': ['self'] },
					extend: [{ 'img-src': [42 as any] }]
				}),
			/Directive 'img-src' has a non-string source at index \d+: got number/
		);
	});
});

describe('boolean directive pass-through', () => {
	test('overrides preserves boolean true', () => {
		const csp = create_csp_directives({
			overrides: { 'upgrade-insecure-requests': true }
		});
		assert.strictEqual(csp['upgrade-insecure-requests'], true);
	});
});

describe('directive specs structure', () => {
	// Fallback-relationship checks live in csp.fallback.test.ts; these tests cover only the
	// shape of the spec data and the lookup map — concerns that don't fit fallback semantics.
	test('all specs have valid structure', () => {
		for (const spec of csp_directive_specs) {
			assert.ok(spec.name, `spec should have a name`);
			assert.strictEqual(typeof spec.name, 'string', `spec name should be a string`);

			assert.ok(
				Array.isArray(spec.fallback) || spec.fallback === null,
				`${spec.name} fallback should be array or null`
			);

			assert.ok(
				spec.fallback_of === null || Array.isArray(spec.fallback_of),
				`${spec.name} fallback_of should be array or null`
			);
		}
	});

	test('csp_directive_spec_by_name Map is correctly populated', () => {
		assert.strictEqual(csp_directive_spec_by_name.size, csp_directive_specs.length);

		for (const spec of csp_directive_specs) {
			assert.ok(csp_directive_spec_by_name.has(spec.name));
			assert.strictEqual(csp_directive_spec_by_name.get(spec.name), spec);
		}
	});

	test('all known directives are present', () => {
		const expected_directives = [
			'default-src',
			'script-src',
			'script-src-elem',
			'script-src-attr',
			'style-src',
			'style-src-elem',
			'style-src-attr',
			'img-src',
			'media-src',
			'font-src',
			'manifest-src',
			'child-src',
			'connect-src',
			'frame-src',
			'frame-ancestors',
			'form-action',
			'worker-src',
			'object-src',
			'base-uri',
			'upgrade-insecure-requests',
			'report-to',
			'require-trusted-types-for',
			'trusted-types',
			'sandbox'
		];

		for (const directive of expected_directives) {
			assert.ok(csp_directive_spec_by_name.has(directive as any));
		}
	});
});
