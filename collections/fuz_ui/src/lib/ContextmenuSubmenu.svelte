<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';
	import { swallow } from '@fuzdev/fuz_util/dom.ts';

	import {
		contextmenu_context,
		contextmenu_dimensions_context
	} from './contextmenu_state.svelte.ts';
	import { contextmenu_calculate_submenu_translate } from './contextmenu_helpers.ts';
	import type { Dimensions } from './dimensions.svelte.ts';
	import type { SvgData } from './svg.ts';
	import ContextmenuIcon from './ContextmenuIcon.svelte';

	const {
		icon,
		menu,
		children
	}: {
		icon?: SvgData | string | Snippet;
		menu: Snippet;
		children: Snippet;
	} = $props();

	const get_contextmenu = contextmenu_context.get();
	const contextmenu = $derived(get_contextmenu());

	// add_submenu registers on the current instance at init — not reactive to contextmenu getter changes
	const submenu = get_contextmenu().add_submenu();

	const { layout } = $derived(contextmenu);

	const { selected } = $derived(submenu);

	let el: HTMLElement | undefined = $state.raw();

	const parent_dimensions = contextmenu_dimensions_context.get();
	const dimensions = contextmenu_dimensions_context.set();

	let translate_x = $state.raw(0);
	let translate_y = $state.raw(0);
	// Measure-and-correct loop: `update_position` reads `translate_x`/`translate_y`
	// (subtracting them from the measured rect to recover the untranslated base position)
	// and writes them back, so the effect re-runs after the transform applies -
	// the second pass measures the same base and writes identical values, settling.
	$effect(() => {
		if (el) update_position(el, layout, parent_dimensions);
	});
	const update_position = (el: HTMLElement, layout: Dimensions, parent_dimensions: Dimensions) => {
		const { x, y, width, height } = el.getBoundingClientRect();
		dimensions.width = width;
		dimensions.height = height;
		const translate = contextmenu_calculate_submenu_translate({
			base_x: x - translate_x,
			base_y: y - translate_y,
			width,
			height,
			parent_width: parent_dimensions.width,
			layout_width: layout.width,
			layout_height: layout.height
		});
		translate_x = translate.x;
		translate_y = translate.y;
	};

	let select_timeout: NodeJS.Timeout | null = null;
	onDestroy(() => {
		if (select_timeout !== null) clearTimeout(select_timeout);
	});
</script>

<li role="none" style:--contextmenu_depth={submenu.depth}>
	<!-- disabling the a11y warning because a parent element handles keyboard events -->
	<div
		class={['menuitem plain selectable', { selected }]}
		role="menuitem"
		aria-haspopup="menu"
		tabindex="-1"
		onmouseenter={(e) => {
			swallow(e);
			// This timeout fixes a bug on mobile where the mouseenter event
			// fires immediately when the contextmenu appears,
			// and then the newly mounted selected entry immediately receives a click event.
			// The timeout ensures the click event is not passed through.
			if (select_timeout !== null) clearTimeout(select_timeout);
			select_timeout = setTimeout(() => {
				select_timeout = null;
				contextmenu.select(submenu);
			});
		}}
		aria-expanded={selected}
	>
		<div class="content">
			<div class="icon">
				<ContextmenuIcon {icon} />
			</div>
			<div class="title">{@render children()}</div>
		</div>
		<div class="chevron" aria-hidden="true"></div>
	</div>
	{#if selected}
		<menu
			bind:this={el}
			class="pane unstyled"
			style:transform="translate3d({translate_x}px, {translate_y}px, 0)"
			style:max-height="{layout.height}px"
		>
			{@render menu()}
		</menu>
	{/if}
</li>

<style>
	li {
		position: relative;
	}
	.chevron {
		padding-left: 5px;
	}
	menu {
		z-index: var(--contextmenu_depth);
		position: absolute;
		/* TODO this is a hack to avoid the pixel gap, probably change to 0 after adding transparent surface hitbox */
		left: -1px;
		top: 0;
		max-width: var(--contextmenu_width);
		width: 100%;
	}
</style>
