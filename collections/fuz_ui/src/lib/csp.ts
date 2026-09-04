import type { Defined } from '@fuzdev/fuz_util/types.ts';

// TODO schemas, but I may be moving to ArkType from Zod if precompilation looks good

/**
 * Per-directive map of source arrays — accepted as `extend` layer entries.
 * Excludes directives like `'upgrade-insecure-requests'` (boolean) that can't be appended to.
 */
export type CspDirectiveSourcesMap = {
	[K in CspDirective as CspDirectives[K] extends ReadonlyArray<any> ? K : never]?: CspDirectives[K];
};

/**
 * Options for `create_csp_directives`.
 *
 * The pipeline runs in three stages:
 * 1. `replace_defaults` sets the starting state (defaults to `csp_directive_value_defaults`).
 * 2. `extend` appends sources per directive, layered left to right.
 * 3. `overrides` replaces or removes per-directive values as a final pass.
 */
export interface CreateCspDirectivesOptions {
	/**
	 * Starting values per directive — *wholesale replaces* the library defaults.
	 *
	 * - Omitted: uses `csp_directive_value_defaults` (the curated library defaults).
	 * - Provided: exactly the directives you list, nothing else inherited.
	 *   Anything not listed is **absent** from the starting state — including security defaults
	 *   like `default-src: 'none'`. To tweak a single directive while keeping the rest, use
	 *   `extend` (to append) or `overrides` (to replace per-key) instead.
	 * - `{}`: starts blank with no directives.
	 *
	 * `null` is not accepted (top-level or per-key) — omit the option to use library defaults,
	 * pass `{}` to start blank, or use `overrides` to remove a specific directive.
	 *
	 * Per-key `undefined` is treated as omitted (no-op).
	 */
	replace_defaults?: Partial<typeof csp_directive_value_defaults>;

	/**
	 * Sources to append per directive, layered left to right.
	 * Each entry is a partial map; values append to the result of `replace_defaults` and prior entries.
	 * Values are deduplicated within and across layers.
	 *
	 * Only array-typed directives can be extended (boolean directives like `upgrade-insecure-requests`
	 * are excluded by the type). Throws if any entry attempts to extend a directive whose current
	 * value is `['none']` — use `replace_defaults` or `overrides` to opt into default-deny directives.
	 *
	 * Per-key `undefined` is treated as omitted (no-op) — supports conditional patterns like
	 * `{'connect-src': is_prod ? [API_URL] : undefined}`. Per-key `null` throws — `extend` only
	 * appends; use `overrides: { 'X': null }` to remove a directive.
	 */
	extend?: ReadonlyArray<CspDirectiveSourcesMap>;

	/**
	 * Final-pass per-directive overrides. Replaces the directive value or removes it entirely.
	 * Pass `null` to remove a directive from the output.
	 *
	 * Highest precedence — wins over `replace_defaults` and `extend`.
	 *
	 * Per-key `undefined` is treated as omitted (no-op) — distinct from `null`, which removes.
	 */
	overrides?: {
		[K in CspDirective]?: CspDirectiveValue<K> | null;
	};
}

/**
 * Builds a CSP directives map for use with SvelteKit's `kit.csp.directives` option.
 *
 * Restrictive by default; opt into specific permissions via `extend` (append) or
 * `overrides` (replace). Designed to read as an audit log: every user-added source
 * is named at exactly one site in the source code. Library defaults are inherited
 * unless you opt out via `replace_defaults`.
 *
 * Validation:
 * - Unknown directive keys throw.
 * - Extending a `['none']` directive throws (use `replace_defaults`/`overrides` to opt in).
 * - `null` for `replace_defaults` (top-level or per-key) throws — omit the option for library
 *   defaults, pass `{}` to start blank, or use `overrides` to remove a specific directive.
 * - `null` per-key in `extend` throws (use `overrides` for removal).
 * - `undefined` per-key is treated as omitted in all three stages.
 * - Non-object entries in `extend` (`null`, `undefined`, primitives) throw with a friendly error.
 * - Output is validated to ensure `'none'` never appears alongside other tokens,
 *   that no directive ends up with an empty array (use `['none']` to forbid all),
 *   and that every source array contains only strings.
 *
 * Things like rendering to a string are out of scope and left to SvelteKit.
 */
