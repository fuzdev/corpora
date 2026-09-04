<script lang="ts">
	import type { Snippet } from 'svelte';

	import type { SvgData } from './svg.ts';
	import Svg from './Svg.svelte';

	/**
	 * Renders a contextmenu entry's `icon` value, shared by `ContextmenuEntry`,
	 * `ContextmenuSubmenu`, and `ContextmenuLinkEntry`. Renders nothing when
	 * `icon` is `undefined`.
	 *
	 * @module
	 */

	const {
		icon
	}: {
		icon?: SvgData | string | Snippet;
	} = $props();
</script>

{#if typeof icon === 'string'}
	{icon}
{:else if typeof icon === 'object'}
	<!-- `SvgData` is a plain object; detect it positively by shape rather than
	     introspecting the snippet (whose runtime form is opaque/unsupported). -->
	<Svg data={icon} />
{:else if icon}
	{@render icon()}
{/if}
