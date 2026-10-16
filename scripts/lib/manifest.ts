/**
 * The manifest: which upstream repos are vendored, at which commit, and how each
 * collection is filtered. Loaded from `manifest.json` at the repo root and validated by
 * hand — the repo has no dependencies, so no schema library.
 *
 * @module
 */

/** Who last formatted a collection's code — lets a consumer pick a fair subset. */
export type ShapedBy = 'tsv' | 'prettier' | 'none';

/**
 * Who wrote a collection's code: `own` for the fuz ecosystem's own authors (the `fuzdev`
 * and `ryanatkn` repos), `third_party` for everyone else's. Lets a consumer report the
 * code its tools were not developed against apart from the code they were.
 */
export type Origin = 'own' | 'third_party';

/**
 * Where a collection's license comes from: a file at the pinned commit (copied verbatim
 * to `collections/<name>/LICENSE`), or a `package.json` declaration when the upstream
 * ships no license file at its root (a generated `LICENSE` names the declaration).
 */
export type LicenseSource = { spdx: string; file: string } | { spdx: string; declared_in: string };

/** One vendored upstream repo. */
export interface Collection {
	/** Directory name under `collections/`; usually the upstream repo name. */
	name: string;
	/** Clone URL of the upstream. */
	url: string;
	/** Full 40-hex commit the collection is pinned at. */
	commit: string;
	/** Repo-relative directories to vendor, each keeping its upstream path. */
	subpaths: string[];
	/** Repo-relative path prefixes to leave out — the upstream's own test fixtures. */
	exclude: string[];
	/**
	 * Repo-relative files to vendor verbatim whatever their extension — a module-type or
	 * config file a runtime reads to load the source as written, like the `package.json`
	 * whose `"type": "module"` makes Node read `.ts` as ESM. Each must be a regular file
	 * at the pinned commit, or the materializer fails.
	 */
	files?: string[];
	/** License provenance; must be a permissive license the materializer can verify. */
	license: LicenseSource;
	/** Who last formatted the code. */
	shaped_by: ShapedBy;
	/** Who wrote the code. */
	origin: Origin;
}

/** The manifest format consumers read; bump on a shape change they must notice. */
export const MANIFEST_VERSION = 2;

/** The whole manifest. */
export interface Manifest {
	/** `MANIFEST_VERSION` — a consumer that reads the manifest checks it. */
	version: number;
	/** File extensions (no dot) a collection keeps; everything else is dropped. */
	include: string[];
	collections: Collection[];
}

/**
 * Licenses a collection may carry, with a phrase the license text must contain — a
 * cheap check that the file named really is that license. Everything else is refused.
 */
export const PERMISSIVE_LICENSES: Record<string, RegExp> = {
	MIT: /Permission is hereby granted, free of charge/,
	'Apache-2.0': /Apache License/,
	'BSD-2-Clause': /Redistribution and use in source and binary forms/,
	'BSD-3-Clause': /Redistribution and use in source and binary forms/,
	ISC: /Permission to use, copy, modify, and\/or distribute this software/,
	'0BSD': /Permission to use, copy, modify, and\/or distribute this software/,
	Unlicense: /free and unencumbered software released into the public domain/,
	'CC0-1.0': /CC0/
};

const SHAPED_BY: ReadonlySet<string> = new Set(['tsv', 'prettier', 'none']);
const ORIGINS: ReadonlySet<string> = new Set(['own', 'third_party']);

/** The GitHub owners whose repos are `own` — `origin` must agree with the URL's owner. */
const OWN_OWNERS: ReadonlySet<string> = new Set(['fuzdev', 'ryanatkn']);

const COMMIT_RE = /^[0-9a-f]{40}$/;
const NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;

/** Reads and validates the manifest; throws with every problem found at once. */
export const load_manifest = async (path: string): Promise<Manifest> => {
	const raw: unknown = JSON.parse(await Deno.readTextFile(path));
	const problems = validate_manifest(raw);
	if (problems.length > 0) {
		throw new Error(`${path} is invalid:\n  ${problems.join('\n  ')}`);
	}
	return raw as Manifest;
};

