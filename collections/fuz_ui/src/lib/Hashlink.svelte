<script lang="ts">
	import type { SvelteHTMLElements } from 'svelte/elements';

	const { fragment, children, ...rest }: SvelteHTMLElements['a'] & { fragment: string } = $props();
</script>

<a aria-label="hashlink" {...rest} class="hashlink {rest.class}" href="#{fragment}">
	{#if children}{@render children()}{:else}#{/if}
</a>
<span class="hashlink-scroll-target" id={fragment} aria-hidden="true"></span>

<style>
	/* TODO @many how can this be done generically so it's composable? currently using `:global` at usage site - ideally we'd continue to use :hover instead of JS */
	/* .some_parent:hover :global(.hashlink) { opacity: 1; } .some_parent { position: relative; } */

	.hashlink {
		font-size: var(--font_size_lg);
		padding: 0 var(--space_sm);
		margin-left: var(--space_sm);
		opacity: 0;
		transition: opacity var(--duration_2);
	}

	.hashlink-scroll-target {
		position: absolute;
		top: calc(var(--font_size, var(--font_size_md)) * -4);
		left: 0;
	}

	/* sync this breakpoint with `Docs` */
	@media (max-width: 800px) {
		.hashlink {
			opacity: 1;
		}
	}
</style>