export const create_csp_directives = (options: CreateCspDirectivesOptions = {}): CspDirectives => {
	const { replace_defaults = csp_directive_value_defaults, extend, overrides } = options;

	if (replace_defaults === null) {
		throw new Error(
			`Invalid value 'null' for options.replace_defaults. ` +
				`Omit the option to use library defaults, or pass {} to start with no directives.`
		);
	}

	const directives: CspDirectives = {};

	// `Object.entries` widens to `[string, unknown]` and TS can't re-narrow per-key, so
	// writes via the validated `directive` need a single trusted-bridge cast — kept inside
	// this helper so the call sites stay free of type assertions. Clones arrays so callers
	// don't have to worry about user-supplied arrays leaking into the output.
	const assign = (directive: CspDirective, value: unknown): void => {
		(directives as Record<CspDirective, unknown>)[directive] = Array.isArray(value)
			? [...value]
			: value;
	};

	// Stage 1: starting state from `replace_defaults`.
	// `{}` starts blank — every directive must come from `extend`/`overrides`.
	for_each_directive(replace_defaults, 'replace_defaults', (directive, value) => {
		if (value === null) {
			throw new Error(
				`Invalid value 'null' for directive '${directive}' in options.replace_defaults. ` +
					`Omit the key instead, or use \`overrides: { '${directive}': null }\` to remove.`
			);
		}

		if (value === undefined) return;
		assign(directive, value);
	});

	// Stage 2: append sources per layer in `extend`.
	if (extend?.length) {
		for (const layer of extend) {
			for_each_directive(layer, 'extend', (directive, value) => {
				// `undefined` is treated as omitted, matching `replace_defaults`/`overrides`.
				// Lets callers write `{'connect-src': cond ? [API] : undefined}` naturally.
				if (value === undefined) return;
				// `null` is meaningful enough to deserve its own error — users reaching for null
				// in extend almost always want removal, which lives on `overrides`.
				if (value === null) {
					throw new Error(
						`Cannot extend directive '${directive}' with null. ` +
							`extend can only append sources — to remove a directive from the output, ` +
							`use \`overrides: { '${directive}': null }\`.`
					);
				}
				if (!Array.isArray(value)) {
					throw new Error(
						`Cannot extend directive '${directive}': value must be an array of sources, got ${typeof value}.`
					);
				}
				if (!value.length) return;
				const current = directives[directive];
				if (is_none(current)) {
					throw new Error(
						`Cannot extend directive '${directive}' while its current value is ['none']. ` +
							`The pipeline runs replace_defaults → extend → overrides, so an \`overrides\` ` +
							`entry for '${directive}' cannot rescue this — extend sees the ['none'] starting ` +
							`value first. Opt in via \`replace_defaults: { '${directive}': [...] }\` or move ` +
							`the sources into \`overrides: { '${directive}': [...] }\`.`
					);
				}
				if (current === undefined) {
					assign(directive, [...new Set(value)]);
				} else if (Array.isArray(current)) {
					assign(directive, [...new Set([...current, ...value])]);
				} else {
					throw new Error(`Cannot extend directive '${directive}': it has a non-array value.`);
				}
			});
		}
	}

	// Stage 3: final-pass `overrides` — replace value or remove key.
	if (overrides) {
		for_each_directive(overrides, 'overrides', (directive, value) => {
			if (value === null) {
				delete directives[directive]; // eslint-disable-line @typescript-eslint/no-dynamic-delete
			} else if (value !== undefined) {
				assign(directive, value);
			}
		});
	}

	// Stage 4: output validation — empty arrays and mixed `'none'` are invalid CSP.
	for (const [key, value] of Object.entries(directives)) {
		if (typeof value === 'boolean') continue;
		if (!Array.isArray(value)) {
			throw new Error(
				`Directive '${key}' has an invalid value: expected an array of sources or a boolean, ` +
					`got ${value === null ? 'null' : typeof value}.`
			);
		}
		if (value.length === 0) {
			throw new Error(
				`Directive '${key}' has an empty array. ` +
					`Use ['none'] to forbid all sources, or omit the directive entirely.`
			);
		}
		// Element-level type check — the `CspSource` template-string type gates this at the
		// type layer, but `as any` callers can slip non-strings through. A non-string source
		// would render as `undefined` / `[object Object]` in the emitted CSP header.
		for (let i = 0; i < value.length; i++) {
			const v = (value as Array<unknown>)[i];
			if (typeof v !== 'string') {
				throw new Error(
					`Directive '${key}' has a non-string source at index ${i}: got ${
						v === null ? 'null' : typeof v
					}.`
				);
			}
		}
		if (value.length > 1 && (value as Array<unknown>).includes('none')) {
			throw new Error(
				`Directive '${key}' has 'none' alongside other tokens (${value.join(', ')}). ` +
					`'none' must appear alone in CSP.`
			);
		}
	}

	return directives;
};

