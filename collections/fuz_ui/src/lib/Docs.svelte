<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import { innerWidth } from 'svelte/reactivity/window';
	import { page } from '$app/state';

	import Breadcrumb from './Breadcrumb.svelte';
	import { Tome, tomes_context } from './tome.ts';
	import DocsPrimaryNav from './DocsPrimaryNav.svelte';
	import DocsSecondaryNav from './DocsSecondaryNav.svelte';
	import DocsTertiaryNav from './DocsTertiaryNav.svelte';
	import Dialog from './Dialog.svelte';
	import DialogContent from './DialogContent.svelte';
	import DocsFooter from './DocsFooter.svelte';
	import { site_context } from './site.svelte.ts';
	import { FUZ_DEV_URL } from './constants.ts';
	import { DocsLinks, docs_links_context } from './docs_helpers.svelte.ts';

	const {
		tomes,
		children
	}: {
		tomes: Array<Tome>;
		children: Snippet;
	} = $props();

	const site = site_context.get('`Docs` requires `site_context`; set it in your root layout');

	// TODO this API is messy, inconsistent usage of props/context
	const tomes_by_slug = $derived(new Map(tomes.map((t) => [t.slug, t])));
	tomes_context.set(() => tomes_by_slug);

	// TODO @many dialog navs - this is messy to satisfy SSR with the current design that puts the secondary nav in a dialog
	const TERTIARY_NAV_BREAKPOINT = 1000;
	const SECONDARY_NAV_BREAKPOINT = 800;

	const docs_menu_width = '180px';

	let show_secondary_nav_dialog = $state.raw(false);
	const toggle_secondary_nav_dialog = (show?: boolean): void => {
		show_secondary_nav_dialog = show ?? !show_secondary_nav_dialog;
	};

	docs_links_context.set(new DocsLinks());

	onNavigate(() => {
		show_secondary_nav_dialog = false;
	});
</script>

<svelte:window onhashchange={() => (show_secondary_nav_dialog = false)} />

<div class="docs" style:--docs_menu_width={docs_menu_width}>
	<DocsPrimaryNav>
		<div class="nav-dialog-toggle">
			<button class="plain" type="button" onclick={() => toggle_secondary_nav_dialog()}>
				menu
			</button>
		</div>
	</DocsPrimaryNav>
	<!-- TODO @many dialog navs -->
	{#if !innerWidth.current || innerWidth.current > SECONDARY_NAV_BREAKPOINT}
		<div class="secondary-nav-wrapper">
			<DocsSecondaryNav {tomes} />
		</div>
	{/if}
	<main>
		{#key page.url.pathname}
			{@render children()}
		{/key}
		<!-- TODO @many dialog navs -->
		{#if !innerWidth.current || innerWidth.current > TERTIARY_NAV_BREAKPOINT}
			<DocsTertiaryNav {tomes} {tomes_by_slug} />
		{/if}
		<section class="box">
			<DocsFooter repo_url={site.repo_url} root_url={FUZ_DEV_URL}>
				<div class="mb_xl5">
					<Breadcrumb />
				</div>
			</DocsFooter>
		</section>
	</main>
</div>
<!-- TODO @many dialog navs - instead of a dialog, probably use a popover (new component) -->
<!-- TODO this is messy rendering `DocsSecondaryNav` twice to handle responsive states with SSR correctly -->
{#if show_secondary_nav_dialog &&
	innerWidth.current &&
	innerWidth.current <= TERTIARY_NAV_BREAKPOINT
}
	<Dialog onclose={() => (show_secondary_nav_dialog = false)}>
		<DialogContent padding="">
			<div style:--docs_menu_width={docs_menu_width}>
				<div class="p_xl pb_0">
					<Breadcrumb />
				</div>
				<div class="px_lg pb_xl">
					<DocsSecondaryNav {tomes} sidebar={false} />
					<DocsTertiaryNav {tomes} {tomes_by_slug} sidebar={false} />
				</div>
			</div>
		</DialogContent>
	</Dialog>
{/if}

<style>
	.docs {
		--docs_primary_nav_height: 60px;
		--docs_secondary_nav_padding: var(--space_md); /* also used by the tertiary nav */
		--docs_content_padding: var(--space_xl5);
		--docs_content_max_width: calc(var(--distance_md) + var(--docs_content_padding) * 2);
		/* TODO this is broken for scrollbars, so we add `+ 10px` as a messy safeguard (there may be `+ 1px` needed for scaling issues too) */
		--docs_sidebar_width: max(
			calc(var(--docs_menu_width) + 10px + var(--docs_secondary_nav_padding) * 2),
			calc((100% - var(--docs_content_max_width)) / 2)
		);
		display: contents;
	}

	main {
		position: relative;
		min-height: calc(100vh - var(--docs_primary_nav_height));
		width: calc(100% - var(--docs_sidebar_width) * 2);
		max-width: var(--docs_content_max_width);
		padding: var(--docs_content_padding);
		padding-top: 0;
		margin: 0 auto;
		overflow: hidden; /* TODO maybe heavy handed */
	}

	.secondary-nav-wrapper {
		display: contents;
	}

	.nav-dialog-toggle {
		display: none;
	}
	.nav-dialog-toggle button {
		padding-left: var(--space_xl3);
		padding-right: var(--space_xl3);
		border-radius: 0;
	}

	/* sync this breakpoint with `DocsTertiaryNav` and `TomeSectionHeader` */
	@media (max-width: 1000px) {
		main {
			--docs_content_padding: var(--space_xl);
			/* handle the moved `DocsTertiaryNav` */
			width: calc(100% - var(--docs_sidebar_width));
			margin-right: 0;
		}

		.nav-dialog-toggle {
			display: contents;
		}
	}

	/* sync this breakpoint with `DocsPrimaryNav`, `DocsSecondaryNav`, and `TomeSectionHeader` */
	@media (max-width: 800px) {
		main {
			/* handle the moved `DocsSecondaryNav` */
			width: 100%;
			margin-left: 0;
		}

		.secondary-nav-wrapper {
			display: none;
		}
	}

	section {
		padding: var(--space_xl2);
	}
</style>
