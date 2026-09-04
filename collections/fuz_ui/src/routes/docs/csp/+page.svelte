<script lang="ts">
	import Code from '@fuzdev/fuz_code/Code.svelte';

	import GithubLink from '$lib/GithubLink.svelte';
	import { tome_get_by_slug } from '$lib/tome.ts';
	import TomeContent from '$lib/TomeContent.svelte';
	import MdnLink from '$lib/MdnLink.svelte';
	import { csp_directive_specs } from '$lib/csp.ts';
	import TomeSectionHeader from '$lib/TomeSectionHeader.svelte';
	import TomeSection from '$lib/TomeSection.svelte';
	import DeclarationLink from '$lib/DeclarationLink.svelte';

	const TOME_SLUG = 'csp';
	const tome = tome_get_by_slug(TOME_SLUG);
</script>

<!-- eslint-disable svelte/no-useless-mustaches -->

<TomeContent {tome}>
	<section>
		<p>
			Fuz supports <a href="https://svelte.dev/docs/kit/configuration#csp">SvelteKit's config</a>
			for
			<MdnLink
				path="https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/ContentSecurityPolicy"
			>
				Content Security Policies
			</MdnLink>
			with the
			<DeclarationLink name="create_csp_directives" />
			helper. Fuz also provides related helpers, types, and CSP data.
		</p>
		<p>
			The API is designed to read as an audit log: every user-added source is named at exactly one
			site in the source code. There's no implicit promotion of sources across directives. If you
			want a domain on <code>script-src</code>, you write <code>script-src</code>. Library defaults
			are inherited unless you opt out via <code>replace_defaults</code>.
		</p>
		<p>Example usage:</p>
		<Code
			lang="ts"
			content={`import {create_csp_directives, type CspDirectives} from '@fuzdev/fuz_ui/csp.js';

// Default CSP — restrictive defaults from \`csp_directive_value_defaults\`.
const csp = create_csp_directives();
// Use in svelte.config.js:
// export default {kit: {csp: {directives: csp}}}

// Layer in your own sources per directive:
const csp_with_sources = create_csp_directives({
  extend: [
    {
      'img-src': ['https://*.my.domain/'],
      'connect-src': ['https://api.my.domain/'],
      // Putting a source on script-src requires naming script-src here.
      'script-src': ['https://cdn.my.domain/'],
    },
  ],
});

// Compose multiple "shared lib" objects (e.g. a vendor's directive map plus your own):
import {csp_directives_of_fuzdev} from '@fuzdev/fuz_ui/csp_of_fuzdev.js';
const csp_composed = create_csp_directives({
  extend: [
    csp_directives_of_fuzdev,
    {'connect-src': ['https://api.my.domain/']},
  ],
});

// Replace a directive wholesale via the final-pass \`overrides\`:
const csp_replaced = create_csp_directives({
  extend: [{'connect-src': ['https://api.my.domain/']}],
  overrides: {
    // Wins over extend; \`null\` removes a directive entirely.
    'frame-src': ['none'],
    'report-to': null,
  },
});

// Start from your own defaults instead of the library defaults:
const csp_custom_defaults = create_csp_directives({
  replace_defaults: {
    'default-src': ['none'],
    'script-src': ['self'],
    'connect-src': ['self', 'https://api.my.domain/'],
  },
  // \`extend\` and \`overrides\` still layer on top.
});

// Start blank — fully declarative, no library defaults at all:
const csp_blank = create_csp_directives({
  replace_defaults: {},
  overrides: {
    'script-src': ['self'],
    'img-src': ['self', 'data:'],
  },
});`}
		/>
	</section>

	<TomeSection>
		<TomeSectionHeader text="Pipeline" />
		<p>Three stages run in order, and each is independent. Use the one that matches your intent.</p>
		<ol>
			<li>
				<strong>
					<DeclarationLink name="CreateCspDirectivesOptions" />
					<code>replace_defaults</code>
				</strong>
				— the starting state. Omitted, it's
				<DeclarationLink name="csp_directive_value_defaults" />. Provided, it
				<em>replaces the library defaults wholesale</em>: exactly the directives you list, nothing
				inherited. <code>{'{}'}</code> starts blank; <code>null</code> throws (avoid the
				null/undefined footgun where a conditional silently disables defaults).
			</li>
			<li>
				<strong><code>extend</code></strong> — sources to append per directive, layered left to
				right. Values append (and deduplicate) to the result of <code>replace_defaults</code> and
				prior entries. Boolean directives (e.g. <code>upgrade-insecure-requests</code>) are excluded
				by the type. Only array-typed directives can be extended. Compose multiple shared maps in
				one array.
			</li>
			<li>
				<strong><code>overrides</code></strong> — final-pass per-directive replace or remove.
				Highest precedence. Pass <code>null</code> to drop a directive from the output entirely.
			</li>
		</ol>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="Adding sources via extend" />
		<p>
			<code>extend</code> is the common path: take a starting state and add per-directive sources.
			Sources land only on the directives you name. There's no cross-directive promotion.
		</p>
		<Code
			lang="ts"
			content={`create_csp_directives({
  extend: [
    {
      'img-src': ['https://cdn.fuz.dev/'],
      'connect-src': ['https://api.fuz.dev/'],
    },
  ],
});`}
		/>
		<p>
			Multiple entries compose left to right, deduplicating across layers. Useful for combining a
			"shared lib" object with app-specific extras:
		</p>
		<Code
			lang="ts"
			content={`import {csp_directives_of_fuzdev} from '@fuzdev/fuz_ui/csp_of_fuzdev.js';

create_csp_directives({
  extend: [
    csp_directives_of_fuzdev,
    {
      'connect-src': ['https://api.fuz.dev/'],
      'img-src': ['https://media.fuz.dev/'],
    },
  ],
});`}
		/>
		<p>
			Default-deny directives (those whose default value is <code>['none']</code>, including
			<code>default-src</code>, <code>object-src</code>, <code>base-uri</code>,
			<code>script-src-attr</code>, and <code>child-src</code>) cannot be extended. Attempting to
			<code>extend</code> them throws. Opting in must go through <code>replace_defaults</code> or
			<code>overrides</code> so the opt-in is visible at the call site. Note that
			<code>overrides</code> cannot rescue an <code>extend</code> for a default-deny directive in
			the same call: extend runs first and throws before <code>overrides</code> would replace the
			value. Move the sources into <code>overrides</code> directly, or opt in via
			<code>replace_defaults</code>
			and then extend.
		</p>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="Replacing values via overrides" />
		<p>
			The final-pass <code>overrides</code> option replaces a directive's value or removes it
			entirely. Highest precedence. Wins over <code>replace_defaults</code> and
			<code>extend</code>.
		</p>
		<Code
			lang="ts"
			content={`create_csp_directives({
  extend: [{'connect-src': ['https://api.fuz.dev/']}],
  overrides: {
    // Wholesale replace — drops the connect-src extend output above.
    'connect-src': ['self'],

    // Remove a directive entirely from the output.
    'report-to': null,

    // Set a default-deny directive's value explicitly.
    'object-src': ['none'],

    // Boolean directives are supported.
    'upgrade-insecure-requests': false,
  },
});`}
		/>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="Custom defaults via replace_defaults" />
		<p>
			<code>replace_defaults</code> sets the starting state. The default is the library's curated
			<DeclarationLink name="csp_directive_value_defaults" />. To use your own foundation, pass a
			complete map. <strong>Anything you don't list is absent from the starting state</strong>,
			including security defaults like <code>default-src: ['none']</code>. Use <code>extend</code>
			and <code>overrides</code> for per-directive tweaks while keeping the library defaults.
		</p>
		<Code
			lang="ts"
			content={`// Fully declarative — no library defaults at all.
const csp = create_csp_directives({
  replace_defaults: {
    'default-src': ['none'],
    'script-src': ['self'],
    'connect-src': ['self'],
  },
});
// assert.deepEqual(csp, {
//   'default-src': ['none'],
//   'script-src': ['self'],
//   'connect-src': ['self'],
// });

// Same shape as a hand-written directives map — still gets input and output validation.
create_csp_directives({replace_defaults: {}, overrides: {/* ... */}});`}
		/>
		<p>
			Use <code>overrides</code> for tweaks (replace one directive while keeping the library
			defaults), and <code>replace_defaults</code> for full ownership of the starting state.
			<code>null</code> is rejected (top-level or per-key). Omit the option for library defaults,
			pass <code>{'{}'}</code> to start blank, or use <code>overrides</code> to remove a specific
			directive.
		</p>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="Validation" />
		<p>
			<DeclarationLink name="create_csp_directives" /> validates inputs and outputs at build time.
			Misconfigurations throw rather than producing a silently broken policy.
		</p>
		<ul>
			<li>
				Unknown directive keys in any of <code>replace_defaults</code>, <code>extend</code>, or
				<code>overrides</code>
				throw with the offending name.
			</li>
			<li>
				Extending a directive whose current value is <code>['none']</code> throws. Opt in via
				<code>replace_defaults</code> or <code>overrides</code> instead.
			</li>
			<li>
				<code>null</code> for <code>replace_defaults</code> (top-level or per-key) throws. Omit the
				option for library defaults, pass <code>{'{}'}</code> to start blank, or use
				<code>overrides</code>
				to remove a specific directive.
			</li>
			<li>
				<code>null</code> per-key in <code>extend</code> throws with a pointer to
				<code>overrides</code>. <code>extend</code> only appends, so removal lives on
				<code>overrides</code>.
			</li>
			<li>
				<code>undefined</code> per-key in any of the three stages is treated as omitted (no-op).
				This lets conditional patterns like
				<code>{"{'connect-src': is_prod ? [API_URL] : undefined}"}</code>
				work naturally.
			</li>
			<li>
				Non-object entries in <code>extend</code> (e.g. <code>extend: [undefined]</code>) throw a
				library error pointing at the option, instead of a cryptic native
				<code>TypeError</code>.
			</li>
			<li>
				The output is validated to ensure <code>'none'</code> never appears alongside other tokens
				(an invalid CSP that browsers reject).
			</li>
			<li>
				The output is validated to ensure no directive ends up with an empty array. Use
				<code>['none']</code> to forbid all sources, or omit the directive entirely. Empty arrays
				can be silently dropped or fall back to <code>default-src</code>, widening the policy.
			</li>
			<li>
				Source arrays are validated to contain only strings. Non-string elements (slipped through
				via <code>as any</code>) would render as <code>undefined</code> or
				<code>[object Object]</code>
				in the emitted header.
			</li>
		</ul>
	</TomeSection>

	<TomeSection>
		<TomeSectionHeader text="Directive specs" />
		<p>
			<!-- TODO component for the `code` here to reference declaration -->
			The exported <DeclarationLink name="csp_directive_specs" /> has JSON data about the
			<MdnLink path="Web/HTTP/Reference/Headers/Content-Security-Policy">CSP directives</MdnLink>.
			Fuz omits deprecated directives.
		</p>
		<table>
			<thead>
				<tr>
					<th>directive</th>
					<th>fallback</th>
					<th>fallback of</th>
				</tr>
			</thead>
			<tbody>
				{#each csp_directive_specs as spec (spec.name)}
					<tr>
						<td>{spec.name}</td>
						<td>{spec.fallback?.join(', ') || ''}</td>
						<td>{spec.fallback_of?.join(', ') || ''}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</TomeSection>
	<aside>
		For more, see the <GithubLink path="fuzdev/fuz_ui/blob/main/src/lib/csp.ts">
			source code
		</GithubLink>
		and tests in
		<GithubLink path="fuzdev/fuz_ui/tree/main/src/test">src/test/csp.*.test.ts</GithubLink>.
	</aside>
</TomeContent>
