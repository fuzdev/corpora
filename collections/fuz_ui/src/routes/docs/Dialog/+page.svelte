<script lang="ts">
	import { slide } from 'svelte/transition';
	import Code from '@fuzdev/fuz_code/Code.svelte';

	import Alert from '$lib/Alert.svelte';
	import TomeContent from '$lib/TomeContent.svelte';
	import TomeSection from '$lib/TomeSection.svelte';
	import TomeSectionHeader from '$lib/TomeSectionHeader.svelte';
	import { tome_get_by_slug } from '$lib/tome.ts';
	import Dialog from '$lib/Dialog.svelte';
	import DialogContent from '$lib/DialogContent.svelte';
	import TomeLink from '$lib/TomeLink.svelte';
	import MdnLink from '$lib/MdnLink.svelte';
	import DeclarationLink from '$lib/DeclarationLink.svelte';
	import { dialog_aligns, type DialogAlign } from '$lib/dialog.ts';
	import { icon_remove } from '$lib/icons.ts';
	import Svg from '$lib/Svg.svelte';

	const TOME_SLUG = 'Dialog';

	const tome = tome_get_by_slug(TOME_SLUG);

	let opened = $state.raw(false);
	let dialog_custom_close_opened = $state.raw(false);
	let dialog_overflowing_opened = $state.raw(false);
	let dialog_align_top_opened = $state.raw(false);
	let dialog_nested_1_opened = $state.raw(false);
	let dialog_nested_2_opened = $state.raw(false);
	let dialog_nested_3_opened = $state.raw(false);
	let dialog_no_dismiss_opened = $state.raw(false);
	let dialog_guarded_opened = $state.raw(false);
	let dirty = $state.raw(true);

	let selected_align: DialogAlign = $state.raw('top');

	let items: Array<object> = $state.raw([]);
	const remove_item = (item: object) => {
		items = items.filter((i) => i !== item);
	};
	const add_item = () => {
		items = items.concat({});
	};
	const reset_items = () => {
		items = [];
	};

	// docs demo for `onbeforeclose`; `confirm` is fine here to illustrate the veto
	// eslint-disable-next-line no-alert
	const guard_unsaved = () => !dirty || confirm('Discard unsaved changes?');
</script>

