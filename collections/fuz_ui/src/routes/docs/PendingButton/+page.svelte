<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';

	import { tome_get_by_slug } from '$lib/tome.ts';
	import PendingButton from '$lib/PendingButton.svelte';
	import TomeContent from '$lib/TomeContent.svelte';

	const TOME_SLUG = 'PendingButton';
	const tome = tome_get_by_slug(TOME_SLUG);

	let pending_1 = $state.raw(false);
	let pending_2 = $state.raw(true);
</script>

<!-- eslint-disable svelte/no-useless-mustaches -->

<TomeContent {tome}>
	<section>
		<p>Preserves a button's normal width while animating.</p>
		<aside>
			<p>This component may be replaced with an action in the future or otherwise change.</p>
		</aside>
		<!-- TODO make this a generic data-driven helper -->
		<Code lang="ts" content={`import PendingButton from '@fuzdev/fuz_ui/PendingButton.svelte';`} />
		<p>
			<button
				type="button"
				onclick={() => {
					pending_1 = !pending_1;
					pending_2 = !pending_2;
				}}
			>
				toggle the pending status of the buttons below
			</button>
		</p>
		<Code
			content={`<PendingButton
	pending={${pending_1}}
	onclick={() => (pending_1 = !pending_1)}
>
	do something async
</PendingButton>`}
		/>
		<p>
			<PendingButton pending={pending_1} onclick={() => (pending_1 = !pending_1)}>
				do something async
			</PendingButton>
		</p>
		<Code
			content={`<PendingButton
	pending={${pending_2}}
	onclick={() => (pending_2 = !pending_2)}
>
	do another
</PendingButton>`}
		/>
		<PendingButton pending={pending_2} onclick={() => (pending_2 = !pending_2)}>
			do another
		</PendingButton>
	</section>
</TomeContent>