export type CspDirective = keyof CspDirectives;

export const parse_csp_directive = (directive: unknown): CspDirective | null =>
	typeof directive === 'string' && csp_directive_spec_by_name.has(directive as CspDirective)
		? (directive as CspDirective)
		: null;

export type CspDirectiveValue<T extends CspDirective> = Defined<CspDirectives[T]>;

const is_none = (value: unknown): boolean =>
	Array.isArray(value) && value.length === 1 && value[0] === 'none';

/**
 * Iterate over a per-directive options map, validating that every key is a known directive.
 * Throws if any key fails to parse as a `CspDirective`, mentioning `source_label` so the
 * error pinpoints which option (`replace_defaults`, `extend`, or `overrides`) was bad.
 *
 * Also guards against non-object `source` values (e.g. `extend: [undefined]`, `extend: ['oops']`)
 * so callers get a friendly library error instead of a cryptic native `TypeError` from
 * `Object.entries`.
 */
const for_each_directive = <V>(
	source: Record<string, V>,
	source_label: 'replace_defaults' | 'extend' | 'overrides',
	fn: (directive: CspDirective, value: V) => void
): void => {
	if (source === null || typeof source !== 'object') {
		const got = source === null ? 'null' : typeof source;
		throw new Error(`Invalid entry in options.${source_label}: expected an object, got ${got}.`);
	}
	for (const [key, value] of Object.entries(source)) {
		const directive = parse_csp_directive(key);
		if (directive === null) {
			throw new Error(`Invalid directive in options.${source_label}: ${key}`);
		}
		fn(directive, value);
	}
};

/**
 * The exact body of the color-scheme loader `<script>` in `app.html`, the inline script
 * `COLOR_SCHEME_SCRIPT_HASH` admits.
 *
 * The loader has to run before first paint to avoid a flash of the wrong scheme, so it is inline
 * rather than a render-blocking `src`, and CSP admits it by hash. That makes its bytes
 * load-bearing: whitespace, quoting, and trailing commas all move the hash, so a formatter that
 * reflows `app.html` breaks the theme on every cold load with nothing but a console violation to
 * show for it. Consumers can guard their own `app.html` against this constant.
 */
export const COLOR_SCHEME_SCRIPT = `
			document.documentElement.classList.add(
				((c) =>
					c === 'dark' || (c !== 'light' && matchMedia('(prefers-color-scheme:dark)').matches)
						? 'dark'
						: 'light')(localStorage.getItem('fuz:color-scheme'))
			);
		`;

/**
 * The `sha256-` CSP source for `COLOR_SCHEME_SCRIPT`, carried by the `script-src` and
 * `script-src-elem` defaults so the loader runs under the library CSP.
 *
 * Regenerate after any edit to `COLOR_SCHEME_SCRIPT` — `src/test/csp.color_scheme.test.ts`
 * reports the expected value when the two disagree.
 */
export const COLOR_SCHEME_SCRIPT_HASH = 'sha256-CkhymyixntvSTuePGizI3BFtnRFlWWg95YBmBOCFxfY=';

/**
 * The library CSP directive defaults — directives enabled out of the box.
 * Prioritizes safety but loosens around media and styles, relying on defense-in-depth.
 * WASM compile is allowed (`'wasm-unsafe-eval'` on `script-src` and `worker-src`); `eval` is not.
 *
 * Directives not listed here (`report-to`, `require-trusted-types-for`, `trusted-types`,
 * `sandbox`) are intentionally absent by default — opt in via `replace_defaults` or `overrides`.
 *
 * Customizable via `CreateCspDirectivesOptions.replace_defaults`.
 */
