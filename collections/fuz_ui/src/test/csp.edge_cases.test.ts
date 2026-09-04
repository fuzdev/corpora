import { test, assert, describe } from 'vitest';

import { create_csp_directives, csp_directive_specs } from '$lib/csp.ts';
import { src } from './csp_test_helpers.ts';

const A = src('a.fuz.dev');

describe('extreme array sizes', () => {
	test('handles very large source arrays in extend', () => {
		const many_sources = Array.from({ length: 1000 }, (_, i) => src(`source${i}.fuz.dev`));

		const csp = create_csp_directives({
			extend: [{ 'img-src': many_sources }]
		});

		// 4 starting sources + 1000 extended
		assert.strictEqual(csp['img-src']!.length, 1004);
		assert.include(csp['img-src']!, src('source0.fuz.dev'));
		assert.include(csp['img-src']!, src('source999.fuz.dev'));
	});

	test('handles many extend layers', () => {
		const many_layers = Array.from({ length: 100 }, (_, i) => ({
			'img-src': [src(`trusted${i}.fuz.dev`)]
		}));

		const csp = create_csp_directives({
			extend: many_layers
		});

		assert.include(csp['img-src']!, src('trusted0.fuz.dev'));
		assert.include(csp['img-src']!, src('trusted99.fuz.dev'));
	});

	test('handles very long source URLs', () => {
		const long_url = src('https://' + 'a'.repeat(1000) + '.fuz.dev');

		const csp = create_csp_directives({
			extend: [{ 'img-src': [long_url] }]
		});

		assert.include(csp['img-src']!, long_url);
	});
});

describe('unusual option combinations', () => {
	test('all options empty produces an empty result', () => {
		const csp = create_csp_directives({
			replace_defaults: {},
			extend: [],
			overrides: {}
		});

		assert.deepEqual(csp, {});
	});

	test('blank replace_defaults exercises full pipeline (extend + overrides)', () => {
		const csp = create_csp_directives({
			replace_defaults: {},
			extend: [{ 'script-src': ['self', A] }],
			overrides: {
				'connect-src': ['self']
			}
		});

		assert.deepEqual(csp, {
			'script-src': ['self', A],
			'connect-src': ['self']
		});
	});
});

describe('memory and reference safety', () => {
	test('modifying input options does not affect future calls', () => {
		const layer: any = { 'script-src': ['self', src('first.fuz.dev')] };

		const csp1 = create_csp_directives({ extend: [layer] });

		layer['script-src'].push(src('modified.fuz.dev'));

		const csp2 = create_csp_directives({ extend: [layer] });

		assert.notInclude(csp1['script-src']! as Array<any>, src('modified.fuz.dev'));
		assert.include(csp2['script-src']!, src('modified.fuz.dev'));
	});
});

describe('boolean directive edge cases', () => {
	test('boolean directive removed via overrides null', () => {
		// false-via-replace_defaults is covered in csp.base.test.ts; false-via-overrides is
		// covered in csp.overrides.test.ts. The null-removal of a boolean is only here.
		const csp = create_csp_directives({
			overrides: {
				'upgrade-insecure-requests': null
			}
		});

		assert.notProperty(csp, 'upgrade-insecure-requests');
	});
});

describe('directive name properties', () => {
	test('all directive names are lowercase with hyphens', () => {
		for (const spec of csp_directive_specs) {
			assert.strictEqual(spec.name, spec.name.toLowerCase(), `${spec.name} should be lowercase`);
			assert.ok(
				/^[a-z-]+$/.test(spec.name),
				`${spec.name} should only contain lowercase letters and hyphens`
			);
		}
	});

	test('no directive name conflicts', () => {
		const names = csp_directive_specs.map((s) => s.name);
		const unique_names = new Set(names);

		assert.strictEqual(names.length, unique_names.size, 'all directive names should be unique');
	});
});

describe('concurrent calls', () => {
	test('multiple simultaneous calls produce independent results', () => {
		const promises = Array.from({ length: 10 }, (_, i) =>
			Promise.resolve(
				create_csp_directives({
					extend: [{ 'img-src': [src(`source${i}.fuz.dev`)] }]
				})
			)
		);

		return Promise.all(promises).then((results) => {
			for (let i = 0; i < results.length; i++) {
				assert.include(results[i]!['img-src']!, src(`source${i}.fuz.dev`));

				for (let j = 0; j < results.length; j++) {
					if (i !== j) {
						assert.notInclude(results[i]!['img-src']! as Array<any>, src(`source${j}.fuz.dev`));
					}
				}
			}
		});
	});
});
