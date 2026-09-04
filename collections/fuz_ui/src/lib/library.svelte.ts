import type { LibraryJson } from '@fuzdev/fuz_util/library_json.ts';
import { ensure_start, strip_end } from '@fuzdev/fuz_util/string.ts';
import type { Url } from '@fuzdev/fuz_util/url.ts';

import { create_context } from './context_helpers.ts';
import { Declaration } from './declaration.svelte.ts';
import { Module } from './module.svelte.ts';
import {
	package_is_published,
	repo_name_parse,
	repo_url_github_owner,
	repo_url_parse,
	url_github_file,
	url_logo,
	url_npm_package
} from '@fuzdev/fuz_util/package_helpers.ts';

/**
 * Holds a getter to the active `Library` for the current subtree.
 *
 * The getter form keeps consumers reactive when the library changes without
 * requiring a remount — set it with a closure over reactive state, e.g.
 * `library_context.set(() => library)`. Components that accept a `library`
 * prop (`LibraryDetail`, `ApiIndex`, `ApiModule`) project the prop into this
 * context for their subtree, so descendants like `ModuleLink`,
 * `DeclarationLink`, and TSDoc-rendered `DocsLink` resolve against the same
 * library — including when an aggregator renders a foreign library that
 * differs from the site-level context.
 */
export const library_context = create_context<() => Library>();

/**
 * Sets `library_context` for the component's subtree to a getter that prefers
 * the component's `library` prop and falls back to the ancestor's value,
 * returning the resolved getter.
 *
 * Pass `get_library_prop` as a getter (not a snapshot) so prop changes remain
 * reactive. The ancestor lookup happens once at component init, before the
 * projection — the fallback sees the parent value, not the projection.
 *
 * @param get_library_prop - Getter for the component's `library` prop. A thunk so the prop stays reactive.
 * @param component_name - Used in the error when neither the prop nor the context provides a library.
 * @returns getter for the resolved library; read it lazily, e.g. `$derived(get_library())`
 * @initializes
 */
export const set_library_context_with_fallback = (
	get_library_prop: () => Library | undefined,
	component_name: string
): (() => Library) => {
	const get_outer = library_context.get_maybe();
	const get_library = (): Library => {
		const value = get_library_prop() ?? get_outer?.();
		if (!value) {
			throw Error(`${component_name} requires a \`library\` prop or a set \`library_context\``);
		}
		return value;
	};
	library_context.set(get_library);
	return get_library;
};

/**
 * Normalizes a URL prefix: ensures leading `/`, strips trailing `/`, returns `''` for falsy and non-string values.
 */
export const parse_library_url_prefix = (value: unknown): string => {
	if (!value || typeof value !== 'string') return '';
	return ensure_start(strip_end(value, '/'), '/');
};

/**
 * Rich runtime representation of a library.
 *
 * Wraps `LibraryJson` with computed properties and provides the root
 * of the API documentation hierarchy: `Library` → `Module` → `Declaration`.
 *
 * A `Library` and everything it materializes is immutable — `library_json` is
 * assigned once in the constructor — so the computed properties across all
 * three classes are plain getters, with the allocating ones (the `Module` and
 * `Declaration` trees, the lookup maps) cached in a private field on first
 * read. They are deliberately **not** `$derived`: Svelte's server runtime only
 * memoizes a `$derived` created during a render (`ssr_context` is otherwise
 * null), so a `Library` constructed at module scope — the normal shape for a
 * multi-package docs site — rebuilds its entire `Module`/`Declaration` tree on
 * every property read, turning a `declaration_by_name` lookup into a full
 * re-materialization of the library. Reactivity is at the instance level
 * instead: swap the `Library` (see `library_context`), don't mutate one.
 *
 * @see `module.svelte.ts` for `Module` class
 * @see `declaration.svelte.ts` for `Declaration` class
 */
export class Library {
	readonly library_json: LibraryJson = $state.raw()!;

	/**
	 * URL path prefix for multi-package documentation sites.
	 * Prepended to `/docs/api/` paths in `Module.url_api` and `Declaration.url_api`.
	 * Default `''` preserves single-package behavior.
	 */
	readonly url_prefix: string;

	get pkg_json(): LibraryJson['pkg_json'] {
		return this.library_json.pkg_json;
	}

	get source_json(): LibraryJson['source_json'] {
		return this.library_json.source_json;
	}

	// Everything below is derived from `pkg_json` — `LibraryJson` stores only the
	// raw `pkg_json`/`source_json` pair, so derivation lives in exactly one place.
	get name(): string {
		return this.pkg_json.name;
	}

	get repo_name(): string {
		return repo_name_parse(this.pkg_json.name);
	}

	#repo_url: Url | undefined;

