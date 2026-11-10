import * as s from '@fuzdev/fuz_schema/schema.ts';
import { assert, describe, test } from 'vitest';

import {
	Manifest,
	find_manifest_problems,
	format_file_issue,
	is_clean_path,
	is_included_path,
	is_under,
	load_manifest,
	parse_json_text
} from '#lib/manifest.ts';

import { assert_task_error_includes, create_temp_dir } from './test_helpers.ts';

describe('manifest', () => {
	const include = new Set(['ts', 'svelte', 'md']);

	test('is_included_path keeps included extensions outside excluded prefixes', () => {
		assert.strictEqual(is_included_path('src/lib/a.ts', include, []), true);
		assert.strictEqual(is_included_path('src/lib/A.SVELTE', include, []), true);
		assert.strictEqual(is_included_path('src/lib/a.svelte.ts', include, []), true);
		assert.strictEqual(is_included_path('src/lib/a.json', include, []), false);
		assert.strictEqual(is_included_path('src/lib/Makefile', include, []), false);
		assert.strictEqual(is_included_path('src/lib/.gitignore', include, []), false);
		assert.strictEqual(is_included_path('src/.ts', include, []), false);
		assert.strictEqual(
			is_included_path('src/test/fixtures/a.ts', include, ['src/test/fixtures']),
			false
		);
		assert.strictEqual(
			is_included_path('src/test/fixtures.ts', include, ['src/test/fixtures']),
			true
		);
		assert.strictEqual(
			is_included_path('src/test/fixtures_more/a.ts', include, ['src/test/fixtures']),
			true
		);
	});

	test('is_under is prefix-by-segment, not by string', () => {
		assert.strictEqual(is_under('a/b/c', 'a/b'), true);
		assert.strictEqual(is_under('a/b', 'a/b'), true);
		assert.strictEqual(is_under('a/bc', 'a/b'), false);
	});

	test('is_clean_path rejects traversal and decoration', () => {
		for (const ok of ['src', 'packages/kit/src', 'a.b/c-d_e'])
			assert.strictEqual(is_clean_path(ok), true, ok);
		for (const bad of ['', '/src', 'src/', './src', 'a/../b', 'a//b']) {
			assert.strictEqual(is_clean_path(bad), false, bad);
		}
	});

	const valid = {
		version: 2,
		include: ['ts'],
		collections: [
			{
				name: 'x',
				url: 'https://github.com/fuzdev/x',
				commit: 'a'.repeat(40),
				subpaths: ['src'],
				exclude: ['src/test/fixtures'],
				license: { spdx: 'MIT', file: 'LICENSE' },
				shaped_by: 'tsv',
				origin: 'own'
			}
		]
	};

	/** The field problems, or once the shape passes, the cross-field ones, as `load_manifest` runs. */
	const to_problems = (raw: unknown): Array<string> => {
		const result = s.parse(Manifest, raw);
		return result.ok ? find_manifest_problems(result.value) : result.issues.map(format_file_issue);
	};

	/** Clones `valid` with `edit` applied to its first collection. */
	const with_collection = (edit: (c: Record<string, unknown>) => void): unknown => {
		const m = structuredClone(valid);
		edit(m.collections[0]!);
		return m;
	};

	/** A manifest of two collections with `first` and `second` applied to them. */
	const two = (
		first: (c: Record<string, unknown>) => void,
		second: (c: Record<string, unknown>) => void
	): unknown => {
		const m = structuredClone(valid);
		const b = structuredClone(m.collections[0]!);
		b.name = 'y';
		m.collections.push(b);
		first(m.collections[0]!);
		second(m.collections[1]!);
		return m;
	};

	const assert_has = (problems: ReadonlyArray<string>, ...parts: Array<string>): void => {
		for (const part of parts) {
			assert.ok(
				problems.some((p) => p.includes(part)),
				`${part} in ${problems.join(' | ')}`
			);
		}
	};

	test('accepts a valid manifest', () => {
		assert.deepEqual(to_problems(valid), []);
	});

	test('accepts named files the extension filter would drop', () => {
		assert.deepEqual(
			to_problems(with_collection((c) => (c.files = ['package.json', 'src/tsconfig.json']))),
			[]
		);
	});

	test('requires the current version', () => {
		assert.deepEqual(to_problems({ ...valid, version: 3 }), ['version must be 2']);
		assert.deepEqual(to_problems({ ...valid, version: '2' }), ['version must be 2']);
	});

	describe('the shape pass', () => {
		test('names the field in every refusal', () => {
			const cases: Array<[(c: Record<string, unknown>) => void, string]> = [
				[(c) => (c.name = 'Bad Name'), 'collections[0].name must match'],
				[(c) => (c.url = 'http://github.com/a/b'), 'collections[0].url must be'],
				[(c) => (c.commit = 'abc'), 'collections[0].commit must be a full'],
				[(c) => (c.subpaths = []), 'collections[0].subpaths must be a non-empty'],
				[(c) => (c.subpaths = ['./src']), 'collections[0].subpaths[0] must be a clean'],
				[(c) => (c.exclude = 'x'), 'collections[0].exclude must be an array'],
				[(c) => (c.exclude = ['../x']), 'collections[0].exclude[0] must be a clean'],
				[(c) => (c.files = 3), 'collections[0].files must be an array'],
				[(c) => (c.files = ['./a']), 'collections[0].files[0] must be a clean'],
				[(c) => (c.license = 'MIT'), 'collections[0].license needs'],
				[(c) => (c.shaped_by = 'biome'), 'collections[0].shaped_by must be one of'],
				[(c) => (c.origin = 'x'), 'collections[0].origin must be one of']
			];
			for (const [edit, text] of cases) assert_has(to_problems(with_collection(edit)), text);
			assert_has(to_problems({ ...valid, include: [] }), 'include must be');
			assert_has(to_problems({ ...valid, include: ['.ts'] }), 'include[0] must be');
			assert_has(to_problems({ ...valid, collections: [] }), 'collections must be');
			assert.deepEqual(to_problems([]), ['must be object, received array']);
		});

		test('names a missing field', () => {
			assert_has(
				to_problems(
					with_collection((c) => {
						delete c.commit;
						delete c.origin;
					})
				),
				'collections[0].commit must',
				'collections[0].origin must'
			);
		});

		test('refuses a non-permissive license id, an own key only', () => {
			for (const spdx of ['BUSL-1.1', 'toString']) {
				assert_has(
					to_problems(
						with_collection((c) => {
							c.license = { spdx, file: 'LICENSE' };
						})
					),
					`collections[0].license.spdx "${spdx}" is not permissive`
				);
			}
		});

		test('requires exactly one license source', () => {
			for (const license of [
				{ spdx: 'MIT', file: 'LICENSE', declared_in: 'package.json' },
				{ spdx: 'MIT' }
			]) {
				assert_has(
					to_problems(
						with_collection((c) => {
							c.license = license;
						})
					),
					'exactly one'
				);
			}
		});

		test('a license of the wrong shape is one issue', () => {
			for (const license of [null, 5, 'x', ['x'], { spdx: 5, file: 'L' }]) {
				const problems = to_problems(
					with_collection((c) => {
						c.license = license;
					})
				);
				assert.lengthOf(problems, 1, JSON.stringify(license));
				assert.include(problems[0]!, 'collections[0].license needs');
			}
		});

		test('refuses unknown keys on the manifest, a collection, and a license', () => {
			assert.deepEqual(to_problems({ ...valid, extra: 1 }), ['extra is not a known key']);
			assert.deepEqual(to_problems(with_collection((c) => (c.extra = 1))), [
				'collections[0].extra is not a known key'
			]);
			assert_has(
				to_problems(
					with_collection((c) => {
						c.license = { spdx: 'MIT', file: 'LICENSE', note: 'x' };
					})
				),
				'collections[0].license needs'
			);
		});

		test('quotes an unknown key that is not a plain word in the path', () => {
			const key = 'a b\n';
			assert_has(
				to_problems(with_collection((c) => (c[key] = 1))),
				`collections[0].${JSON.stringify(key)}`
			);
		});

		test('a repeated invalid name is refused as invalid, not as a duplicate', () => {
			const problems = to_problems(
				two(
					(c) => (c.name = 'Upper'),
					(c) => (c.name = 'Upper')
				)
			);
			assert.lengthOf(problems, 2);
			for (const problem of problems) assert.notInclude(problem, 'is duplicated');
		});

		test('reports field problems together across collections', () => {
			const m = structuredClone(valid) as { version: unknown; include: unknown } & typeof valid;
			m.version = 9;
			m.include = ['.ts'];
			m.collections[0]!.commit = 'bad';
			m.collections[0]!.shaped_by = 'biome';
			m.collections.push({ ...m.collections[0]!, name: 'y', origin: 'x', commit: 'a'.repeat(40) });
			assert_has(
				to_problems(m),
				'version must be 2',
				'include[0]',
				'collections[0].commit',
				'collections[0].shaped_by',
				'collections[1].origin must be one of'
			);
		});

		test('reports at most the library cap of problems', () => {
			const m = structuredClone(valid);
			const bad = { ...m.collections[0]!, commit: 'bad' };
			m.collections = Array.from({ length: 150 }, (_, i) => ({ ...bad, name: `n${i}` }));
			assert.lengthOf(to_problems(m), 100);
		});
	});

	describe('the cross-field pass', () => {
		test('an exclude under no subpath, at its index', () => {
			assert.deepEqual(to_problems(with_collection((c) => (c.exclude = ['src/a', 'other/b']))), [
				'collections[0].exclude[1] "other/b" is not under any subpath'
			]);
		});

		test('a duplicate file, at the second', () => {
			assert.deepEqual(to_problems(with_collection((c) => (c.files = ['a.json', 'a.json']))), [
				'collections[0].files[1] "a.json" is duplicated'
			]);
		});

		test('the LICENSE collision', () => {
			assert.deepEqual(to_problems(with_collection((c) => (c.files = ['LICENSE']))), [
				'collections[0].files[0] "LICENSE" collides with the collection LICENSE'
			]);
		});

		test('a file the subpaths already keep, not one outside them or excluded', () => {
			assert.deepEqual(to_problems(with_collection((c) => (c.files = ['src/a.ts']))), [
				'collections[0].files[0] "src/a.ts" is already kept by `subpaths`'
			]);
			assert.deepEqual(to_problems(with_collection((c) => (c.files = ['elsewhere/a.ts']))), []);
			assert.deepEqual(
				to_problems(with_collection((c) => (c.files = ['src/test/fixtures/a.ts']))),
				[]
			);
		});

		test('already-kept beside the LICENSE collision and a duplicate', () => {
			assert.deepEqual(to_problems(with_collection((c) => (c.files = ['src/a.ts', 'LICENSE']))), [
				'collections[0].files[0] "src/a.ts" is already kept by `subpaths`',
				'collections[0].files[1] "LICENSE" collides with the collection LICENSE'
			]);
			assert.deepEqual(to_problems(with_collection((c) => (c.files = ['src/a.ts', 'src/a.ts']))), [
				'collections[0].files[0] "src/a.ts" is already kept by `subpaths`',
				'collections[0].files[1] "src/a.ts" is duplicated',
				'collections[0].files[1] "src/a.ts" is already kept by `subpaths`'
			]);
		});

		test('origin must agree with the URL owner, both ways', () => {
			const problems = (url: string, origin: string): Array<string> =>
				to_problems(
					with_collection((c) => {
						c.url = url;
						c.origin = origin;
					})
				);
			assert.deepEqual(problems('https://github.com/sveltejs/kit', 'own'), [
				'collections[0].origin "own" disagrees with the URL\'s owner "sveltejs" (`own` is exactly fuzdev, ryanatkn)'
			]);
			assert.lengthOf(problems('https://github.com/ryanatkn/x', 'third_party'), 1);
			assert.deepEqual(problems('https://github.com/ryanatkn/x', 'own'), []);
			assert.deepEqual(problems('https://github.com/sveltejs/kit', 'third_party'), []);
		});

		test('a repeated collection name, at the second', () => {
			const m = structuredClone(valid);
			m.collections.push(structuredClone(m.collections[0]!));
			assert.deepEqual(to_problems(m), ['collections[1].name "x" is duplicated']);
		});

		test('reports cross-field problems together, not stopping at the first', () => {
			assert.deepEqual(
				to_problems(
					two(
						(c) => {
							c.exclude = ['elsewhere'];
							c.files = ['LICENSE', 'LICENSE'];
						},
						(c) => {
							c.name = 'x';
							c.url = 'https://github.com/sveltejs/kit';
							c.files = ['src/a.ts'];
						}
					)
				),
				[
					'collections[0].exclude[0] "elsewhere" is not under any subpath',
					'collections[0].files[0] "LICENSE" collides with the collection LICENSE',
					'collections[0].files[1] "LICENSE" is duplicated',
					'collections[0].files[1] "LICENSE" collides with the collection LICENSE',
					'collections[1].name "x" is duplicated',
					'collections[1].files[0] "src/a.ts" is already kept by `subpaths`',
					'collections[1].origin "own" disagrees with the URL\'s owner "sveltejs" (`own` is exactly fuzdev, ryanatkn)'
				]
			);
		});

		test('a shape problem stops cross-field reporting', () => {
			const problems = to_problems(
				with_collection((c) => {
					c.commit = 'bad';
					c.exclude = ['elsewhere'];
					c.files = ['LICENSE'];
					c.url = 'https://github.com/sveltejs/kit';
				})
			);
			assert.deepEqual(problems, ['collections[0].commit must be a full 40-hex SHA']);
		});
	});

	describe('load_manifest', () => {
		test('throws the shape problems, listed under the file', async () => {
			await using dir = await create_temp_dir();
			await dir.write('manifest.json', '{"version":1,"include":[],"collections":[]}');
			await assert_task_error_includes(
				load_manifest(dir, 'manifest.json'),
				'manifest.json is invalid:\n  version must be 2'
			);
			await assert_task_error_includes(
				load_manifest(dir, 'manifest.json'),
				'\n  include must be a non-empty array'
			);
		});

		test('throws the cross-field problems once the shape passes', async () => {
			await using dir = await create_temp_dir();
			await dir.write(
				'manifest.json',
				JSON.stringify(with_collection((c) => (c.exclude = ['elsewhere'])))
			);
			await assert_task_error_includes(
				load_manifest(dir, 'manifest.json'),
				'manifest.json is invalid:\n  collections[0].exclude[0] "elsewhere" is not under'
			);
		});

		test('stops at the shape problems when both kinds are present', async () => {
			await using dir = await create_temp_dir();
			await dir.write(
				'manifest.json',
				JSON.stringify(
					with_collection((c) => {
						c.commit = 'bad';
						c.exclude = ['elsewhere'];
					})
				)
			);
			try {
				await load_manifest(dir, 'manifest.json');
			} catch (error) {
				assert.include(String(error), 'collections[0].commit must be');
				assert.notInclude(String(error), 'not under any subpath');
				return;
			}
			assert.fail('expected a TaskError');
		});

		test('returns the parsed value', async () => {
			await using dir = await create_temp_dir();
			await dir.write('manifest.json', JSON.stringify(valid));
			assert.strictEqual(
				JSON.stringify(await load_manifest(dir, 'manifest.json')),
				JSON.stringify(valid)
			);
		});
	});

	test('parse_json_text appends a hint', () => {
		try {
			parse_json_text(Manifest, 'manifest.json', '{"version":1}', 'try this');
		} catch (error) {
			assert.include(String(error), 'try this');
			return;
		}
		assert.fail('expected a TaskError');
	});

	test('a path or owner holding a newline stays on its one line of the error', () => {
		const value = 'x\n  collections[0].commit forged';
		const manifests = [
			with_collection((c) => {
				c.exclude = [value];
			}),
			with_collection((c) => {
				c.files = [value, value];
			}),
			with_collection((c) => {
				c.url = `https://github.com/${value}/z`;
			})
		];
		for (const m of manifests) {
			const problems = to_problems(m);
			assert.isNotEmpty(problems);
			for (const problem of problems) assert.notInclude(problem, '\n');
		}
	});

	test('a parsed value is the input, unmodified, so key order stays', () => {
		const result = s.parse(Manifest, valid);
		assert(result.ok);
		assert.strictEqual(JSON.stringify(result.value), JSON.stringify(valid));
	});
});
