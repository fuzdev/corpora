<script lang="ts">
	import 'virtual:fuz.css';
	import '@fuzdev/fuz_code/theme.css';

	import type { Snippet } from 'svelte';

	import ThemeRoot from '$lib/ThemeRoot.svelte';
	import ContextmenuRoot from '$lib/ContextmenuRoot.svelte';
	import Spiders from '$lib/Spiders.svelte';
	import pkg_json from 'virtual:pkg.json';

	import { SiteState, site_context } from '$lib/site.svelte.ts';
	import { logo_fuz_ui } from '$lib/logos.ts';

	const {
		children
	}: {
		children: Snippet;
	} = $props();

	// `glyph` and `repo_url` derive from `pkg_json` (`glyph` + `repository`);
	// `icon` stays explicit since it's a structured `SvgData` logo, not metadata.
	site_context.set(
		new SiteState({
			icon: logo_fuz_ui,
			pkg_json
		})
	);
</script>

<svelte:head>
	<title>Fuz - friendly user zystem</title>
</svelte:head>

<ThemeRoot>
	<ContextmenuRoot>
		{@render children()}
		<Spiders />
	</ContextmenuRoot>
</ThemeRoot>
