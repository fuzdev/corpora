/**
 * Vite plugin serving a curated, publish-safe `package.json` as the virtual
 * module `virtual:pkg.json`.
 *
 * Consumers' `src/routes/library.ts` (and root layouts) need package identity —
 * name, version, the Fuz extension fields — in the client. Importing the root
 * `package.json` directly inlines the *whole* file into the client bundle
 * (`scripts`, `dependencies`, `devDependencies`, private config) and trips
 * SvelteKit's `server.fs.allow` on cold HMR reloads. This plugin reads the
 * project's `package.json` at build time, strips it to `pkg_json_keys`, and
 * serves only that subset. Consumers combine it with `virtual:svelte-docinfo`'s
 * analyzed `modules` via `library_json_from_modules` to build a `LibraryJson`
 * (see `src/routes/library.ts` for the canonical pattern).
 *
 * The `.json` suffix on the virtual id is load-bearing, mirroring how
 * `vite_plugin_fuz_css`'s `virtual:fuz.css` relies on `.css`: `load()` returns
 * raw JSON text and Vite's built-in `vite:json` plugin transforms it into an ES
 * module (default export plus named exports), so consumers write
 * `import package_json from 'virtual:pkg.json'`. Do *not* return a JS module
 * here — the `.json` id would double-transform it.
 *
 * ```ts
 * // vite.config.ts
 * import {vite_plugin_pkg_json} from '@fuzdev/fuz_ui/vite_plugin_pkg_json.ts';
 * export default defineConfig({plugins: [vite_plugin_pkg_json(), sveltekit()]});
 * ```
 *
 * The kept field set defaults to `pkg_json_keys`. To expose extra publish-safe
 * fields, pass a wider `keys` list — typically composed from the default with a
 * spread (`` keys: [...pkg_json_keys, 'keywords'] ``). Because `library_json_from_modules`
 * re-strips at runtime, the *same* list must reach that call (and the consumer's
 * `virtual:pkg.json` ambient type) for the extras to survive end to end — share
 * one const across all three sites:
 *
 * ```ts
 * // src/routes/pkg_json_keys.ts
 * import {pkg_json_keys} from '@fuzdev/fuz_util/pkg_json.ts';
 * export const pkg_json_keys_custom = [...pkg_json_keys, 'keywords'] as const;
 *
 * // vite.config.ts        → vite_plugin_pkg_json({keys: pkg_json_keys_custom})
 * // src/routes/library.ts → library_json_from_modules(pkg_json, modules, pkg_json_keys_custom)
 * ```
 *
 * @module
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin, Rollup } from 'vite';
import type { PackageJson } from '@fuzdev/fuz_util/package_json.ts';
import { pkg_json_from_package_json, pkg_json_keys } from '@fuzdev/fuz_util/pkg_json.ts';

const VIRTUAL_ID = 'virtual:pkg.json';
/**
 * Resolved id, `\0`-prefixed — the conventional Rollup marker for "this id is
 * mine," hiding the virtual module from other plugins and the dev module graph.
 *
 * This deliberately diverges from `vite_plugin_fuz_css`, which avoids the `\0`
 * on its resolved id: SvelteKit's dev FOUC prevention inlines `virtual:fuz.css`
 * into the SSR'd `<head>` via URL lookup and can't resolve the `\0`-encoded
 * form, so the page would flash unstyled. JSON is never inlined into `<head>`,
 * so that constraint doesn't apply here and the `\0` is free to do its normal
 * job. The trailing `.json` survives the prefix, so Vite's built-in `vite:json`
 * plugin still matches and transforms the loaded text (see the module comment).
 */
const RESOLVED_VIRTUAL_ID = '\0virtual:pkg.json';

/** Options for `vite_plugin_pkg_json`. */
export interface VitePluginPkgJsonOptions {
	/**
	 * The `package.json` fields to keep in the served subset. Defaults to the
	 * curated, publish-safe `pkg_json_keys`. Pass a wider list — usually
	 * `` [...pkg_json_keys, 'extra'] `` — to expose more fields; the same list
	 * must reach `library_json_from_modules` (see the module comment).
	 */
	keys?: ReadonlyArray<keyof PackageJson>;
}

/**
 * Creates the `virtual:pkg.json` plugin. Zero-config for canonical fuz usage —
 * the publish-safe field set defaults to `pkg_json_keys`; widen it via `keys`.
 */
export const vite_plugin_pkg_json = (options: VitePluginPkgJsonOptions = {}): Plugin => {
	const { keys = pkg_json_keys } = options;
	let root = '';
	let is_dev = false;
	/** Curated JSON cached for build; left `null` in dev so `load` re-reads. */
	let cached: string | null = null;

	/**
	 * Reads `package.json`, strips it to the configured `keys` subset via
	 * `pkg_json_from_package_json` (the same strip the runtime uses, so the two
	 * can't drift), and returns the curated JSON text. Routes failures through the
	 * plugin context (`ctx.error`/`ctx.warn`) so a missing or malformed file
	 * surfaces as a named, actionable diagnostic rather than a raw
	 * `readFileSync`/`JSON.parse` stack trace.
	 */
	const read_curated = (ctx: Rollup.PluginContext): string => {
		const package_json_path = join(root, 'package.json');
		ctx.addWatchFile(package_json_path); // re-emit when package.json changes
		let raw: PackageJson;
		try {
			raw = JSON.parse(readFileSync(package_json_path, 'utf8')) as PackageJson;
		} catch (err) {
			// ctx.error throws, so this never returns
			return ctx.error(
				`vite_plugin_pkg_json: failed to read or parse ${package_json_path}: ${
					(err as Error).message
				}`
			);
		}
		if (raw.name === undefined) {
			ctx.warn(`vite_plugin_pkg_json: ${package_json_path} has no "name" field`);
		}
		return JSON.stringify(pkg_json_from_package_json(raw, keys));
	};

	return {
		name: 'vite-plugin-pkg-json',
		// Resolve the virtual id before other plugins claim it.
		enforce: 'pre',
		configResolved(config) {
			root = config.root;
			is_dev = config.command === 'serve';
		},
		buildStart() {
			// Read package.json once up front so a missing or malformed file fails
			// immediately — at build start, or at dev-server startup — rather than
			// only when something first imports the virtual module. In build the
			// result is cached for `load`; in dev `load` re-reads each time so edits
			// to package.json propagate through the `addWatchFile`-driven reload.
			const curated = read_curated(this);
			if (!is_dev) cached = curated;
		},
		resolveId(id) {
			if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
			return undefined;
		},
		load(id) {
			if (id !== RESOLVED_VIRTUAL_ID) return undefined;
			return cached ?? read_curated(this);
		}
	};
};
