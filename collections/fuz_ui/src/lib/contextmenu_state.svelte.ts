import { onDestroy, type Snippet } from 'svelte';
import type { Result } from '@fuzdev/fuz_util/result.ts';
import { is_promise } from '@fuzdev/fuz_util/async.ts';
import { BROWSER, DEV } from 'esm-env';
import type { SvelteHTMLElements } from 'svelte/elements';
import { EMPTY_OBJECT } from '@fuzdev/fuz_util/object.ts';
import type { Attachment } from 'svelte/attachments';

import { Dimensions } from './dimensions.svelte.ts';
import { create_context } from './context_helpers.ts';
import { url_to_root_relative } from './library_helpers.ts';
import { icon_copy } from './icons.ts';
import type { SvgData } from './svg.ts';

export const contextmenu_context = create_context<() => ContextmenuState>();

export const contextmenu_submenu_context = create_context<SubmenuState>();

export const contextmenu_dimensions_context = create_context(() => new Dimensions());

export type ContextmenuParams =
	| Snippet
	// TODO maybe this should be generic?
	| { snippet: 'link'; props: { href: string; icon?: string } }
	| { snippet: 'text'; props: { content: string; icon: SvgData | string; run: ContextmenuRun } }
	| { snippet: 'separator'; props: SvelteHTMLElements['li'] };

export type ContextmenuActivateResult =
	void | undefined | Result<{ close?: boolean }, { message?: string }>;

export type ItemState = SubmenuState | EntryState;

export class EntryState {
	readonly is_menu = false; // TODO rename to `type`?
	readonly menu: SubmenuState | RootMenuState;

	readonly run: () => ContextmenuRun;
	readonly disabled: () => boolean;

	selected: boolean = $state.raw(false);
	pending: boolean = $state.raw(false);
	error_message: string | null = $state.raw(null);
	promise: Promise<ContextmenuActivateResult> | null = $state.raw(null);

	constructor(
		menu: SubmenuState | RootMenuState,
		run: () => ContextmenuRun,
		disabled: () => boolean = () => false
	) {
		this.menu = menu;
		this.run = run;
		this.disabled = disabled;
	}
}

/**
 * Shared `items` state for `SubmenuState` and `RootMenuState`.
 *
 * The source of truth is a plain non-reactive array because items register and
 * unregister from component lifecycles that can interleave within a single batch -
 * effect teardowns can observe stale signal values mid-batch, so read-copy-write
 * against the reactive array can lose concurrent registrations (e.g. reopening the
 * menu while it's open). Every mutation publishes an immutable snapshot, preserving
 * the reassignment (not mutation) contract for readers.
 */
export class ContextmenuItemsState {
	#items_source: Array<ItemState> = [];
	#items: ReadonlyArray<ItemState> = $state.raw([]);

	get items(): ReadonlyArray<ItemState> {
		return this.#items;
	}

	set items(value: ReadonlyArray<ItemState>) {
		// copy for the published snapshot too, so callers mutating
		// their own array can't mutate it in readers' hands
		this.#items_source = [...value];
		this.#items = [...value];
	}

	/**
	 * Appends `item`, publishing a new immutable `items`.
	 */
	add_item(item: ItemState): void {
		this.#items_source.push(item);
		this.#items = [...this.#items_source];
	}

	/**
	 * Removes `item` if present, publishing a new immutable `items`.
	 * Safe to call from effect teardown - it reads only the non-reactive source array.
	 */
	remove_item(item: ItemState): void {
		const index = this.#items_source.indexOf(item);
		if (index === -1) return;
		this.#items_source.splice(index, 1);
		this.#items = [...this.#items_source];
	}
}

export class SubmenuState extends ContextmenuItemsState {
	readonly is_menu = true;
	readonly menu: SubmenuState | RootMenuState;
	readonly depth: number;

	selected: boolean = $state.raw(false);

	constructor(menu: SubmenuState | RootMenuState, depth: number) {
		super();
		this.menu = menu;
		this.depth = depth;
	}
}

