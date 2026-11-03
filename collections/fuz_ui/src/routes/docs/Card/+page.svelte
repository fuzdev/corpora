<script lang="ts">
	import { resolve } from '$app/paths';
	import Code from '@fuzdev/fuz_code/Code.svelte';

	import { tome_get_by_slug } from '#lib/tome.ts';
	import Card from '#lib/Card.svelte';
	import { logo_github } from '#lib/logos.ts';
	import Svg from '#lib/Svg.svelte';
	import TomeContent from '#lib/TomeContent.svelte';
	import TomeSectionHeader from '#lib/TomeSectionHeader.svelte';
	import TomeSection from '#lib/TomeSection.svelte';
	import { DOCS_PATH } from '#lib/docs_helpers.svelte.ts';

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
		<TomeSectionHeader text="With an icon" />
		<p>
			A card has no icon unless given one. <code>icon</code> takes a string, like an emoji or a
			glyph:
		</p>
		<Code
			content={`<Card icon="📖">
  with<br />
  icon
</Card>`}
		/>
		<Card icon="📖">
			with<br />
			icon
		</Card>
		<p>or a snippet, for anything else, like an <code>Svg</code>:</p>
		<Code
			content={`<Card>
  with a<br />
  snippet icon
  {#snippet icon()}<Svg data={logo_github} size="var(--icon_size_lg)" />{/snippet}
</Card>`}
		/>
		<Card>
			with a<br />
			snippet icon
			{#snippet icon()}<Svg data={logo_github} size="var(--icon_size_lg)" />{/snippet}
		</Card>
		<p>The icon is decorative, so it is hidden from assistive technology.</p>
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
		<p>
			A link card is marked <code>selected</code> while its <code>href</code> leads to the current
			page, ignoring a trailing slash, the query, and the hash:
		</p>
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
		<p>
			A <code>button</code> card defaults to <code>type="button"</code>, so it doesn't submit a form
			around it; pass <code>type</code> to change that.
		</p>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="With custom alignment" />
		<p>
			<code>align</code> sets the layout: the icon at the inline <code>start</code> (the default) or
			<code>end</code> beside the content, or at the <code>top</code> or <code>bottom</code> above
			or below it. The content aligns away from the icon, toward the end for <code>end</code> and
			centered for <code>top</code> and <code>bottom</code>.
		</p>
		<Code
			content={`<Card align="end" icon="📖">
  icon at<br />
  the end
</Card>`}
		/>
		<Card align="end" icon="📖">
			icon at<br />
			the end
		</Card>
	</TomeSection>
	<section>
		<Code
			content={`<Card align="top" icon="📖">
  icon on top
</Card>`}
		/>
		<Card align="top" icon="📖">icon on top</Card>
	</section>
	<section>
		<Code
			content={`<Card align="bottom" icon="📖">
  icon on the bottom
</Card>`}
		/>
		<Card align="bottom" icon="📖">icon on the bottom</Card>
	</section>
	<TomeSection>
		<TomeSectionHeader text="Sizing" />
		<p>
			A card is as wide as <code>--card_width</code>, or as its container when that is unset. Its
			text is <code>--font_size_xl2</code>, stepping down on narrow screens, and a
			<code>font-size</code> in <code>style</code> overrides it. The icon is
			<code>--icon_size</code> with <code>--icon_margin</code> between it and the content:
		</p>
		<Code
			content={`<Card icon="📖" style="--card_width: 100%; --icon_size: var(--icon_size_md)">
  full width,<br />
  small icon
</Card>`}
		/>
		<Card icon="📖" style="--card_width: 100%; --icon_size: var(--icon_size_md)">
			full width,<br />
			small icon
		</Card>
	</TomeSection>
</TomeContent>
