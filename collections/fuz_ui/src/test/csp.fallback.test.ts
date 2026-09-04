import { test, assert, describe } from 'vitest';

import { csp_directive_specs, csp_directive_spec_by_name, type CspDirective } from '$lib/csp.ts';

// `csp_directive_specs` is consumed by the fuz_ui docs page (src/routes/docs/csp/+page.svelte).
// These tests protect that public metadata: structural soundness and absence of cycles.
// Per-directive fallback chains are inert data — pinned in the source itself, not duplicated here.

describe('directive spec fallback relationships', () => {
	test('all fallback references point to valid directives', () => {
		for (const spec of csp_directive_specs) {
			if (spec.fallback) {
				for (const fallback_name of spec.fallback) {
					assert.ok(
						csp_directive_spec_by_name.has(fallback_name),
						`${spec.name} fallback ${fallback_name} should be a valid directive`
					);
				}
			}
		}
	});

	test('all fallback_of references point to valid directives', () => {
		for (const spec of csp_directive_specs) {
			if (spec.fallback_of) {
				for (const fallback_of_name of spec.fallback_of) {
					assert.ok(
						csp_directive_spec_by_name.has(fallback_of_name),
						`${spec.name} fallback_of ${fallback_of_name} should be a valid directive`
					);
				}
			}
		}
	});

	test('fallback relationships are bidirectional', () => {
		// If A falls back to B, then B should list A in fallback_of (and vice versa).
		// Catches the typo class: adding a fallback edge in one direction but not the other.
		for (const spec of csp_directive_specs) {
			if (spec.fallback) {
				for (const fallback_name of spec.fallback) {
					const fallback_spec = csp_directive_spec_by_name.get(fallback_name);
					assert.ok(fallback_spec);
					assert.ok(
						fallback_spec.fallback_of?.includes(spec.name),
						`${fallback_name} should list ${spec.name} in fallback_of (bidirectional with ${
							spec.name
						}.fallback)`
					);
				}
			}
			if (spec.fallback_of) {
				for (const fallback_of_name of spec.fallback_of) {
					const child_spec = csp_directive_spec_by_name.get(fallback_of_name);
					assert.ok(child_spec);
					assert.ok(
						child_spec.fallback?.includes(spec.name),
						`${fallback_of_name} should list ${spec.name} in fallback (bidirectional with ${
							spec.name
						}.fallback_of)`
					);
				}
			}
		}
	});
});

describe('no circular fallback chains', () => {
	test('no directive can reach itself through fallback chain', () => {
		// BFS through all fallback branches — convergent paths are fine, only cycles are bugs.
		for (const spec of csp_directive_specs) {
			if (!spec.fallback) continue;

			const visited: Set<CspDirective> = new Set();
			visited.add(spec.name);
			const queue: Array<CspDirective> = [...spec.fallback];

			while (queue.length > 0) {
				const fallback_name = queue.shift()!;
				if (fallback_name === spec.name) {
					assert.fail(`Circular fallback detected: ${spec.name} → ... → ${spec.name}`);
				}

				if (visited.has(fallback_name)) continue;

				visited.add(fallback_name);
				const fallback_spec = csp_directive_spec_by_name.get(fallback_name);
				if (fallback_spec?.fallback) {
					queue.push(...fallback_spec.fallback);
				}
			}
		}
	});

	test('fallback chains have a sane depth limit', () => {
		// Walks the first-fallback-only path, mirroring the longest known chain
		// (worker-src → child-src → script-src → default-src, depth 3).
		const MAX_DEPTH = 5;

		for (const spec of csp_directive_specs) {
			if (!spec.fallback) continue;

			let depth = 0;
			let current: typeof spec | undefined = spec;

			while (current?.fallback && depth < MAX_DEPTH) {
				depth++;
				current = csp_directive_spec_by_name.get(current.fallback[0]!);
			}

			assert.ok(
				depth <= MAX_DEPTH,
				`${spec.name} has fallback chain depth of ${depth}, exceeds max of ${MAX_DEPTH}`
			);
		}
	});
});
