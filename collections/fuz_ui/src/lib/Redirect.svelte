<script lang="ts">
	import { page } from '$app/state';
	import { strip_start } from '@fuzdev/fuz_util/string.ts';
	import { goto } from '$app/navigation';
	import { onMount, type Snippet } from 'svelte';

	const {
		host = '',
		path = page.url.pathname,
		auto = true,
		children
	}: {
		/**
		 * The target host to redirect to. Defaults to `''` (relative URL).
		 */
		host?: string;
		/**
		 * The target path to redirect to. Defaults to the current `location.pathname`.
		 */
		path?: string;
		/**
		 * Should the redirect happen automatically without user input? Defaults to `true`.
		 */
		auto?: boolean;
		children?: Snippet<[url: string]>;
	} = $props();

	const url = $derived(host + path);

	onMount(() => {
		if (auto) void goto(url, { replaceState: true }); // eslint-disable-line svelte/no-navigation-without-resolve
	});
</script>

<svelte:head>
	{#if auto}<meta http-equiv="refresh" content="0; URL={url}" />{/if}
</svelte:head>

{#if children}
	{@render children(url)}
{:else}
	<p>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		redirect to <a href={url}>{strip_start(url, 'https://')}</a>
	</p>
{/if}
