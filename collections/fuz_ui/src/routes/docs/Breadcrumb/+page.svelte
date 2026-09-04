<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';

	import { tome_get_by_slug } from '$lib/tome.ts';
	import Breadcrumb from '$lib/Breadcrumb.svelte';
	import TomeContent from '$lib/TomeContent.svelte';
	import BreadcrumbExample from './BreadcrumbExample.svelte';
	import TomeSectionHeader from '$lib/TomeSectionHeader.svelte';
	import TomeSection from '$lib/TomeSection.svelte';

	const TOME_SLUG = 'Breadcrumb';
	const tome = tome_get_by_slug(TOME_SLUG);
</script>

<!-- eslint-disable svelte/no-useless-mustaches -->

<TomeContent {tome}>
	<section>
		<!-- TODO make this a generic data-driven helper -->
		<Code lang="ts" content={`import Breadcrumb from '@fuzdev/fuz_ui/Breadcrumb.svelte';`} />
		<Code content={`<Breadcrumb />`} />
		<Breadcrumb />
	</section>
	<TomeSection>
		<TomeSectionHeader text="Default icon from context" />
		<p>
			The root link defaults to the <Code inline content="site_context" /> icon, rendered as an
			<Code inline content="Svg" />. Set the <Code inline content="SiteState" /> once at your app's
			root layout and every <Code inline content="Breadcrumb" /> picks it up. It falls back to the
			<Code inline content="site_context" />
			glyph, then a bullet.
		</p>
		<Code
			lang="ts"
			content={`import {SiteState, site_context} from '@fuzdev/fuz_ui/site.svelte.js';
import {logo_fuz} from '@fuzdev/fuz_ui/logos.js';

site_context.set(new SiteState({icon: logo_fuz, glyph: '🧶'}));`}
		/>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="With custom icon" />
		<Code content={`<Breadcrumb>🏠</Breadcrumb>`} />
		<Breadcrumb>🏠</Breadcrumb>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="With custom separator" />
		<Code
			content={`<Breadcrumb>
	{#snippet separator()}.{/snippet}
</Breadcrumb>`}
		/>
		<Breadcrumb>{#snippet separator()}.{/snippet}</Breadcrumb>
	</TomeSection>
	<TomeSection>
		<TomeSectionHeader text="With custom paths" />
		<BreadcrumbExample selected_path="/a/b" />
	</TomeSection>
</TomeContent>
