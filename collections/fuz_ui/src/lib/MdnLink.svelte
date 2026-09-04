<script lang="ts">
	import { ensure_start, strip_end, strip_start } from '@fuzdev/fuz_util/string.ts';
	import type { SvelteHTMLElements } from 'svelte/elements';

	import Svg from './Svg.svelte';
	import { logo_mdn } from './logos.ts';

	const {
		path,
		hash,
		children,
		...rest
	}: SvelteHTMLElements['a'] & {
		path: string;
		/** URL fragment to append, with or without the `#`. */
		hash?: string;
	} = $props();

	const href = $derived(
		(path.startsWith('https://')
			? path
			: `https://developer.mozilla.org/en-US/docs/${strip_start(path, '/')}`) +
			(hash ? ensure_start(hash, '#') : '')
	);

	const final_children = $derived(children ?? strip_end(path, '/').split('/').at(-1)!);
</script>

<!-- TODO -next-line doesnt work? -->
<!-- eslint-disable svelte/no-navigation-without-resolve -->
<a {...rest} {href} class="mdn-link white-space:nowrap {rest.class}" rel="noopener">
	<Svg data={logo_mdn} inline size="var(--icon_size_xs)" class="mx_xs3 vertical-align:middle" />
	{#if typeof final_children === 'string'}
		<span class="font_family_mono">{final_children}</span>
	{:else}
		{@render final_children()}
	{/if}
</a>