{#snippet custom_close_button_example()}
	<Code
		content={`<Dialog show={opened} onclose={() => (opened = false)}>
	<DialogContent>
		{#snippet close_button(attrs)}
			<button {...attrs} class="xs plain">close</button>
		{/snippet}
		<Code content="..." />
	</DialogContent>
</Dialog>`}
	/>
{/snippet}

<TomeContent {tome}>
	<section>
		<p>
			A <DeclarationLink name="Dialog" /> is a modal that overlays the entire page. It uses the
			native
			<MdnLink path="Web/HTML/Element/dialog" /> element, so opening it with
			<MdnLink path="Web/API/HTMLDialogElement/showModal">showModal()</MdnLink>
			puts children in the browser's top layer, escaping ancestor stacking (avoiding bugs and
			caveats, like unwanted overflow containment and cascading styles, without using
			<TomeLink slug="Teleport" />). The native element also traps focus, makes the rest of the page
			inert, closes on
			<kbd>Escape</kbd>, and restores focus to the previously focused element on close.
		</p>
	</section>
	<TomeSection>
		<TomeSectionHeader text="Basic usage" />
		<p>
			Mounting the component opens the dialog, so the simplest usage guards it with
			<code>{'{#if}'}</code>. Wrap the content in an optional
			<DeclarationLink name="DialogContent" /> for a padded, centered <code>.pane</code> card with a
			close button:
		</p>
		<button type="button" class="mb_lg" onclick={() => (opened = true)}>open a dialog</button>
		<Code
			content={`<button onclick={() => (opened = true)}>
	open a dialog
</button>
{#if opened}
	<Dialog onclose={() => (opened = false)}>
		<DialogContent>
			{#snippet children({close})}
				<h1>attention</h1>
				<p>this is a dialog</p>
				<button onclick={close}>ok</button>
			{/snippet}
		</DialogContent>
	</Dialog>
{/if}`}
		/>
		<p>
			The <code>{'{#if}'}</code> guard isn't required. Pass <code>show</code> to let the component
			manage its own rendering (it defaults to <code>true</code>):
		</p>
		<Code
			content={`<Dialog show={opened} onclose={() => (opened = false)}>
	<DialogContent>
		{#snippet children({close})}
			<button onclick={close}>ok</button>
		{/snippet}
	</DialogContent>
</Dialog>`}
		/>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="DialogContent" />
		<p>
			<DeclarationLink name="DialogContent" /> is a <code>.pane</code> card that shrinks to fit its
			content, up to <code>max_width</code>. Tune it with <code>class</code> and other forwarded
			attributes, adjust the surrounding space with <code>gutter</code> and the inner space with
			<code>padding</code>, and toggle the card style with <code>pane={'{false}'}</code> for an
			unstyled surface:
		</p>
		<Code
			content={`<Dialog show={opened} onclose={() => (opened = false)}>
	<!-- the defaults: -->
	<DialogContent
		class={undefined}
		padding="var(--space_xl)"
		gutter="var(--space_xl3)"
		max_width="var(--distance_md)"
		pane={true}
		close_button={true}
	>
		{#snippet children({close})}
			<button onclick={close}>ok</button>
		{/snippet}
	</DialogContent>
</Dialog>`}
		/>
		<p>
			<DeclarationLink name="DialogContent" /> adds a close button in the top-right corner, rendered
			after the content so it doesn't take initial focus. Pass
			<code>close_button={'{false}'}</code> to remove it, or a snippet to render your own. The
			snippet receives <code>attrs</code> with type
			<DeclarationLink name="DialogCloseButtonAttrs" /> with the default button's placement,
			styling, a11y, and the <code>onclick</code> that closes the dialog, plus the
			<DeclarationLink name="DialogContext" />. Spread
			<code>attrs</code>
			to inherit the corner-anchored button and override only the glyph, or ignore it to place the
			button freely:
		</p>
		<button type="button" class="mb_lg" onclick={() => (dialog_custom_close_opened = true)}>
			open a dialog with a custom close button
		</button>
		{@render custom_close_button_example()}
		<p>
			<DeclarationLink name="DialogContent" /> is optional. Pass children directly for full control
			of the surface:
		</p>
		<Code
			content={`{#if opened}
	<Dialog onclose={() => (opened = false)}>
		freestyle
	</Dialog>
{/if}`}
		/>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="Alignment" />
		<p>
			By default the dialog is centered. Pass <code>align="top"</code> to anchor it near the top of
			the page and grow downward, which avoids the jumpiness of a centered dialog whose content
			changes height. Add and remove items in the demo to compare:
		</p>
		<button type="button" class="mb_lg" onclick={() => (dialog_align_top_opened = true)}>
			open a top-aligned dialog
		</button>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="Overflow" />
		<p>Tall content scrolls within the dialog rather than the page behind it:</p>
		<button type="button" class="mb_lg" onclick={() => (dialog_overflowing_opened = true)}>
			open a dialog that overflows vertically
		</button>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="Dismissing" />
		<p>
			Clicking outside the content closes the dialog by default. Pass
			<code>dismissable={'{false}'}</code> to disable click-outside (<kbd>Escape</kbd> and your own
			buttons still close it):
		</p>
		<button type="button" class="mb_lg" onclick={() => (dialog_no_dismiss_opened = true)}>
			open a non-dismissable dialog
		</button>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="Guarding close" />
		<p>
			To intercept closing, pass <code>onbeforeclose</code> and return <code>false</code> to keep
			the dialog open, which is useful for confirming unsaved changes. Closing programmatically via
			<code>show={'{false}'}</code>
			bypasses it:
		</p>
		<button
			type="button"
			class="mb_lg"
			onclick={() => ((dirty = true), (dialog_guarded_opened = true))}
		>
			open a guarded dialog
		</button>
		<Code
			content={`<Dialog
	show={opened}
	onbeforeclose={() => !dirty || confirm('Discard unsaved changes?')}
	onclose={() => (opened = false)}
>
	<DialogContent>
		{#snippet children({close})}
			<button onclick={close}>close</button>
		{/snippet}
	</DialogContent>
</Dialog>`}
		/>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="Nested dialogs" />
		<p>
			Dialogs can open more dialogs, each stacking in the top layer. The deepest level in this demo
			renders its own multi-pane surface via the bare-children path:
		</p>
		<button type="button" class="mb_lg" onclick={() => (dialog_nested_1_opened = true)}>
			open nested dialogs
		</button>
	</TomeSection>
