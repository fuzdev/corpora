/**
 * The manifest: which upstream repos are vendored, at which commit, and how each
 * collection is filtered. Loaded from `manifest.json` at the repo root and validated in two
 * passes: the `Manifest` schema checks each field, reporting those problems together up to
 * the schema library's issue cap, and once the shape passes, `find_manifest_problems`
 * reports every cross-field problem together. A manifest with both kinds takes two runs.
 *
 * @module
 */

import { to_error_message } from '@fuzdev/fuz_util/error.ts';
import { meta } from '@fuzdev/fuz_schema/meta.ts';
import * as s from '@fuzdev/fuz_schema/schema.ts';
import type { FsReadDir } from '@fuzdev/gro/fs.ts';
import { TaskError } from '@fuzdev/gro/task.ts';

/** A relative path with no leading `./`, no `..` segment, and no trailing slash. */
export const is_clean_path = (p: string): boolean =>
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

/** The manifest format consumers read; bump on a shape change they must notice. */
export const MANIFEST_VERSION = 2;

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

/** The GitHub owners whose repos are `own` — `origin` must agree with the URL's owner. */
const OWN_OWNERS: ReadonlySet<string> = new Set(['fuzdev', 'ryanatkn']);

const COMMIT_RE = /^[0-9a-f]{40}$/;
const NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;
const URL_RE = /^https:\/\/github\.com\/[^/]+\/[^/]+$/;
const OWNER_RE = /^https:\/\/github\.com\/([^/]+)\//;
const EXTENSION_RE = /^[a-z0-9]+$/;

const CleanPath = s.message(
	s.pipe(s.string, s.check(is_clean_path, 'a clean relative path')),
	'must be a clean relative path'
);

const Paths = s.message(s.array(CleanPath), 'must be an array of clean relative paths');

/** Who last formatted a collection's code — lets a consumer pick a fair subset. */
export const ShapedBy = meta(
	s.message(
		s.one_of(['tsv', 'prettier', 'oxfmt', 'none']),
		'must be one of tsv, prettier, oxfmt, none'
	),
	{ description: "who last formatted a collection's code, for selecting a fair subset" }
);
export type ShapedBy = s.Infer<typeof ShapedBy>;

/**
 * Who wrote a collection's code: `own` for the fuz ecosystem's own authors (the `fuzdev`
 * and `ryanatkn` repos), `third_party` for everyone else's. Lets a consumer report the
 * code its tools were not developed against apart from the code they were.
 */
export const Origin = meta(
	s.message(s.one_of(['own', 'third_party']), 'must be one of own, third_party'),
	{
		description:
			"who wrote a collection's code: `own` for the fuzdev and ryanatkn repos, `third_party` otherwise"
	}
);
export type Origin = s.Infer<typeof Origin>;

/**
 * Where a collection's license comes from: a file at the pinned commit (copied verbatim
 * to `collections/<name>/LICENSE`), or a `package.json` declaration when the upstream
 * ships no license file at its root (a generated `LICENSE` names the declaration).
 */
export const LicenseSource = meta(
	s.pipe(
		s.message(
			s.union([
				s.object({ spdx: s.string, file: s.string }),
				s.object({ spdx: s.string, declared_in: s.string })
			]),
			'needs `spdx` and exactly one of `file` or `declared_in`'
		),
		s.message(
			s.check_at('spdx', (v: { spdx: string }) => Object.hasOwn(PERMISSIVE_LICENSES, v.spdx)),
			(_, value) =>
				`${JSON.stringify((value as { spdx: string }).spdx)} is not permissive (allowed: ${Object.keys(PERMISSIVE_LICENSES).join(', ')})`
		)
	),
	{ description: 'license provenance; must be a permissive license the materializer can verify' }
);
export type LicenseSource = s.Infer<typeof LicenseSource>;

/** One vendored upstream repo. */
export const Collection = s.object({
	name: meta(s.message(s.pipe(s.string, s.regex(NAME_RE)), `must match ${NAME_RE}`), {
		description: 'directory name under `collections/`; usually the upstream repo name'
	}),
	url: meta(
		s.message(s.pipe(s.string, s.regex(URL_RE)), 'must be an https GitHub repo URL without .git'),
		{ description: 'clone URL of the upstream' }
	),
	commit: meta(s.message(s.pipe(s.string, s.regex(COMMIT_RE)), 'must be a full 40-hex SHA'), {
		description: 'full 40-hex commit the collection is pinned at'
	}),
	subpaths: meta(
		s.message(
			s.pipe(s.array(CleanPath), s.min_length(1)),
			'must be a non-empty array of clean relative paths'
		),
		{ description: 'repo-relative directories to vendor, each keeping its upstream path' }
	),
	exclude: meta(Paths, {
		description: "repo-relative path prefixes to leave out — the upstream's own test fixtures"
	}),
	files: s.optional(
		meta(Paths, {
			description:
				'repo-relative files vendored verbatim whatever their extension: a module-type or config file a runtime reads to load the source as written, like the `package.json` whose `"type": "module"` makes Node read `.ts` as ESM, or an upstream attribution notice a license requires to accompany the code, like the `NOTICE.txt` crediting Apache-2.0 code a library ported; each must be a regular file at the pinned commit, or the materializer fails'
		})
	),
	license: LicenseSource,
	shaped_by: ShapedBy,
	origin: Origin
});
export type Collection = s.Infer<typeof Collection>;

