<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';

	import { tome_get_by_slug } from '$lib/tome.ts';
	import Alert from '$lib/Alert.svelte';
	import TomeContent from '$lib/TomeContent.svelte';
	import TomeSection from '$lib/TomeSection.svelte';
	import TomeSectionHeader from '$lib/TomeSectionHeader.svelte';

	const TOME_SLUG = 'Alert';
	const tome = tome_get_by_slug(TOME_SLUG);

	let clicks = $state.raw(0);

	// TODO add examples for colored buttons - visually they're broken because they look like selected buttons
</script>

<!-- eslint-disable svelte/no-useless-mustaches -->

<TomeContent {tome}>
	<section>
		<aside>⚠️ This API is unfinished and will likely change.</aside>
	</section>
	<section>
		<!-- TODO make this a generic data-driven helper -->
		<Code lang="ts" content={`import Alert from '@fuzdev/fuz_ui/Alert.svelte';`} />
		<Code content={`<Alert>info</Alert>`} />
		<Alert>info</Alert>
	</section>
	<TomeSection>
		<TomeSectionHeader text="With custom icon" />
		<p><code>icon</code> can be a string prop or snippet:</p>
		<Code
			content={`<Alert icon="▷">
	icon as a string prop
</Alert>`}
		/>
		<Alert icon="▷">icon as a string prop</Alert>
		<Code
			content={`<Alert>
	{#snippet icon(t)}{t}◡{t}{/snippet}
	icon as a snippet
</Alert>`}
		/>
		<Alert>
			{#snippet icon(t)}{t}◡{t}{/snippet}
			icon as a snippet
		</Alert>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="As optional button" />
		<p>
			Alerts can be buttons by including an <code>onclick</code> prop. This API may change because
			it's a bit of a mess - a separate <code>AlertButton</code> may be better.
		</p>
		<Code
			content={`<Alert onclick={() => clicks++}>
	alerts can be buttons{'.'.repeat(clicks)}
</Alert>`}
		/>
		<Alert onclick={() => clicks++}>
			alerts can be buttons{'.'.repeat(clicks)}
		</Alert>
		<p>clicks: {clicks}</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="With custom status" />
		<p>
			The <code>status</code> prop, which defaults to <code>'inform'</code>, changes the default
			icon and color.
		</p>
		<Code
			content="// @fuzdev/fuz_ui/alert.js
export type AlertStatus = 'inform' | 'help' | 'error';"
			lang="ts"
		/>
		<Code
			content={`<Alert status="error">
	the computer is mistaken
</Alert>`}
		/>
		<Alert status="error">the computer is mistaken</Alert>
		<Code
			content={`<Alert status="help">
	here's how to fix it
</Alert>`}
		/>
		<Alert status="help">here's how to fix it</Alert>
		<Code
			content={`<Alert status="help" color="var(--palette_d_50)">
	the <code>color</code> prop overrides the status color
</Alert>`}
		/>
		<Alert status="help" color="var(--palette_d_50)">
			the <code>color</code> prop overrides the status color
		</Alert>
	</TomeSection>
</TomeContent>