export class RootMenuState extends ContextmenuItemsState {
	readonly is_menu = true;
	readonly menu = null;
	readonly depth = 1;
}

export type ContextmenuRun = () => ContextmenuActivateResult | Promise<ContextmenuActivateResult>;

/** Extracts a string `message` property from a thrown value or failed result, if present. */
const to_error_message = (value: unknown): string | undefined => {
	const message = (value as { message?: unknown } | null | undefined)?.message;
	return typeof message === 'string' ? message : undefined;
};

export interface ContextmenuStateOptions {
	layout?: Dimensions; // TODO consider making this a prop on `ContextmenuRoot`, and being assigned here
}

/**
 * Manages contextmenu state.
 * See usage with `ContextmenuRoot.svelte` and `Contextmenu.svelte`.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Element/contextmenu_event}
 */
export class ContextmenuState {
	layout: Dimensions; // TODO $state?
	/**
	 * If an initial layout is provided, control is deferred externally.
	 * Otherwise the layout syncs to the page dimensions.
	 */
	readonly has_custom_layout: boolean;

	// State for external consumers.
	opened: boolean = $state.raw(false);
	x: number = $state.raw(0);
	y: number = $state.raw(0);
	params: ReadonlyArray<ContextmenuParams> = $state.raw([]);
	error: string | undefined = $state.raw();

	/**
	 * The element the menu was opened from, while opened, else `undefined`.
	 * Resolves the popover host when the menu opens inside a modal `<dialog>` -
	 * see `contextmenu_resolve_popover_host`. Deliberately not reactive -
	 * read it in event handlers and attachments, not in templates.
	 */
	target: HTMLElement | SVGElement | undefined = undefined;

	// These arrays use immutable updates (reassignment, not mutation) - readers can depend
	// on snapshot identity, and `ContextmenuItemsState` documents the publication contract.
	readonly root_menu: RootMenuState = new RootMenuState();
	selections: ReadonlyArray<ItemState> = $state.raw([]);

	can_collapse = $derived(this.selections.length > 1);

	can_expand = $derived.by(() => {
		const selected = this.selections.at(-1);
		return !!selected?.is_menu && selected.items.length > 0;
	});

	/**
	 * Whether `select_next` and `select_previous` can move the selection -
	 * the selected menu has more than one item.
	 */
	can_select_sibling = $derived.by(() => {
		const menu = this.selections.at(-1)?.menu ?? this.root_menu;
		return menu.items.length > 1;
	});

	can_activate = $derived.by(() => {
		const selected = this.selections.at(-1);
		if (!selected) return false;
		// the selected item can unregister out from under the selection
		// (e.g. its component unmounted) - its action must not run
		if (!selected.menu.items.includes(selected)) return false;
		if (selected.is_menu) return selected.items.length > 0;
		return !selected.disabled();
	});

	constructor(options: ContextmenuStateOptions = EMPTY_OBJECT) {
		const { layout } = options;

		this.has_custom_layout = !!layout;
		this.layout = layout ?? new Dimensions();
	}

	open(
		params: Array<ContextmenuParams>,
		x: number,
		y: number,
		target?: HTMLElement | SVGElement
	): void {
		this.#clear_selections();
		this.opened = true;
		this.error = undefined;
		this.x = x;
		this.y = y;
		this.params = params;
		this.target = target;
	}

	close(): void {
		if (!this.opened) return;
		this.reset_items(this.root_menu.items);
		this.#clear_selections();
		this.opened = false;
		this.target = undefined;
	}