/** The whole manifest. */
export const Manifest = s.object({
	version: meta(s.message(s.literal(MANIFEST_VERSION), `must be ${MANIFEST_VERSION}`), {
		description: '`MANIFEST_VERSION` — a consumer that reads the manifest checks it'
	}),
	include: meta(
		s.message(
			s.pipe(s.array(s.pipe(s.string, s.regex(EXTENSION_RE))), s.min_length(1)),
			'must be a non-empty array of lowercase extensions without dots'
		),
		{ description: 'file extensions (no dot) a collection keeps; everything else is dropped' }
	),
	// the message is on the step alone, so it can't label an issue from inside a collection
	collections: s.pipe(s.array(Collection), s.message(s.min_length(1), 'must be a non-empty array'))
});
export type Manifest = s.Infer<typeof Manifest>;

const to_issue_path = (path: ReadonlyArray<PropertyKey>): string =>
	path.reduce<string>((text, key) => {
		if (typeof key === 'number') return `${text}[${key}]`;
		const part = typeof key === 'string' && /^\w+$/.test(key) ? key : JSON.stringify(String(key));
		return text ? `${text}.${part}` : part;
	}, '');

/** Formats one problem as `collections[2].commit must be a full 40-hex SHA`, for both passes. */
const format_problem = (path: ReadonlyArray<PropertyKey>, text: string): string => {
	const where = to_issue_path(path);
	return where ? `${where} ${text}` : text;
};

/** Formats an issue from parsing a file, as `format_problem` formats every problem. */
export const format_file_issue = (issue: s.SchemaIssue): string =>
	format_problem(
		issue.path,
		issue.message ??
			(issue.kind === 'unknown_key'
				? 'is not a known key'
				: `must be ${issue.expected}, received ${issue.received}`)
	);

/** Every problem across a collection's own fields, from a manifest whose shape passed. */
const find_collection_problems = (
	collection: Collection,
	index: number,
	include: ReadonlySet<string>
): Array<string> => {
	const at = (key: string, i?: number): Array<PropertyKey> =>
		i === undefined ? ['collections', index, key] : ['collections', index, key, i];
	const { subpaths, exclude, files = [], url, origin } = collection;
	const problems: Array<string> = [];
	exclude.forEach((e, i) => {
		if (!subpaths.some((p) => is_under(e, p))) {
			problems.push(
				format_problem(at('exclude', i), `${JSON.stringify(e)} is not under any subpath`)
			);
		}
	});
	const seen: Set<string> = new Set();
	files.forEach((file, i) => {
		if (seen.has(file))
			problems.push(format_problem(at('files', i), `${JSON.stringify(file)} is duplicated`));
		seen.add(file);
		if (file === 'LICENSE') {
			problems.push(
				format_problem(at('files', i), '"LICENSE" collides with the collection LICENSE')
			);
		}
		if (subpaths.some((p) => is_under(file, p)) && is_included_path(file, include, exclude)) {
			problems.push(
				format_problem(at('files', i), `${JSON.stringify(file)} is already kept by \`subpaths\``)
			);
		}
	});
	const owner = OWNER_RE.exec(url)?.[1];
	if (owner !== undefined && OWN_OWNERS.has(owner) !== (origin === 'own')) {
		problems.push(
			format_problem(
				at('origin'),
				`"${origin}" disagrees with the URL's owner ${JSON.stringify(owner)} (\`own\` is exactly ${[...OWN_OWNERS].join(', ')})`
			)
		);
	}
	return problems;
};

/**
 * The second pass: every problem that reads more than one field, from a manifest whose shape
 * has passed.
 * @returns the problems, in the form of the first pass's, empty when there are none
 */
export const find_manifest_problems = (manifest: Manifest): Array<string> => {
	const include = new Set(manifest.include);
	const names: Set<string> = new Set();
	return manifest.collections.flatMap((collection, i) => {
		const problems = find_collection_problems(collection, i, include);
		if (names.has(collection.name)) {
			problems.unshift(
				format_problem(['collections', i, 'name'], `"${collection.name}" is duplicated`)
			);
		}
		names.add(collection.name);
		return problems;
	});
};

const to_invalid_error = (
	label: string,
	problems: ReadonlyArray<string>,
	hint?: string
): TaskError =>
	new TaskError(`${label} is invalid:\n  ${problems.join('\n  ')}${hint ? `\n${hint}` : ''}`);

/**
 * Parses JSON read from the file `label` names against `schema`.
 * @param hint - appended to the error for a value that doesn't match `schema`
 * @throws TaskError - naming `label` when `text` isn't JSON, or listing the schema's issues
 */
export const parse_json_text = <T extends s.Schema>(
	schema: T,
	label: string,
	text: string,
	hint?: string
): s.Infer<T> => {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch (error) {
		throw new TaskError(
			`${label} is not valid JSON: ${to_error_message(error)}${hint ? `\n${hint}` : ''}`
		);
	}
	const result = s.parse(schema, json);
	if (result.ok) return result.value;
	throw to_invalid_error(label, result.issues.map(format_file_issue), hint);
};

/**
 * Reads and validates the manifest at `path` beneath `dir`, in the module's two passes.
 * @throws TaskError - listing the field problems together, up to the schema library's issue
 * cap, or when the shape passes, every cross-field problem
 */
export const load_manifest = async (dir: FsReadDir, path: string): Promise<Manifest> => {
	const manifest = parse_json_text(Manifest, path, await dir.read_text(path));
	const problems = find_manifest_problems(manifest);
	if (problems.length > 0) throw to_invalid_error(path, problems);
	return manifest;
};
