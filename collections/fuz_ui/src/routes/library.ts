import { library_json_from_modules } from '@fuzdev/fuz_util/library_json.ts';
import { modules } from 'virtual:svelte-docinfo';
import pkg_json from 'virtual:pkg.json';

// Canonical pattern for building a `LibraryJson` in a client bundle: combine the
// two virtual modules — `virtual:svelte-docinfo` (the analyzed `modules`) and
// `virtual:pkg.json` (the curated `PkgJson`). Serving `pkg_json` through the
// plugin keeps the full `package.json` (scripts, dependencies, devDependencies,
// config) out of the bundle; `library_json_from_modules` only reads curated
// fields.
export const library_json = library_json_from_modules(pkg_json, modules);
