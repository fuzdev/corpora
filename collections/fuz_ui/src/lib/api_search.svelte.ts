import type { Declaration } from './declaration.svelte.ts';
import type { Library } from './library.svelte.ts';
import type { Module } from './module.svelte.ts';

/**
 * Unified search state for the API index page (modules and declarations).
 */
export class ApiSearchState {
	readonly library: Library;

	query: string = $state('');

	readonly modules: Array<Module> = $derived.by(() => this.library.modules_sorted);

	readonly modules_filtered: Array<Module> = $derived.by(() => {
		if (!this.query.trim()) return this.modules;
		const terms = this.query.trim().toLowerCase().split(/\s+/);
		return this.modules.filter((m) => {
			const path_lower = m.path.toLowerCase();
			const comment_lower = m.module_comment?.toLowerCase() ?? '';
			return terms.every((term) => path_lower.includes(term) || comment_lower.includes(term));
		});
	});

	readonly declarations: Array<Declaration> = $derived.by(() => this.library.declarations);

	readonly declarations_filtered: Array<Declaration> = $derived.by(() => {
		const items = this.query.trim()
			? this.library.search_declarations(this.query)
			: this.declarations;
		// spread before sort — `items` may be the shared source array
		return [...items].sort((a, b) => a.name.localeCompare(b.name));
	});

	constructor(library: Library) {
		this.library = library;
	}
}

/**
 * Search state for a module-specific declaration list.
 */
export class DeclarationSearchState {
	readonly declarations: Array<Declaration>;

	query: string = $state('');

	readonly filtered: Array<Declaration> = $derived.by(() => {
		const trimmed_query = this.query.trim();
		// spread before sort — `declarations` is the shared source array
		if (!trimmed_query) return [...this.declarations].sort((a, b) => a.name.localeCompare(b.name));

		const terms = trimmed_query.toLowerCase().split(/\s+/);

		const items = this.declarations.filter((d) => {
			const name_lower = d.name.toLowerCase();
			const kind_lower = d.kind.toLowerCase();
			const module_path_lower = d.module_path.toLowerCase();

			return terms.every(
				(term) =>
					name_lower.includes(term) || kind_lower.includes(term) || module_path_lower.includes(term)
			);
		});

		return items.sort((a, b) => a.name.localeCompare(b.name));
	});

	constructor(declarations: Array<Declaration>) {
		this.declarations = declarations;
	}
}