export const csp_directive_value_defaults: Partial<{
	[K in CspDirective]: CspDirectiveValue<K>;
}> = {
	'default-src': ['none'],
	// `'wasm-unsafe-eval'` permits WASM compile/instantiate only — `eval` and `new Function`
	// remain blocked. Needed for `@fuzdev/fuz_util/hash_blake3` and any other WASM in the page.
	// Pre-2022 browsers ignore the keyword and block WASM; if you need them, override with `'unsafe-eval'`.
	'script-src': ['self', 'wasm-unsafe-eval', COLOR_SCHEME_SCRIPT_HASH],
	'script-src-elem': ['self', COLOR_SCHEME_SCRIPT_HASH], // Block script elements except for self and the color scheme loader (WASM compile is gated by script-src, not script-src-elem)
	'script-src-attr': ['none'], // Block scripts in HTML attributes
	'style-src': ['self', 'unsafe-inline'], // Main style directive (uses unsafe-inline but network connections are disallowed by other directives)
	'style-src-elem': ['self', 'unsafe-inline'], // Style elements (standalone stylesheets)
	'style-src-attr': ['unsafe-inline'], // Style attributes
	'img-src': ['self', 'data:', 'blob:', 'filesystem:'], // Images
	'media-src': ['self', 'data:', 'blob:', 'mediastream:', 'filesystem:'], // Audio/video
	'font-src': ['self', 'data:'], // Fonts
	'manifest-src': ['self'], // Web app manifests
	'child-src': ['none'], // Not trusted, extends default-src so worker-src and frame-src are additionally blocked
	'connect-src': ['self'], // Fetch, WebSockets
	'frame-src': ['self'], // Frames/iframes
	'frame-ancestors': ['self'], // Control what can embed this page
	'form-action': ['self'], // Form submission targets
	// `'wasm-unsafe-eval'` mirrors the script-src allowance so WASM compiled inside a Web Worker also works.
	'worker-src': ['self', 'blob:', 'wasm-unsafe-eval'], // Web workers
	'object-src': ['none'], // Block plugins (Flash, Java, etc.)
	'base-uri': ['none'], // Prevent base tag hijacking
	'upgrade-insecure-requests': true // Upgrade http to https
};

export interface CspDirectiveSpec {
	name: CspDirective;
	fallback: Array<CspDirective> | null;
	fallback_of: Array<CspDirective> | null;
}

/**
 * Static data descriptors for the CSP directives.
 * Fuz excludes deprecated directives, so those are intentionally omitted,
 * but any newer missing directives are bugs.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy}
 */
export const csp_directive_specs: Array<CspDirectiveSpec> = [
	{
		name: 'default-src',
		fallback: null,
		fallback_of: [
			'script-src',
			'script-src-elem',
			'script-src-attr',
			'style-src',
			'style-src-elem',
			'style-src-attr',
			'img-src',
			'media-src',
			'font-src',
			'manifest-src',
			'child-src',
			'connect-src',
			'worker-src',
			'object-src'
		]
	},
	{
		name: 'script-src',
		fallback: ['default-src'],
		fallback_of: ['script-src-elem', 'script-src-attr', 'worker-src']
	},
	{
		name: 'script-src-elem',
		fallback: ['script-src', 'default-src'],
		fallback_of: null
	},
	{
		name: 'script-src-attr',
		fallback: ['script-src', 'default-src'],
		fallback_of: null
	},
	{
		name: 'style-src',
		fallback: ['default-src'],
		fallback_of: ['style-src-elem', 'style-src-attr']
	},
	{
		name: 'style-src-elem',
		fallback: ['style-src', 'default-src'],
		fallback_of: null
	},
	{
		name: 'style-src-attr',
		fallback: ['style-src', 'default-src'],
		fallback_of: null
	},
	{
		name: 'img-src',
		fallback: ['default-src'],
		fallback_of: null
	},
	{
		name: 'media-src',
		fallback: ['default-src'],
		fallback_of: null
	},
	{
		name: 'font-src',
		fallback: ['default-src'],
		fallback_of: null
	},
	{
		name: 'manifest-src',
		fallback: ['default-src'],
		fallback_of: null
	},
	{
		name: 'child-src',
		fallback: ['default-src'],
		fallback_of: ['frame-src', 'worker-src']
	},
	{
		name: 'connect-src',
		fallback: ['default-src'],
		fallback_of: null
	},
	{
		name: 'frame-src',
		fallback: ['child-src'],
		fallback_of: null
	},
	{
		name: 'frame-ancestors',
		fallback: null,
		fallback_of: null
	},
	{
		name: 'form-action',
		fallback: null,
		fallback_of: null
	},
	{
		name: 'worker-src',
		fallback: ['child-src', 'script-src', 'default-src'],
		fallback_of: null
	},
	{
		name: 'object-src',
		fallback: ['default-src'],
		fallback_of: null
	},
	{
		name: 'base-uri',
		fallback: null,
		fallback_of: null
	},
	{
		name: 'upgrade-insecure-requests',
		fallback: null,
		fallback_of: null
	},
	{
		name: 'report-to',
		fallback: null,
		fallback_of: null
	},
	{
		name: 'require-trusted-types-for',
		fallback: null,
		fallback_of: null
	},
	{
		name: 'trusted-types',
		fallback: null,
		fallback_of: null
	},
	{
		name: 'sandbox',
		fallback: null,
		fallback_of: null
	}
];

