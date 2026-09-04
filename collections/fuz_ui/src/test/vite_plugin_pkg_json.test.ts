import { test, assert, describe } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { vite_plugin_pkg_json } from '$lib/vite_plugin_pkg_json.ts';
import { pkg_json_keys } from '@fuzdev/fuz_util/pkg_json.ts';

// The plugin's hooks read `this` (a Rollup plugin context) for `addWatchFile`,
// `warn`, and `error`. Cast the returned plugin to just the hooks we drive and
// hand each one a minimal mock context — no real Vite/Rollup instance needed.
interface MockCtx {
	addWatchFile: (id: string) => void;
	warn: (msg: string) => void;
	error: (msg: string) => never;
}

interface PluginHooks {
	configResolved: (config: { root: string; command: string }) => void;
	buildStart: (this: MockCtx) => void;
	resolveId: (id: string) => string | undefined;
	load: (this: MockCtx, id: string) => string | undefined;
}

const create_mock_ctx = (): MockCtx & { warnings: Array<string>; watched: Array<string> } => {
	const warnings: Array<string> = [];
	const watched: Array<string> = [];
	return {
		warnings,
		watched,
		addWatchFile: (id) => watched.push(id),
		warn: (msg) => warnings.push(msg),
		error: (msg) => {
			throw new Error(msg);
		}
	};
};

const write_package_json = (dir: string, value: Record<string, unknown>): void => {
	writeFileSync(join(dir, 'package.json'), JSON.stringify(value));
};

const make_temp_dir = (): string => mkdtempSync(join(tmpdir(), 'fuz-pkg-json-'));

const VIRTUAL_ID = 'virtual:pkg.json';
const RESOLVED_VIRTUAL_ID = '\0virtual:pkg.json';