	/**
	 * Deselects every selected item and empties `selections`. Items can outlive
	 * a selection (e.g. surviving a reopen-while-open), so clearing the array
	 * without deselecting would leave ghost highlights.
	 */
	#clear_selections(): void {
		if (!this.selections.length) return;
		for (const s of this.selections) s.selected = false;
		this.selections = [];
	}

	reset_items(items: ReadonlyArray<ItemState>): void {
		for (const item of items) {
			if (item.is_menu) {
				this.reset_items(item.items);
			} else {
				item.promise = null;
				item.pending = false;
				item.error_message = null;
			}
		}
	}

	/**
	 * Sets the error state for a failed activation.
	 * `error_message` falls back to `'unknown error'` so the entry always displays something,
	 * while `error` keeps the raw message so external consumers can detect its absence.
	 */
	#handle_error(item: EntryState, message: string | undefined): void {
		item.error_message = message ?? 'unknown error';
		this.error = message;
	}

	/**
	 * Applies an activation result, returning `false` when it failed.
	 */
	#handle_result(item: EntryState, result: ContextmenuActivateResult): boolean {
		if (typeof result?.ok === 'boolean') {
			if (result.ok) {
				if (result.close !== false) {
					this.close();
				}
			} else {
				this.#handle_error(item, to_error_message(result));
				return false;
			}
		} else {
			// void or undefined - default behavior is to close
			this.close();
		}
		return true;
	}

	/**
	 * Activates `item` - expanding submenus, running entries.
	 *
	 * @returns for async runs, the activation promise; for sync runs, `false` when the
	 * activation didn't run (disabled) or failed (a throw or `{ok: false}`), else `true`
	 */
	activate(item: ItemState): boolean | Promise<ContextmenuActivateResult> {
		if (item.is_menu) {
			// select before expanding - `expand_selected` operates on the selection
			// tail, and callers aren't required to have selected (hovered) `item` first
			this.select(item);
			this.expand_selected();
			return true;
		}
		if (item.disabled()) return false;
		let returned;
		try {
			returned = item.run()();
		} catch (error) {
			// keep the menu open so the entry displays the error, matching the async failure path
			this.#handle_error(item, to_error_message(error));
			return false;
		}
		if (is_promise(returned)) {
			item.pending = true;
			item.error_message = null;
			const promise = (item.promise = returned
				.then(
					(result) => {
						if (promise !== item.promise) return;
						this.#handle_result(item, result);
						return result;
					},
					(err) => {
						if (promise !== item.promise) return;
						this.#handle_error(item, to_error_message(err));
					}
				)
				.finally(() => {
					if (promise !== item.promise) return;
					item.pending = false;
					item.promise = null;
				}));
			return item.promise; // async path
		}
		// synchronous path
		return this.#handle_result(item, returned);
	}

	/**
	 * Activates the selected item, or if none is selected, selects the first.
	 * Returns `false` without activating when the selected item has unregistered
	 * out from under the selection (e.g. its component unmounted).
	 */
	activate_selected(): void | boolean | Promise<ContextmenuActivateResult> {
		const selected = this.selections.at(-1);
		if (selected) {
			if (!selected.menu.items.includes(selected)) return false;
			return this.activate(selected);
		}
		this.select_first();
	}

	// Instead of diffing, this does the simple thing and
	// deselects everything and then re-creates the list of selections.
	// Could be improved but it's fine because we're using mutation and the N is very small,
	// and it allows us to have a single code path for the various selection methods.
	/**
	 * Selects `item` and its ancestor menus, deselecting everything else.
	 */
	// TODO implement focus management per APG: call .focus() on the selected item's DOM element (requires storing element refs in EntryState/SubmenuState)
	select(item: ItemState): void {
		if (this.selections.at(-1) === item) return;
		for (const s of this.selections) s.selected = false;
		const new_selections: Array<ItemState> = [];
		let i: ItemState | RootMenuState = item;
		do {
			i.selected = true;
			new_selections.unshift(i);
		} while ((i = i.menu) && i.menu);
		this.selections = new_selections;
	}

	collapse_selected(): void {
		if (!this.can_collapse) return;
		const deselected = this.selections.at(-1)!;
		deselected.selected = false;
		this.selections = this.selections.slice(0, -1);
	}

	expand_selected(): void {
		if (!this.can_expand) return;
		const parent = this.selections.at(-1);
		if (!parent?.is_menu || !parent.items.length) return;
		const selected = parent.items[0]!;
		selected.selected = true;
		this.selections = [...this.selections, selected];
	}

	select_next(): void {
		if (!this.selections.length) {
			this.select_first();
			return;
		}
		const item = this.selections.at(-1)!;
		const index = item.menu.items.indexOf(item);
		if (index === -1) {
			// the selected item unregistered out from under the selection - restart
			this.select_first();
			return;
		}
		this.select(item.menu.items[index === item.menu.items.length - 1 ? 0 : index + 1]!);
	}

	select_previous(): void {
		if (!this.selections.length) {
			this.select_last();
			return;
		}
		const item = this.selections.at(-1)!;
		const index = item.menu.items.indexOf(item);
		if (index === -1) {
			// the selected item unregistered out from under the selection - restart
			this.select_last();
			return;
		}
		this.select(item.menu.items[index === 0 ? item.menu.items.length - 1 : index - 1]!);
	}

	select_first(): void {
		const menu = this.selections.at(-1)?.menu ?? this.root_menu;
		if (!menu.items.length) return;
		this.select(menu.items[0]!);
	}

	select_last(): void {
		const { items } = this.selections.at(-1)?.menu ?? this.root_menu;
		if (!items.length) return;
		this.select(items.at(-1)!);
	}

	/**
	 * Used by `ContextmenuEntry.svelte` and custom entry components.
	 * @initializes
	 */
	add_entry(run: () => ContextmenuRun, disabled: () => boolean = () => false): EntryState {
		const menu = contextmenu_submenu_context.get_maybe() ?? this.root_menu;
		const entry = new EntryState(menu, run, disabled);
		menu.add_item(entry);
		onDestroy(() => {
			menu.remove_item(entry);
		});
		return entry;
	}

	/**
	 * @initializes
	 */
	add_submenu(): SubmenuState {
		const menu = contextmenu_submenu_context.get_maybe() ?? this.root_menu;
		const submenu = new SubmenuState(menu, menu.depth + 1);
		menu.add_item(submenu);
		contextmenu_submenu_context.set(submenu);
		onDestroy(() => {
			menu.remove_item(submenu);
		});
		return submenu;
	}
}

