<script lang="ts" generics="T">
	import { swallow } from '@fuzdev/fuz_util/dom.ts';
	import type { Snippet } from 'svelte';
	import type { SvelteHTMLElements } from 'svelte/elements';

	/**
	 * A horizontal menu of joined `menuitemradio` buttons with one selected -
	 * the shape `ColorSchemeInput` takes, and any other few-way pick where the
	 * options should sit one glance apart rather than behind a `select`.
	 *
	 * @module
	 */

	let {
		options,
		value = $bindable(),
		onselect,
		label,
		title,
		key = (option: T): unknown => label(option),
		children,
		...rest
	}: SvelteHTMLElements['menu'] & {
		options: Array<T>;
		/** The selected option, compared by identity; bindable. */
		value: T;
		/** Called after a click selects an option. */
		onselect?: (option: T) => void;
		/** The display text of an option - also the default `title` and `key` source. */
		label: (option: T) => string;
		/** The button title, defaulting to "select X" / "X is selected" from `label`. */
		title?: (option: T, selected: boolean) => string;
		/** Keys the options list; defaults to the label. */
		key?: (option: T) => unknown;
		/** Custom button content in place of the label text. */
		children?: Snippet<[option: T, selected: boolean]>;
	} = $props();

	const title_of = (option: T, selected: boolean): string =>
		title
			? title(option, selected)
			: selected
				? `${label(option)} is selected`
				: `select ${label(option)}`;
</script>

<menu {...rest} class={['radio-menu unstyled', rest.class]}>
	{#each options as option (key(option))}
		{@const selected = option === value}
		<button
			type="button"
			class={['radio-menu-item palette_a', { selected }]}
			role="menuitemradio"
			title={title_of(option, selected)}
			aria-checked={selected}
			onclick={(e) => {
				swallow(e);
				value = option;
				onselect?.(option);
			}}
		>
			<div class="content">
				{#if children}
					{@render children(option, selected)}
				{:else}
					{label(option)}
				{/if}
			</div>
		</button>
	{/each}
</menu>

<style>
	.radio-menu {
		display: flex;
		flex-direction: row;
		justify-content: center;
	}
	.content {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 var(--space_lg);
	}
	.radio-menu-item {
		border-radius: 0;
	}
	.radio-menu-item:first-child {
		border-top-left-radius: var(--border_radius, var(--border_radius_md));
		border-bottom-left-radius: var(--border_radius, var(--border_radius_md));
	}
	.radio-menu-item:last-child {
		border-top-right-radius: var(--border_radius, var(--border_radius_md));
		border-bottom-right-radius: var(--border_radius, var(--border_radius_md));
	}
</style>
