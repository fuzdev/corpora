<script lang="ts">
	import type { SvelteHTMLElements } from 'svelte/elements';

	import { FUZ_DEV_URL } from './constants.ts';

	const {
		selected,
		...rest
	}: SvelteHTMLElements['ul'] & {
		selected?: 'fuz.dev';
	} = $props();
</script>

<ul {...rest}>
	<li>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a rel="me" href={FUZ_DEV_URL} class={{ selected: selected === 'fuz.dev' }}>fuz.dev</a>
		- the Fuz stack homepage{#if selected === 'fuz.dev'}, you are here{/if}
	</li>
	<li>
		GitHub as <a rel="me" href="https://github.com/fuzdev">@fuzdev</a>
	</li>
	<!-- TODO socials -->
	<!-- <li>
		Mastodon as
		<a rel="me" href="https://fosstodon.org/@fuzdev">@fuzdev@fosstodon.org</a> and Bluesky as
		<a href="https://bsky.app/profile/fuz.dev">@fuz.dev</a>
	</li> -->
</ul>