// The dataset attribute is only a crawl marker for `contextmenu_query_params` -
// the params themselves live in `contextmenu_params_by_element`, keyed by element.
// The dataset key must not have capital letters or dashes or it'll differ between JS and DOM:
// https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/dataset
const CONTEXTMENU_DATASET_KEY = 'contextmenu';
const CONTEXTMENU_DOM_QUERY = `a,[data-${CONTEXTMENU_DATASET_KEY}]`;
const contextmenu_params_by_element: WeakMap<
	Element,
	ContextmenuParams | Array<ContextmenuParams>
> = new WeakMap();

/**
 * Creates an attachment that sets up contextmenu behavior on an element.
 * @param params - contextmenu parameters or nullish to disable
 */
export const contextmenu_attachment =
	(
		params: ContextmenuParams | Array<ContextmenuParams> | null | undefined
	): Attachment<HTMLElement | SVGElement> =>
	(el): undefined | (() => void) => {
		if (params == null) return;

		el.dataset[CONTEXTMENU_DATASET_KEY] = '';
		contextmenu_params_by_element.set(el, params);

		return () => {
			contextmenu_params_by_element.delete(el);
			delete el.dataset[CONTEXTMENU_DATASET_KEY]; // eslint-disable-line @typescript-eslint/no-dynamic-delete
		};
	};

const CONTEXTMENU_OPEN_VIBRATE_DURATION = 17;

export interface ContextmenuOpenOptions {
	link_enabled?: boolean;
	text_enabled?: boolean;
	separator_enabled?: boolean;
	vibrate?: boolean;
}

/**
 * Opens the contextmenu, if appropriate,
 * querying the menu items from the DOM starting at the event target.
 * @param target - the leaf element from which to open the contextmenu
 * @param x - the client (viewport) X coordinate at which to open the contextmenu, typically the mouse `clientX` - the menu positions with `fixed`
 * @param y - the client (viewport) Y coordinate at which to open the contextmenu, typically the mouse `clientY` - the menu positions with `fixed`
 * @param contextmenu - the contextmenu state
 * @param options - optional configuration for filtering entries and haptic feedback
 * @returns a boolean indicating if the menu was opened or not
 */