describe('curate', () => {
	test('strips non-publish-safe keys and keeps the allowlist', () => {
		const dir = make_temp_dir();
		try {
			write_package_json(dir, {
				name: '@x/y',
				version: '1.2.3',
				glyph: '🧶',
				repository: { type: 'git', url: 'git+https://github.com/x/y.git' },
				exports: { '.': './index.js' },
				private: false,
				// these must NOT survive into the client bundle
				scripts: { build: 'gro build' },
				dependencies: { a: '1' },
				devDependencies: { b: '2' },
				engines: { node: '>=24' }
			});

			const plugin = vite_plugin_pkg_json() as unknown as PluginHooks;
			plugin.configResolved({ root: dir, command: 'build' });
			const ctx = create_mock_ctx();
			plugin.buildStart.call(ctx);

			assert.strictEqual(plugin.resolveId(VIRTUAL_ID), RESOLVED_VIRTUAL_ID);
			assert.strictEqual(plugin.resolveId('something-else'), undefined);

			const loaded = plugin.load.call(ctx, RESOLVED_VIRTUAL_ID);
			assert.ok(loaded);
			const parsed = JSON.parse(loaded) as Record<string, unknown>;

			// kept
			assert.strictEqual(parsed.name, '@x/y');
			assert.strictEqual(parsed.version, '1.2.3');
			assert.strictEqual(parsed.glyph, '🧶');
			assert.deepEqual(parsed.exports, { '.': './index.js' });

			// stripped
			assert.strictEqual(parsed.scripts, undefined);
			assert.strictEqual(parsed.dependencies, undefined);
			assert.strictEqual(parsed.devDependencies, undefined);
			assert.strictEqual(parsed.engines, undefined);

			// every emitted key is on the allowlist
			for (const key of Object.keys(parsed)) {
				assert.ok(
					(pkg_json_keys as ReadonlyArray<string>).includes(key),
					`unexpected key in curated output: ${key}`
				);
			}

			// package.json registered as a watch file so edits trigger reloads
			assert.ok(ctx.watched.some((p) => p.endsWith('package.json')));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('omits keys absent from package.json instead of emitting undefined', () => {
		const dir = make_temp_dir();
		try {
			write_package_json(dir, { name: '@x/y', version: '0.0.1' });
			const plugin = vite_plugin_pkg_json() as unknown as PluginHooks;
			plugin.configResolved({ root: dir, command: 'build' });
			const ctx = create_mock_ctx();
			plugin.buildStart.call(ctx);

			const parsed = JSON.parse(plugin.load.call(ctx, RESOLVED_VIRTUAL_ID)!) as Record<
				string,
				unknown
			>;
			assert.deepEqual(Object.keys(parsed), ['name', 'version']);
			assert.notOk('glyph' in parsed);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('warns when package.json has no name', () => {
		const dir = make_temp_dir();
		try {
			write_package_json(dir, { version: '1.0.0' });
			const plugin = vite_plugin_pkg_json() as unknown as PluginHooks;
			plugin.configResolved({ root: dir, command: 'build' });
			const ctx = create_mock_ctx();
			plugin.buildStart.call(ctx);
			assert.ok(ctx.warnings.some((w) => w.includes('no "name" field')));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('keys option', () => {
	test('a wider keys list exposes extra fields the default strips', () => {
		const dir = make_temp_dir();
		try {
			write_package_json(dir, {
				name: '@x/y',
				version: '1.0.0',
				keywords: ['a', 'b']
			});

			// default keys: `keywords` is not publish-curated, so it's stripped
			const default_plugin = vite_plugin_pkg_json() as unknown as PluginHooks;
			default_plugin.configResolved({ root: dir, command: 'build' });
			const default_ctx = create_mock_ctx();
			default_plugin.buildStart.call(default_ctx);
			const default_parsed = JSON.parse(
				default_plugin.load.call(default_ctx, RESOLVED_VIRTUAL_ID)!
			) as Record<string, unknown>;
			assert.notOk('keywords' in default_parsed);

			// widened keys: compose from the default so curated fields stay in
			const plugin = vite_plugin_pkg_json({
				keys: [...pkg_json_keys, 'keywords']
			}) as unknown as PluginHooks;
			plugin.configResolved({ root: dir, command: 'build' });
			const ctx = create_mock_ctx();
			plugin.buildStart.call(ctx);
			const parsed = JSON.parse(plugin.load.call(ctx, RESOLVED_VIRTUAL_ID)!) as Record<
				string,
				unknown
			>;
			assert.deepEqual(parsed.keywords, ['a', 'b']);
			assert.strictEqual(parsed.name, '@x/y');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('a narrower keys list drops curated defaults', () => {
		const dir = make_temp_dir();
		try {
			write_package_json(dir, { name: '@x/y', version: '1.0.0', glyph: '🧶' });
			const plugin = vite_plugin_pkg_json({ keys: ['name', 'version'] }) as unknown as PluginHooks;
			plugin.configResolved({ root: dir, command: 'build' });
			const ctx = create_mock_ctx();
			plugin.buildStart.call(ctx);
			const parsed = JSON.parse(plugin.load.call(ctx, RESOLVED_VIRTUAL_ID)!) as Record<
				string,
				unknown
			>;
			assert.deepEqual(Object.keys(parsed), ['name', 'version']);
			assert.notOk('glyph' in parsed);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('errors', () => {
	test('throws a named diagnostic when package.json is missing', () => {
		const dir = make_temp_dir(); // empty, no package.json
		try {
			const plugin = vite_plugin_pkg_json() as unknown as PluginHooks;
			plugin.configResolved({ root: dir, command: 'build' });
			const ctx = create_mock_ctx();
			assert.throws(
				() => plugin.buildStart.call(ctx),
				/vite_plugin_pkg_json.*failed to read or parse/
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('throws when package.json is malformed', () => {
		const dir = make_temp_dir();
		try {
			writeFileSync(join(dir, 'package.json'), '{not valid json');
			const plugin = vite_plugin_pkg_json() as unknown as PluginHooks;
			plugin.configResolved({ root: dir, command: 'build' });
			const ctx = create_mock_ctx();
			assert.throws(() => plugin.buildStart.call(ctx), /failed to read or parse/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('dev', () => {
	test('re-reads package.json on each load so edits propagate', () => {
		const dir = make_temp_dir();
		try {
			write_package_json(dir, { name: '@x/y', version: '1.0.0', glyph: '🧶' });
			const plugin = vite_plugin_pkg_json() as unknown as PluginHooks;
			plugin.configResolved({ root: dir, command: 'serve' });
			const ctx = create_mock_ctx();
			plugin.buildStart.call(ctx);

			const first = JSON.parse(plugin.load.call(ctx, RESOLVED_VIRTUAL_ID)!) as { glyph: string };
			assert.strictEqual(first.glyph, '🧶');

			// edit package.json; dev mode must reflect it on the next load (no cache)
			write_package_json(dir, { name: '@x/y', version: '1.0.0', glyph: '🕸' });
			const second = JSON.parse(plugin.load.call(ctx, RESOLVED_VIRTUAL_ID)!) as { glyph: string };
			assert.strictEqual(second.glyph, '🕸');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