export const csp_directive_spec_by_name: Map<CspDirective, CspDirectiveSpec> = new Map(
	csp_directive_specs.map((s) => [s.name, s])
);

// CSP types from SvelteKit, adapted with changes from @sveltejs/kit/src/types/private.d.ts
//
// Based on https://github.com/sveltejs/kit/blob/main/packages/kit/src/types/private.d.ts
//
// Based on https://github.com/josh-hemphill/csp-typed-directives/blob/latest/src/csp.types.ts
//
// MIT License
//
// Copyright (c) 2021-present, Joshua Hemphill
// Copyright (c) 2021, Tecnico Corporation
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
export type CspActionSource = 'strict-dynamic' | 'report-sample';
export type CspBaseSource =
	'self' | 'unsafe-eval' | 'unsafe-hashes' | 'unsafe-inline' | 'wasm-unsafe-eval' | 'none';
export type CspCryptoSource = `${'nonce' | 'sha256' | 'sha384' | 'sha512'}-${string}`;
export type CspFrameSource = CspHostSource | CspSchemeSource | 'self' | 'none';
export type CspHostNameScheme = `${string}.${string}` | 'localhost';
export type CspHostSource = `${CspHostProtocolSchemes}${CspHostNameScheme}${CspPortScheme}`;
export type CspHostProtocolSchemes = `${string}://` | '';
export type CspPortScheme = `:${number}` | '' | ':*';
export type CspSchemeSource =
	'http:' | 'https:' | 'data:' | 'mediastream:' | 'blob:' | 'filesystem:';
export type CspSource = CspHostSource | CspSchemeSource | CspCryptoSource | CspBaseSource;
export type CspSources = Array<CspSource>;

export interface CspDirectives {
	'default-src'?: Array<CspSource | CspActionSource>;
	'script-src'?: Array<CspSource | CspActionSource>;
	'script-src-elem'?: CspSources;
	'script-src-attr'?: CspSources;
	'style-src'?: Array<CspSource | CspActionSource>;
	'style-src-elem'?: CspSources;
	'style-src-attr'?: CspSources;
	'img-src'?: CspSources;
	'media-src'?: CspSources;
	'font-src'?: CspSources;
	'manifest-src'?: CspSources;
	'child-src'?: CspSources;
	'connect-src'?: CspSources;
	'frame-src'?: CspSources;
	'frame-ancestors'?: Array<CspFrameSource>;
	'form-action'?: Array<CspSource | CspActionSource>;
	'worker-src'?: CspSources;
	'object-src'?: CspSources;
	'base-uri'?: Array<CspSource | CspActionSource>;
	'upgrade-insecure-requests'?: boolean;
	'report-to'?: Array<string>;
	'require-trusted-types-for'?: Array<'script'>;
	'trusted-types'?: Array<'none' | 'allow-duplicates' | '*' | string>; // eslint-disable-line @typescript-eslint/no-redundant-type-constituents
	sandbox?: Array<
		| 'allow-downloads-without-user-activation'
		| 'allow-forms'
		| 'allow-modals'
		| 'allow-orientation-lock'
		| 'allow-pointer-lock'
		| 'allow-popups'
		| 'allow-popups-to-escape-sandbox'
		| 'allow-presentation'
		| 'allow-same-origin'
		| 'allow-scripts'
		| 'allow-storage-access-by-user-activation'
		| 'allow-top-navigation'
		| 'allow-top-navigation-by-user-activation'
	>;
}
