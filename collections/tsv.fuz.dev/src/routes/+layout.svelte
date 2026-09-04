<script lang="ts">
	import 'virtual:fuz.css';
	import '@fuzdev/fuz_code/theme.css';
	import './style.css';

	import ThemeRoot from '@fuzdev/fuz_ui/ThemeRoot.svelte';
	import { SiteState, site_context } from '@fuzdev/fuz_ui/site.svelte.ts';
	import { logo_tsv } from '@fuzdev/fuz_ui/logos.ts';
	import type { Snippet } from 'svelte';
	import pkg_json from 'virtual:pkg.json';

	const {
		children
	}: {
		children: Snippet;
	} = $props();

	// `icon` is the tsv logo (used by `Breadcrumb`), `glyph` derives from `pkg_json`,
	// and `repo_url` points to the tsv tool repo rather than this website's repo
	// (`pkg_json.repository`).
	site_context.set(
		new SiteState({ icon: logo_tsv, pkg_json, repo_url: 'https://github.com/fuzdev/tsv' })
	);
</script>

<svelte:head>
	<title>tsv.fuz.dev</title>
</svelte:head>

<ThemeRoot>
	{@render children()}
</ThemeRoot>