</TomeContent>
{#if opened}
	<Dialog onclose={() => (opened = false)}>
		<DialogContent>
			{#snippet children({ close })}
				<h1>attention</h1>
				<p>this is a dialog</p>
				<button type="button" onclick={close}>ok</button>
			{/snippet}
		</DialogContent>
	</Dialog>
{/if}
{#if dialog_custom_close_opened}
	<Dialog onclose={() => (dialog_custom_close_opened = false)}>
		<DialogContent>
			{#snippet close_button(attrs)}
				<button {...attrs} class="xs plain">close</button>
			{/snippet}
			<p class="mt_lg">
				The close button in the top-right is custom: it spreads <code>attrs</code> to extend the
				default behavior.
			</p>
			{@render custom_close_button_example()}
		</DialogContent>
	</Dialog>
{/if}
{#if dialog_overflowing_opened}
	<Dialog onclose={() => (dialog_overflowing_opened = false)}>
		<DialogContent>
			{#snippet children({ close })}
				<!-- the close button no longer takes initial focus, so focus a top element to
				open the overflowing dialog scrolled to the top -->
				<!-- svelte-ignore a11y_autofocus -->
				<h1 tabindex="-1" autofocus>attention</h1>
				{#each { length: 120 } as _, i (i)}
					<p>this is a dialog that overflows vertically</p>
				{/each}
				<button type="button" onclick={close}>close</button>
			{/snippet}
		</DialogContent>
	</Dialog>
{/if}
{#if dialog_align_top_opened}
	<Dialog onclose={() => ((dialog_align_top_opened = false), reset_items())} align={selected_align}>
		<DialogContent>
			{#snippet children({ close })}
				{#if selected_align === 'top'}
					<p>
						This is a <DeclarationLink name="Dialog" /> with
						<code>
							align="<select class="ml_0" bind:value={selected_align}>
								{#each dialog_aligns as align (align)}
									<option value={align}>{align}</option>
								{/each}
							</select>"
						</code>.
					</p>
					<p>
						Instead of being centered by default, the dialog's contents are aligned to the top of
						the page and grow downward. It's useful when the dialog's contents change in height.
					</p>
				{:else if selected_align === 'center'}
					<p>
						This is a <DeclarationLink name="Dialog" /> with
						<code>
							align="<select class="ml_0" bind:value={selected_align}>
								{#each dialog_aligns as align (align)}
									<option value={align}>{align}</option>
								{/each}
							</select>"
						</code>, the default value.
					</p>
					<p>
						It's often the best choice, but it can be undesirable in some situations, like when the
						height of the content changes as the user does things, leading to a janky experience.
					</p>
				{:else}
					<Alert status="error">eek a bug! unknown align "{selected_align}"</Alert>
				{/if}
				<p>
					<button type="button" onclick={() => add_item()}>add item</button>
					<button type="button" disabled={!items.length} onclick={() => reset_items()}>
						remove all
					</button>
				</p>
				{#each items as item (item)}
					<p transition:slide>
						<button type="button" onclick={() => remove_item(item)}>
							<Svg data={icon_remove} />
						</button>
						new stuff appears {#if selected_align === 'top'}
							gracefully
						{:else if selected_align === 'center'}
							ungracefully
						{/if}
					</p>
				{/each}
				<button type="button" onclick={close}>close</button>
			{/snippet}
		</DialogContent>
	</Dialog>
{/if}
{#if dialog_nested_1_opened}
	<Dialog onclose={() => (dialog_nested_1_opened = false)}>
		<DialogContent>
			<h1>dialog 1</h1>
			<p>dialogs can open more dialogs</p>
			<button type="button" onclick={() => (dialog_nested_2_opened = true)}>
				open another dialog
			</button>
		</DialogContent>
	</Dialog>
{/if}
{#if dialog_nested_2_opened}
	<Dialog onclose={() => (dialog_nested_2_opened = false)}>
		<DialogContent>
			<h1>dialog 2</h1>
			<p>this dialog can open more dialogs</p>
			<p>this is the second dialog</p>
			<button type="button" onclick={() => (dialog_nested_3_opened = true)}>
				open another dialog
			</button>
		</DialogContent>
	</Dialog>
{/if}
{#if dialog_no_dismiss_opened}
	<Dialog onclose={() => (dialog_no_dismiss_opened = false)} dismissable={false}>
		<DialogContent>
			{#snippet children({ close })}
				<h1>no click-outside</h1>
				<p>
					This dialog passes <code>dismissable={'{false}'}</code>, so clicking outside the content
					does nothing. <kbd>Escape</kbd> and the button still close it.
				</p>
				<button type="button" onclick={close}>close</button>
			{/snippet}
		</DialogContent>
	</Dialog>
{/if}
{#if dialog_guarded_opened}
	<Dialog onbeforeclose={guard_unsaved} onclose={() => (dialog_guarded_opened = false)}>
		<DialogContent>
			{#snippet children({ close })}
				<h1>unsaved changes</h1>
				<p>
					This dialog passes <code>onbeforeclose</code>. While "unsaved changes" is checked, closing
					via <kbd>Escape</kbd>, click-outside, or the buttons asks for confirmation first.
				</p>
				<label class="row gap_sm">
					<input type="checkbox" bind:checked={dirty} />
					unsaved changes
				</label>
				<button type="button" onclick={close}>close</button>
			{/snippet}
		</DialogContent>
	</Dialog>
{/if}
{#if dialog_nested_3_opened}
	<!-- the bare-children path (no DialogContent): render your own surface, here multiple panes -->
	<Dialog onclose={() => (dialog_nested_3_opened = false)}>
		<div class="box gap_xl3 p_xl3">
			<div class="pane p_xl">
				<h1>3 dialogs!</h1>
				<button type="button" onclick={() => (dialog_nested_3_opened = false)}>close dialog</button>
			</div>
			<div class="pane p_xl">
				<h1>and another <code>.pane</code></h1>
				<button
					type="button"
					onclick={() => {
						dialog_nested_1_opened = dialog_nested_2_opened = dialog_nested_3_opened = false;
					}}
				>
					close all dialogs
				</button>
			</div>
		</div>
	</Dialog>
{/if}
