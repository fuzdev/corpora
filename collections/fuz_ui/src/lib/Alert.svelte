<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes, SvelteHTMLElements } from 'svelte/elements';

	import { alert_status_options, type AlertStatus } from './alert.ts';

	/**
	 * @see {@link https://www.w3.org/WAI/ARIA/apg/patterns/alert/}
	 *
	 * @module
	 */

	// TODO think through Alert+Card APIs together, one can be a button and the other a link atm

	const {
		status = 'inform',
		color,
		onclick,
		disabled,
		icon,
		button_attrs,
		div_attrs,
		children,
		...rest
	}: // generic element attrs, the common denominator of the rendered roots;
		// branch-specific attributes go in `button_attrs` and `div_attrs`
		HTMLAttributes<HTMLElement> & {
			status?: AlertStatus;
			color?: string;
			// TODO maybe an explicit `AlertButton` is better,
			// or rethink the design because `role="alert"` can't be put on buttons -
			// `disabled` and `button_attrs` only make sense when `onclick` is defined
			/** Renders the alert as a `<button>` when provided. */
			onclick?: (() => void) | undefined;
			disabled?: boolean;
			/**
			 * A decorative icon, hidden from assistive tech: a string, or a snippet given the
			 * status's icon. Defaults to the status's icon, and `null` or an empty string is none.
			 */
			icon?: string | Snippet<[icon: string]> | null | undefined;
			/** Button attributes, applied only when `onclick` renders the alert as a `<button>`. */
			button_attrs?: SvelteHTMLElements['button'];
			/** Div attributes, applied only when the alert renders as a `<div>` (no `onclick`). */
			div_attrs?: SvelteHTMLElements['div'];
			children: Snippet;
		} = $props();

	const options = $derived(alert_status_options[status]);
	// TODO change this to use the hue and put transparency on the borders, or add a borderColor option
	const { color: status_color, icon: status_icon } = $derived(options);
	const final_color = $derived(color ?? status_color);
	const final_icon = $derived(typeof icon === 'string' ? icon : status_icon);
</script>

{#if onclick}
	<button
		type="button"
		{...rest}
		{...button_attrs}
		class="alert {rest.class} {button_attrs?.class}"
		style:--text_color={final_color}
		{onclick}
		disabled={disabled ?? button_attrs?.disabled}
	>
		{@render alert_content()}
	</button>
{:else}
	<div
		role="alert"
		{...rest}
		{...div_attrs}
		class="alert panel {rest.class} {div_attrs?.class}"
		style:--text_color={final_color}
	>
		{@render alert_content()}
	</div>
{/if}

{#snippet alert_content()}
	<!-- the status's icon by default, or one given, and none for `null` or an empty string -->
	{#if icon === undefined || icon}
		<div class="icon" aria-hidden="true">
			{#if typeof icon === 'function'}
				{@render icon(final_icon)}
			{:else}
				{final_icon}
			{/if}
		</div>
	{/if}
	<div class="content">
		{@render children()}
	</div>
{/snippet}

<style>
	.alert {
		min-height: var(--alert_min_height);
		width: 100%;
		color: var(--text_color);
		font-size: var(--font_size_md);
		border-width: var(--border_width_1);
		border-style: var(--border_style);
		border-color: var(--text_color);
		display: flex;
		justify-content: flex-start; /* override button horizontal centering */
		align-items: center;
		padding: var(--space_xs2) var(--space_lg) var(--space_xs2) var(--space_xs);
		margin-bottom: var(--space_lg);
	}
	.alert:last-child {
		margin-bottom: 0;
	}
	.icon {
		display: flex;
		align-items: center;
		justify-content: center;
		margin-right: var(--space_md);
		font-size: var(--font_size_xl2);
		min-width: var(--font_size_xl2);
		text-align: center;
	}
	.content {
		text-align: left;
		flex: 1;
	}
</style>