	/** Non-null — the constructor rejects a `pkg_json` without a parseable `repository`. */
	get repo_url(): Url {
		return (this.#repo_url ??= repo_url_parse(this.pkg_json.repository)!);
	}

	get owner_name(): string | null {
		return repo_url_github_owner(this.repo_url);
	}

	get homepage_url(): Url | null {
		return this.pkg_json.homepage ?? null;
	}

	get logo_url(): Url | null {
		return url_logo(this.homepage_url, this.pkg_json.logo);
	}

	get logo_alt(): string {
		return this.pkg_json.logo_alt ?? `logo for ${this.repo_name}`;
	}

	get published(): boolean {
		return package_is_published(this.pkg_json);
	}

	get npm_url(): Url | null {
		return this.published ? url_npm_package(this.name) : null;
	}

	get changelog_url(): Url | null {
		return this.published ? url_github_file(this.repo_url, 'CHANGELOG.md') : null;
	}

	/**
	 * Organization URL (e.g., 'https://github.com/ryanatkn'), built from `owner_name`.
	 */
	get org_url(): string | null {
		const { owner_name } = this;
		return owner_name ? 'https://github.com/' + owner_name : null;
	}

	#modules: Array<Module> | undefined;

	/**
	 * All modules as rich `Module` instances.
	 */
	get modules(): Array<Module> {
		return (this.#modules ??= this.source_json.modules
			? this.source_json.modules.map((module_json) => new Module(this, module_json))
			: []);
	}

	#modules_sorted: Array<Module> | undefined;

	/**
	 * All modules sorted alphabetically by path.
	 */
	get modules_sorted(): Array<Module> {
		return (this.#modules_sorted ??= [...this.modules].sort((a, b) =>
			a.path.localeCompare(b.path)
		));
	}

	#declarations: Array<Declaration> | undefined;

	/**
	 * All declarations across all modules as a flat array.
	 */
	get declarations(): Array<Declaration> {
		return (this.#declarations ??= this.modules.flatMap((module) => module.declarations));
	}

	#module_by_path: Map<string, Module> | undefined;

	/**
	 * Module lookup map by path. Provides O(1) lookup.
	 */
	get module_by_path(): Map<string, Module> {
		return (this.#module_by_path ??= new Map(this.modules.map((m) => [m.path, m])));
	}

	#declaration_by_name: Map<string, Declaration> | undefined;

	/**
	 * Declaration lookup map by name. Provides O(1) lookup.
	 */
	get declaration_by_name(): Map<string, Declaration> {
		return (this.#declaration_by_name ??= new Map(this.declarations.map((d) => [d.name, d])));
	}

	constructor(library_json: LibraryJson, url_prefix = '') {
		// `repo_url` is exposed non-null and several derived URLs depend on it, so
		// fail loud here rather than letting a missing/unparseable repository surface
		// as a downstream `null`.
		if (repo_url_parse(library_json.pkg_json.repository) === null) {
			throw Error(
				`failed to construct Library - pkg_json for "${
					library_json.pkg_json.name
				}" has no parseable \`repository\``
			);
		}
		this.library_json = library_json;
		this.url_prefix = parse_library_url_prefix(url_prefix);
	}

	/**
	 * Look up modules within a directory prefix.
	 * Returns modules whose paths start with `path + "/"`, or `null` if none match.
	 */
	lookup_directory_modules(path: string): Array<Module> | null {
		const prefix = path + '/';
		let result: Array<Module> | null = null;
		for (const m of this.modules_sorted) {
			if (m.path.startsWith(prefix)) {
				(result ??= []).push(m);
			}
		}
		return result;
	}

	/**
	 * Search declarations by query string with multi-term AND logic.
	 */
	search_declarations(query: string): Array<Declaration> {
		return library_search_declarations(this.declarations, query);
	}
}

/**
 * Search declarations by query string with multi-term AND logic.
 */
const library_search_declarations = (
	declarations: Array<Declaration>,
	query: string
): Array<Declaration> => {
	if (!query.trim()) return [];

	const terms = query.trim().toLowerCase().split(/\s+/);

	const results = declarations
		.map((declaration) => {
			let total_score = 0;

			for (const term of terms) {
				const name_score = library_score_match(declaration.name, term);
				const kind_score = library_score_match(declaration.kind, term);
				const module_score = library_score_match(declaration.module_path, term);

				const term_best = Math.max(name_score, kind_score, module_score);

				if (term_best === 0) {
					return null;
				}

				total_score += term_best;
			}

			return { declaration, score: total_score };
		})
		.filter((r) => r !== null)
		.sort((a, b) => b.score - a.score || a.declaration.name.localeCompare(b.declaration.name))
		.map((r) => r.declaration);

	return results;
};

/**
 * Score a search term match against a field value.
 */
const library_score_match = (field_value: string, term: string): number => {
	const field_lower = field_value.toLowerCase();

	if (field_lower === term) return 100;
	if (field_lower.startsWith(term)) return 80;
	if (field_lower.includes(term)) return 60;

	let term_idx = 0;
	for (const char of field_lower) {
		if (char === term[term_idx]) {
			term_idx++;
			if (term_idx === term.length) {
				return 40;
			}
		}
	}

	return 0;
};
