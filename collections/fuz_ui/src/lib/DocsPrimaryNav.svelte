<script lang="ts">
	import { is_iframed } from '@fuzdev/fuz_util/dom.ts';
	import type { Snippet } from 'svelte';
	import { scrollY } from 'svelte/reactivity/window';
	import type { SvelteHTMLElements } from 'svelte/elements';

	import Breadcrumb from './Breadcrumb.svelte';

	const {
		children,
		...rest
	}: SvelteHTMLElements['div'] & {
		children?: Snippet;
	} = $props();

	const iframed = is_iframed();
	const enabled = !iframed;

	const scrolled = $derived(scrollY.current && scrollY.current > 0);
</script>

{#if enabled}
	<div {...rest} class={['docs-primary-nav', rest.class, { scrolled }]}>
		<div class="background" aria-hidden="true"></div>
		<div class="content">
			<nav aria-label="Primary nav">
				<Breadcrumb />
			</nav>
			{@render children?.()}
		</div>
	</div>
{/if}

<style>
	.docs-primary-nav {
		position: sticky;
		top: 0;
		z-index: 10;
		background-color: var(--shade_00);
		height: var(--docs_primary_nav_height);
		transition: box-shadow var(--duration_2);
		box-shadow: none;
	}

	.scrolled {
		box-shadow: var(--shadow_bottom_xs)
			color-mix(
				in hsl,
				var(--shadow_color, var(--shadow_color_umbra)) var(--shadow_alpha_30),
				transparent
			);
	}

	.background {
		position: absolute;
		z-index: -1;
		width: 100%;
		height: 100%;
		background-color: var(--shade_10);
	}

	.content {
		max-width: 1300px;
		height: 100%;
		margin: 0 auto;
		display: flex;
	}

	nav {
		--font_size: var(--font_size_xl);
		height: 100%;
		display: flex;
		flex: 1;
		padding-left: var(--space_md);
	}

	/* sync this breakpoint with `Docs` */
	@media (max-width: 800px) {
		nav {
			--font_size: var(--font_size_lg);
		}
	}
	@media (max-width: 550px) {
		nav {
			--font_size: var(--font_size_md);
		}
	}
</style>
