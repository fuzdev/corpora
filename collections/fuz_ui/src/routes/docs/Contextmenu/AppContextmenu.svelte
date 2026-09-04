<script lang="ts">
	import ContextmenuEntry from '$lib/ContextmenuEntry.svelte';
	import ContextmenuLinkEntry from '$lib/ContextmenuLinkEntry.svelte';
	import ContextmenuSeparator from '$lib/ContextmenuSeparator.svelte';
	import Svg from '$lib/Svg.svelte';
	import { logo_github } from '$lib/logos.ts';
	import { icon_info } from '$lib/icons.ts';

	const {
		toggle_about_dialog
	}: {
		toggle_about_dialog: () => void;
	} = $props();
</script>

<ContextmenuLinkEntry href="https://github.com/fuzdev/fuz_ui">
	{#snippet icon()}<Svg data={logo_github} size="var(--icon_size_xs)" />{/snippet}
	Source code
</ContextmenuLinkEntry>
<ContextmenuSeparator />
<ContextmenuEntry run={toggle_about_dialog}>
	{#snippet icon()}<Svg data={icon_info} size="var(--icon_size_xs)" />{/snippet}
	About
</ContextmenuEntry>
