<script lang="ts">
	import { resolve } from '$app/paths';
	import Code from '@fuzdev/fuz_code/Code.svelte';

	import { tome_get_by_slug } from '$lib/tome.ts';
	import Card from '$lib/Card.svelte';
	import TomeContent from '$lib/TomeContent.svelte';
	import TomeSectionHeader from '$lib/TomeSectionHeader.svelte';
	import TomeSection from '$lib/TomeSection.svelte';
	import { DOCS_PATH } from '$lib/docs_helpers.svelte.ts';

	const TOME_SLUG = 'Card';
	const tome = tome_get_by_slug(TOME_SLUG);
</script>

<!-- eslint-disable svelte/no-useless-mustaches -->

<TomeContent {tome}>
	<section>
		<aside>⚠️ This API is unfinished and will likely change.</aside>
	</section>
	<section>
		<!-- TODO make this a generic data-driven helper -->
		<Code lang="ts" content={`import Card from '@fuzdev/fuz_ui/Card.svelte';`} />
		<Code
			content={`<Card>
  just<br />
  a card
</Card>`}
		/>
		<Card>
			just<br />
			a card
		</Card>
	</section>
	<TomeSection>
		<TomeSectionHeader text="With a custom icon" />
		<Code
			content={`<Card>
  custom<br />
  icon
  {#snippet icon()}📖{/snippet}
</Card>`}
		/>
		<Card>
			custom<br />
			icon
			{#snippet icon()}📖{/snippet}
		</Card>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="As a link" />
		<Code
			content={`<Card href="${resolve('/')}">
  a<br />
  link
</Card>`}
		/>
		<Card href={resolve('/')}>
			a<br />
			link
		</Card>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="As the selected link" />
		<Code
			content={`<Card href="${DOCS_PATH}/Card">
  href is<br />
  selected
</Card>`}
		/>
		<Card href="{DOCS_PATH}/Card">
			href is<br />
			selected
		</Card>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="With a custom HTML tag" />
		<Code
			content={`<Card tag="button">
  custom<br />
  tag
</Card>`}
		/>
		<Card tag="button">
			custom<br />
			tag
		</Card>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="With custom alignment" />
		<Code
			content={`<Card align="right">
  align<br />
  icon right
</Card>`}
		/>
		<Card align="right">
			align<br />
			icon right
		</Card>
	</TomeSection>
	<section>
		<Code
			content={`<Card align="above">
  align icon above
</Card>`}
		/>
		<Card align="above">align icon above</Card>
	</section>
	<section>
		<Code
			content={`<Card align="below">
  align icon below
</Card>`}
		/>
		<Card align="below">align icon below</Card>
	</section>
</TomeContent>
