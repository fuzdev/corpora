<script lang="ts">
	import { strip_start } from '@fuzdev/fuz_util/string.ts';
	import { swallow } from '@fuzdev/fuz_util/dom.ts';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';

	import { contextmenu_context } from './contextmenu_state.svelte.ts';
	import { icon_external_link, icon_link } from './icons.ts';
	import type { SvgData } from './svg.ts';
	import Svg from './Svg.svelte';
	import ContextmenuIcon from './ContextmenuIcon.svelte';

	const {
		href,
		icon,
		children,
		disabled: disabled_prop = false,
		external_rel = 'noreferrer' // TODO smarter defaults
	}: {
		href: string;
		icon?: SvgData | string | Snippet;
		children?: Snippet; // TODO @many rethink this API
		disabled?: boolean;
		external_rel?: string;
	} = $props();

	const get_contextmenu = contextmenu_context.get();
	const contextmenu = $derived(get_contextmenu());

	let anchor_el: HTMLAnchorElement | undefined = $state.raw();

	// Register with state management for keyboard navigation
	// When activated via keyboard, programmatically click the anchor to trigger navigation
	// add_entry registers on the current instance at init — not reactive to contextmenu getter changes
	const entry = get_contextmenu().add_entry(
		() => () => {
			if (anchor_el) anchor_el.click();
		},
		() => disabled_prop
	);

	// keyboard selection, like `ContextmenuEntry` - distinct from `current_page` below
	const { selected } = $derived(entry);
	const disabled = $derived(entry.disabled());

	// TODO move or upstream?
	const print_url = (url: string, host: string = location.host): string => {
		const formatted = strip_start(strip_start(url, 'https://'), 'http://');
		return formatted.startsWith(host + '/') ? strip_start(formatted, host) : formatted;
	};

	const text = $derived(print_url(href));
	const external = $derived(!(text[0] === '.' || (text[0] === '/' && text[1] !== '/')));
	const rel = $derived(external ? external_rel : undefined);

	const current_page = $derived(page.url.pathname === href);
</script>

<li role="none">
	<!-- `deselectable` is a hack to recover `cursor: pointer` when selected: these links always
	     navigate, but `.menuitem.selected` forces `cursor: default`. The real fix is a `.menuitem`
	     semantics cleanup (selected-as-active vs selected-as-highlight) - TODO @many -->
	<!-- TODO -next-line doesnt work? -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<a
		bind:this={anchor_el}
		class={['menuitem plain', { selected, disabled, deselectable: !disabled }]}
		role="menuitem"
		aria-disabled={disabled}
		aria-current={current_page ? 'page' : undefined}
		tabindex="-1"
		{href}
		{rel}
		onclick={disabled ? undefined : () => contextmenu.close()}
		oncontextmenu={(e) => {
			// Stop propagation to prevent the window handler from opening another Fuz contextmenu.
			// Without this, the event would bubble to the window handler, which calls
			// `contextmenu_query_params` (contextmenu_state.svelte.ts:410), which auto-detects
			// `<a>` tags and reopens the Fuz contextmenu instead of showing the browser's native menu.
			// Allow default behavior to show the browser's native contextmenu for the link.
			e.stopPropagation();
		}}
		onmouseenter={disabled
			? undefined
			: (e) => {
					swallow(e);
					contextmenu.select(entry);
				}}
	>
		<div class="content">
			<div class="icon">
				{#if icon}
					<ContextmenuIcon {icon} />
				{:else}
					<Svg data={external ? icon_external_link : icon_link} />
				{/if}
			</div>
			<div class="title">
				<span class="text">
					{#if children}{@render children()}{:else}{text}{/if}
				</span>
			</div>
		</div>
	</a>
</li>

<style>
	li {
		display: flex;
	}
	/* Underline only the link text, not the icon. */
	a:hover {
		text-decoration: none;
	}
	a:hover .text {
		text-decoration: underline;
	}
	/* Mark the current page distinctly from the keyboard selection highlight. */
	a[aria-current='page'] .text {
		font-weight: 700;
	}
</style>