export const contextmenu_open = (
	target: HTMLElement | SVGElement,
	x: number,
	y: number,
	contextmenu: ContextmenuState,
	options?: ContextmenuOpenOptions
): boolean => {
	const {
		link_enabled = true,
		text_enabled = true,
		separator_enabled = true,
		vibrate = true
	} = options ?? EMPTY_OBJECT;

	const params = contextmenu_query_params(target)?.filter(
		(p) =>
			typeof p === 'function' ||
			((p.snippet !== 'link' || link_enabled) &&
				(p.snippet !== 'text' || text_enabled) &&
				(p.snippet !== 'separator' || separator_enabled))
	);

	// No-op if empty
	if (!params?.length) return false;

	contextmenu.open(params, x, y, target);

	// `navigator.vibrate()` works with `ContextmenuRoot` but gets blocked by some browsers
	// when used with `ContextmenuRootForSafariCompatibility` because its longpress
	// workaround triggers from a timeout rather than a direct user interaction.

	if (BROWSER && vibrate && navigator.vibrate) {
		navigator.vibrate(CONTEXTMENU_OPEN_VIBRATE_DURATION);
	}

	return true;
};

const contextmenu_query_params = (
	target: HTMLElement | SVGElement
): null | Array<ContextmenuParams> => {
	let params: null | Array<ContextmenuParams> = null;
	// crawl DOM for contextmenu entries
	let el: HTMLElement | SVGElement | null | undefined = target;
	while ((el = el?.closest(CONTEXTMENU_DOM_QUERY))) {
		// Params may be missing when the element matched as a bare `<a>`, or when a
		// stale marker was left behind - treat the element as having no registered entries.
		const registered = contextmenu_params_by_element.get(el);
		if (registered !== undefined) {
			// preserve bubbling order
			if (Array.isArray(registered)) {
				(params ??= []).push(...registered);
			} else {
				(params ??= []).push(registered);
			}
		}
		if (el.tagName === 'A') {
			(params ??= []).push({
				snippet: 'link',
				// anchor elements have the full url, but we want the slash-prefixed/absolute/root-relative version
				props: { href: url_to_root_relative((el as HTMLAnchorElement).href) }
			});
		}
		el = el.parentElement;
	}
	// add "copy text" entry if anything is selected and we have any other entries
	if (params) {
		const text = window.getSelection()?.toString();
		if (text) {
			params.unshift({
				snippet: 'text',
				props: {
					content: 'copy text',
					icon: icon_copy,
					run: async () => {
						await navigator.clipboard.writeText(text);
					}
				}
			});
		}
	}
	return params;
};

// Global registry of non-scoped contextmenu roots (only used in DEV)
const non_scoped_roots: Set<symbol> = new Set();

/**
 * Registers a contextmenu root and warns if multiple non-scoped roots are detected.
 * Only active in development mode - `DEV` is a build-time constant, so production
 * bundles eliminate the check. Automatically handles cleanup on unmount.
 *
 * @param get_scoped - getter function that returns the current scoped value
 */
export const contextmenu_check_global_root = (get_scoped: () => boolean): void => {
	if (!DEV) return;
	$effect(() => {
		const id = Symbol('contextmenu_root');

		if (!get_scoped()) {
			// Register as global (non-scoped)
			non_scoped_roots.add(id);

			if (non_scoped_roots.size > 1) {
				// eslint-disable-next-line no-console
				console.error(
					`Detected multiple non-scoped contextmenu roots (${non_scoped_roots.size} mounted). ` +
						'Only one global contextmenu root should be active at a time. ' +
						'Are you missing a `scoped` attribute?'
				);
			}
		}

		// Cleanup: unregister when scoped changes or component unmounts
		return () => {
			non_scoped_roots.delete(id);
		};
	});
};