/** Returns every problem with a parsed manifest; an empty array means it is valid. */
export const validate_manifest = (raw: unknown): string[] => {
	const problems: string[] = [];
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		return ['manifest must be a JSON object'];
	}
	const m = raw as Record<string, unknown>;
	if (m.version !== MANIFEST_VERSION) {
		problems.push(`\`version\` must be ${MANIFEST_VERSION}`);
	}
	if (
		!Array.isArray(m.include) ||
		m.include.length === 0 ||
		!m.include.every((e) => typeof e === 'string' && /^[a-z0-9]+$/.test(e))
	) {
		problems.push('`include` must be a non-empty array of lowercase extensions without dots');
	}
	if (!Array.isArray(m.collections) || m.collections.length === 0) {
		problems.push('`collections` must be a non-empty array');
		return problems;
	}
	const names = new Set<string>();
	m.collections.forEach((c: unknown, i: number) => {
		const where = `collections[${i}]`;
		if (typeof c !== 'object' || c === null) {
			problems.push(`${where} must be an object`);
			return;
		}
		const col = c as Record<string, unknown>;
		if (typeof col.name !== 'string' || !NAME_RE.test(col.name)) {
			problems.push(`${where}.name must match ${NAME_RE}`);
		} else if (names.has(col.name)) {
			problems.push(`${where}.name "${col.name}" is duplicated`);
		} else {
			names.add(col.name);
		}
		if (typeof col.url !== 'string' || !/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(col.url)) {
			problems.push(`${where}.url must be an https GitHub repo URL without .git`);
		}
		if (typeof col.commit !== 'string' || !COMMIT_RE.test(col.commit)) {
			problems.push(`${where}.commit must be a full 40-hex SHA`);
		}
		const subpaths = col.subpaths;
		if (!Array.isArray(subpaths) || subpaths.length === 0 || !subpaths.every(is_clean_path)) {
			problems.push(`${where}.subpaths must be a non-empty array of clean relative paths`);
		}
		const exclude = col.exclude;
		if (!Array.isArray(exclude) || !exclude.every(is_clean_path)) {
			problems.push(`${where}.exclude must be an array of clean relative paths`);
		} else if (Array.isArray(subpaths)) {
			for (const e of exclude as string[]) {
				if (!subpaths.some((s) => typeof s === 'string' && is_under(e, s))) {
					problems.push(`${where}.exclude "${e}" is not under any subpath`);
				}
			}
		}
		if (col.files !== undefined) {
			const files = col.files;
			if (!Array.isArray(files) || !files.every(is_clean_path)) {
				problems.push(`${where}.files must be an array of clean relative paths`);
			} else {
				const include = new Set(Array.isArray(m.include) ? (m.include as string[]) : []);
				const seen = new Set<string>();
				for (const f of files as string[]) {
					if (seen.has(f)) problems.push(`${where}.files "${f}" is duplicated`);
					seen.add(f);
					if (f === 'LICENSE') {
						problems.push(`${where}.files "LICENSE" collides with the collection LICENSE`);
					} else if (
						Array.isArray(subpaths) &&
						subpaths.some((s) => typeof s === 'string' && is_under(f, s)) &&
						is_included_path(f, include, Array.isArray(exclude) ? (exclude as string[]) : [])
					) {
						problems.push(`${where}.files "${f}" is already kept by \`subpaths\``);
					}
				}
			}
		}
		const lic = col.license as Record<string, unknown> | undefined;
		if (typeof lic !== 'object' || lic === null || typeof lic.spdx !== 'string') {
			problems.push(`${where}.license must be {spdx, file | declared_in}`);
		} else {
			if (!(lic.spdx in PERMISSIVE_LICENSES)) {
				problems.push(
					`${where}.license.spdx "${lic.spdx}" is not permissive (allowed: ${Object.keys(PERMISSIVE_LICENSES).join(', ')})`
				);
			}
			const has_file = typeof lic.file === 'string';
			const has_declared = typeof lic.declared_in === 'string';
			if (has_file === has_declared) {
				problems.push(`${where}.license needs exactly one of \`file\` or \`declared_in\``);
			}
		}
		if (typeof col.shaped_by !== 'string' || !SHAPED_BY.has(col.shaped_by)) {
			problems.push(`${where}.shaped_by must be one of ${[...SHAPED_BY].join(', ')}`);
		}
		if (typeof col.origin !== 'string' || !ORIGINS.has(col.origin)) {
			problems.push(`${where}.origin must be one of ${[...ORIGINS].join(', ')}`);
		} else if (typeof col.url === 'string') {
			const owner = /^https:\/\/github\.com\/([^/]+)\//.exec(col.url)?.[1];
			if (owner !== undefined && OWN_OWNERS.has(owner) !== (col.origin === 'own')) {
				problems.push(
					`${where}.origin "${col.origin}" disagrees with the URL's owner "${owner}" ` +
						`(\`own\` is exactly ${[...OWN_OWNERS].join(', ')})`
				);
			}
		}
	});
	return problems;
};

/** A relative path with no leading `./`, no `..` segment, and no trailing slash. */
export const is_clean_path = (p: unknown): boolean =>
	typeof p === 'string' &&
	p.length > 0 &&
	!p.startsWith('/') &&
	!p.endsWith('/') &&
	!p.split('/').some((seg) => seg === '' || seg === '.' || seg === '..');

/** Whether `path` equals `prefix` or lies beneath it. */
export const is_under = (path: string, prefix: string): boolean =>
	path === prefix || path.startsWith(prefix + '/');

/**
 * The file filter: keeps a path whose extension is in `include` and which lies under
 * none of the `exclude` prefixes. Extensionless files are never kept.
 */
export const is_included_path = (
	path: string,
	include: ReadonlySet<string>,
	exclude: readonly string[]
): boolean => {
	const base = path.slice(path.lastIndexOf('/') + 1);
	const dot = base.lastIndexOf('.');
	if (dot <= 0) return false;
	if (!include.has(base.slice(dot + 1).toLowerCase())) return false;
	return !exclude.some((e) => is_under(path, e));
};
