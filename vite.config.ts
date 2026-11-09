import { defineConfig } from 'vitest/config';

// `gro test` passes `--dir src` already; this keeps a bare `vitest` out of the upstream
// `*.test.ts` files under `collections/`
export default defineConfig({
	test: { dir: 'src' }
});
