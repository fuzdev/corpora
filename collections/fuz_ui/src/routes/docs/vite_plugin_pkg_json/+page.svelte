<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';
	import { pkg_json_keys } from '@fuzdev/fuz_util/pkg_json.ts';

	import { tome_get_by_slug } from '$lib/tome.ts';
	import TomeContent from '$lib/TomeContent.svelte';
	import TomeSection from '$lib/TomeSection.svelte';
	import TomeSectionHeader from '$lib/TomeSectionHeader.svelte';
	import DeclarationLink from '$lib/DeclarationLink.svelte';
	import ModuleLink from '$lib/ModuleLink.svelte';
	import TomeLink from '$lib/TomeLink.svelte';
	import GithubLink from '$lib/GithubLink.svelte';

	const TOME_SLUG = 'vite_plugin_pkg_json';
	const tome = tome_get_by_slug(TOME_SLUG);

	// Supplemental notes for the served keys; the set itself comes from `pkg_json_keys`
	// so the list can't drift from the source. New keys render without a note.
	const key_notes: Partial<Record<(typeof pkg_json_keys)[number], string>> = {
		name: '',
		version: '',
		private: '',
		description: '',
		tagline: 'Fuz extension, like description but snappier',
		glyph: 'Fuz extension, emoji or character icon',
		logo: 'Fuz extension, logo image path',
		logo_alt: 'Fuz extension, logo alt text',
		license: '',
		homepage: '',
		repository: '',
		funding: '',
		exports: ''
	};
</script>

