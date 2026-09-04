import { resolve } from '$app/paths';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { ensure_end, ensure_start } from '@fuzdev/fuz_util/string.ts';

import { create_context } from './context_helpers.ts';

export const docs_links_context = create_context<DocsLinks>();

/**
 * Convert a string to a URL-safe fragment identifier, preserving case.
 * Unlike `slugify` from `@fuzdev/fuz_util/path.ts` which lowercases,
 * this keeps the original casing so API declarations like `AsyncStatus`
 * and `async_status` produce distinct fragment IDs.
 * Used by the `Tome` documentation system for heading and section anchors.
 * @param str - the string to convert to a fragment
 * @returns a URL-safe fragment identifier with case preserved
 */
export const docs_slugify = (str: string): string => {
	return (
		str
			.trim()
			// Replace spaces and multiple hyphens with single hyphen
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			// Remove invalid characters (keep letters, digits, _, $, -)
			.replace(/[^\w$-]/g, '')
			// Remove leading/trailing hyphens
			.replace(/^-+|-+$/g, '')
	);
};

export const DOCS_PATH_DEFAULT = '/docs';
export const DOCS_PATH = resolve('/docs');
export const DOCS_API_PATH = DOCS_PATH + '/api';

export const to_docs_path_info = (
	path_slug: string,
	pathname: string,
	root_path = DOCS_PATH_DEFAULT
): { path: string; path_is_selected: boolean; path_segment: string | undefined } => {
	const path_segment = pathname.split('/').at(-1);
	const path = resolve((ensure_end(ensure_start(root_path, '/'), '/') + path_slug) as any);
	const path_is_selected = path_segment === path_slug; // messy but works
	return { path, path_is_selected, path_segment };
};

export type DocsLinkTag = 'h2' | 'h3' | 'h4';

export interface DocsLinkInfo {
	id: string;
	text: string;
	fragment: string;
	tag: DocsLinkTag | undefined;
	depth: number;
	order: number;
	parent_id: string | undefined;
}

export class DocsLinks {
	readonly root_path: string;

	readonly links: SvelteMap<string, DocsLinkInfo> = new SvelteMap();

	// Maps compound keys (pathname#fragment) to their original order
	// This preserves order across component remounts
	#fragment_to_order: Map<string, number> = new Map();

	// Counter for generating unique IDs
	#next_id = 0;

	// Counter for generating section IDs (page-scoped, not module-scoped)
	#section_counter = 0;

	// Counter for generating link order values (page-scoped, not module-scoped)
	// This ensures consistent ordering between SSR and client hydration
	#order_counter = 0;

	docs_links = $derived.by(() => {
		// Build parent-child map
		const children_map: Map<string | undefined, Array<DocsLinkInfo>> = new Map();

		for (const link of this.links.values()) {
			if (!children_map.has(link.parent_id)) {
				children_map.set(link.parent_id, []);
			}
			children_map.get(link.parent_id)!.push(link);
		}

		// Sort siblings by order
		for (const siblings of children_map.values()) {
			siblings.sort((a, b) => a.order - b.order);
		}

		// Flatten tree with depth-first traversal
		const result: Array<DocsLinkInfo> = [];
		const traverse = (parent_id: string | undefined) => {
			const children = children_map.get(parent_id) || [];
			for (const child of children) {
				result.push(child);
				traverse(child.id); // recursively add children
			}
		};

		traverse(undefined); // start with root nodes (no parent)
		return result;
	});

	readonly fragments_onscreen: SvelteSet<string> = new SvelteSet();

	constructor(root_path = DOCS_PATH_DEFAULT) {
		this.root_path = root_path;
	}

	add(
		fragment: string,
		text: string,
		pathname: string,
		tag?: DocsLinkTag,
		depth = 1,
		parent_id?: string,
		explicit_id?: string
	): string {
		// Use explicit ID if provided, otherwise generate one
		const id = explicit_id ?? 'docs_link_' + this.#next_id++;

		// Use compound key (pathname#fragment) to preserve order across remounts
		const page_fragment_key = `${pathname}#${fragment}`;
		const existing_order = this.#fragment_to_order.get(page_fragment_key);
		const order = existing_order ?? this.#order_counter++;

		// Store order for new fragments only
		if (existing_order === undefined) {
			this.#fragment_to_order.set(page_fragment_key, order);
		}

		this.links.set(id, { id, fragment, text, tag, depth, order, parent_id });
		return id;
	}

	remove(id: string): void {
		this.links.delete(id);
	}

	/**
	 * Generate a unique section ID for the current page render.
	 * This counter is instance-scoped, ensuring SSR/client consistency.
	 */
	generate_section_id(): string {
		return `section_${this.#section_counter++}`;
	}
}