<TomeContent {tome}>
	<section>
		<p>
			<DeclarationLink name="vite_plugin_pkg_json" /> is a Vite plugin that serves a publish-safe
			subset of your <code>package.json</code> as the virtual module
			<Code lang="ts" content="'virtual:pkg.json'" inline />. The default export is typed
			<a href="https://util.fuz.dev/docs/api#PkgJson"><code>PkgJson</code></a>
			from fuz_util, and contains package identity plus Fuz extension fields, with everything else
			excluded.
		</p>
		<p>
			The plugin strips <code>package.json</code> to the allowlist and serves only that, so info
			like name/version/repository and the Fuz extension fields like logo are available to your
			code. The docs system around the content you're reading relies on it. Importing the root
			<code>package.json</code> directly instead inlines the whole file -- <code>scripts</code>,
			<code>dependencies</code>, private config -- into the client bundle and trips SvelteKit's
			<code>server.fs.allow</code>
			on a cold HMR reload; serving the curated subset avoids both.
		</p>
	</section>

	<TomeSection>
		<TomeSectionHeader text="Setup" />
		<p>
			Register the plugin, <ModuleLink module_path="vite_plugin_pkg_json.ts" />:
		</p>
		<Code
			lang="ts"
			content={`// vite.config.ts\nimport {defineConfig} from 'vite';
import {sveltekit} from '@sveltejs/kit/vite';
import {vite_plugin_pkg_json} from '@fuzdev/fuz_ui/vite_plugin_pkg_json.js';

export default defineConfig({
	plugins: [sveltekit(), vite_plugin_pkg_json()],
});`}
		/>
		<p>
			The plugin uses <code>enforce: 'pre'</code> so any order works. For TypeScript it requires
			ambient declarations, like in <code>src/app.d.ts</code>:
		</p>
		<Code
			lang="ts"
			content={`// src/app.d.ts\ndeclare module 'virtual:pkg.json' {
	import type {PkgJson} from '@fuzdev/fuz_util/pkg_json.js';
	const pkg_json: PkgJson;
	export default pkg_json;
}`}
		/>
		<p>You may then import the default export anywhere in client or server code:</p>
		<Code lang="ts" content={`import pkg_json from 'virtual:pkg.json';`} />
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="Usage" />
		<p>
			fuz_ui has optional patterns that leverage the feature. One example is adding <DeclarationLink
				name="SiteState"
			/>
			at the root layout, so
			<code>glyph</code> and <code>repo_url</code> come from <code>package.json</code> instead of
			being hardcoded:
		</p>
		<Code
			lang="ts"
			content={`// +layout.svelte or some other root\nimport pkg_json from 'virtual:pkg.json';
import {SiteState, site_context} from '@fuzdev/fuz_ui/site.svelte.js';

// glyph + repo_url derive from pkg_json.glyph and pkg_json.repository
site_context.set(new SiteState({pkg_json}));`}
		/>
		<p>
			It's also the curated <code>pkg_json</code> half of a
			<a href="https://util.fuz.dev/docs/api#LibraryJson"><code>LibraryJson</code></a> rendered by
			<TomeLink slug="LibraryDetail" />. The fuz_ui docs pattern combines it with the analyzed
			<code>modules</code> from
			<code>virtual:svelte-docinfo</code>
			(<a href="https://svelte-docinfo.fuz.dev/">svelte-docinfo.fuz.dev</a>):
		</p>
		<Code
			lang="ts"
			content={`// src/routes/library.ts\nimport {library_json_from_modules} from '@fuzdev/fuz_util/library_json.js';
import {modules} from 'virtual:svelte-docinfo';
import pkg_json from 'virtual:pkg.json';

export const library_json = library_json_from_modules(pkg_json, modules);`}
		/>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="What gets served" />
		<p>
			By default the plugin keeps only the keys in <a
				href="https://util.fuz.dev/docs/api#pkg_json_keys"
			>
				<code>pkg_json_keys</code>
			</a>, including package identity values and some Fuz extension fields. Everything else is
			dropped:
		</p>
		<ul>
			{#each pkg_json_keys as key (key)}
				<li>
					<code>{key}</code>{#if key_notes[key]}: {key_notes[key]}{/if}
				</li>
			{/each}
		</ul>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="Custom keys" />
		<p>
			The set of picked fields defaults to <a href="https://util.fuz.dev/docs/api#pkg_json_keys">
				<code>pkg_json_keys</code>
			</a>, and you can extend or replace them:
		</p>
		<Code
			lang="ts"
			content={`// src/routes/pkg_json_keys.ts has one shared const for all three sites
import {pkg_json_keys} from '@fuzdev/fuz_util/pkg_json.js';

export const custom_keys = [...pkg_json_keys, 'keywords'] as const;`}
		/>
		<p>
			Because <code>library_json_from_modules</code> re-strips at runtime, the same list must reach
			all three places (the plugin, that runtime call, and the
			<code>virtual:pkg.json</code>
			ambient type), or the extras get dropped:
		</p>
		<Code
			lang="ts"
			content={`// vite.config.ts
vite_plugin_pkg_json({keys: custom_keys});

// src/routes/library.ts
library_json_from_modules(pkg_json, modules, custom_keys);`}
		/>
		<p>
			For type safety, widen the <code>src/app.d.ts</code> ambient type to match -- the same
			<code>custom_keys</code> const drives it via <code>Pick</code> over
			<a href="https://util.fuz.dev/docs/api#PackageJson"><code>PackageJson</code></a>:
		</p>
		<Code
			lang="ts"
			content={`// src/app.d.ts\ndeclare module 'virtual:pkg.json' {
	import type {PackageJson} from '@fuzdev/fuz_util/package_json.js';
	import type {custom_keys} from '$routes/pkg_json_keys.js';
	const pkg_json: Pick<PackageJson, (typeof custom_keys)[number]>;
	export default pkg_json;
}`}
		/>
	</TomeSection>

	<aside>
		For more, see <ModuleLink module_path="vite_plugin_pkg_json.ts" />, the
		<GithubLink path="fuzdev/fuz_ui/blob/main/src/lib/vite_plugin_pkg_json.ts">
			source code
		</GithubLink>
		and
		<GithubLink path="fuzdev/fuz_ui/blob/main/src/test/vite_plugin_pkg_json.test.ts">
			tests
		</GithubLink>.
	</aside>
</TomeContent>
