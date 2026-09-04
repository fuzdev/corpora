import { test, assert, describe, beforeEach } from 'vitest';
import { flushSync } from 'svelte';

import {
	docs_slugify,
	to_docs_path_info,
	DocsLinks,
	DOCS_PATH_DEFAULT
} from '$lib/docs_helpers.svelte.ts';

describe('docs_slugify', () => {
	test('preserves case unlike standard slugify', () => {
		assert.strictEqual(docs_slugify('AsyncStatus'), 'AsyncStatus');
		assert.strictEqual(docs_slugify('async_status'), 'async_status');
	});

	test('replaces spaces with hyphens', () => {
		assert.strictEqual(docs_slugify('hello world'), 'hello-world');
	});

	test('collapses multiple hyphens', () => {
		assert.strictEqual(docs_slugify('a---b'), 'a-b');
	});

	test('removes invalid characters', () => {
		assert.strictEqual(docs_slugify('hello@world!'), 'helloworld');
		assert.strictEqual(docs_slugify('foo(bar)'), 'foobar');
	});

	test('preserves $, _, and digits', () => {
		assert.strictEqual(docs_slugify('$state_123'), '$state_123');
	});

	test('trims leading and trailing hyphens', () => {
		assert.strictEqual(docs_slugify('-hello-'), 'hello');
		assert.strictEqual(docs_slugify('--hello--'), 'hello');
	});

	test('trims whitespace', () => {
		assert.strictEqual(docs_slugify('  hello  '), 'hello');
	});

	test('handles empty string', () => {
		assert.strictEqual(docs_slugify(''), '');
	});

	test('handles spaces that produce leading/trailing hyphens after cleanup', () => {
		assert.strictEqual(docs_slugify(' @hello@ '), 'hello');
	});
});

describe('to_docs_path_info', () => {
	test('extracts path segment from pathname', () => {
		const result = to_docs_path_info('contextmenu', '/docs/contextmenu');
		assert.strictEqual(result.path_segment, 'contextmenu');
	});

	test('builds correct path with slug', () => {
		const result = to_docs_path_info('contextmenu', '/docs/something');
		assert.ok(result.path.includes('contextmenu'));
	});

	test('detects when path is selected', () => {
		const result = to_docs_path_info('contextmenu', '/docs/contextmenu');
		assert.strictEqual(result.path_is_selected, true);
	});

	test('detects when path is not selected', () => {
		const result = to_docs_path_info('contextmenu', '/docs/other');
		assert.strictEqual(result.path_is_selected, false);
	});

	test('handles custom root_path', () => {
		const result = to_docs_path_info('test', '/custom/test', '/custom');
		assert.strictEqual(result.path_is_selected, true);
	});

	test('handles nested paths', () => {
		const result = to_docs_path_info('nested', '/docs/category/nested');
		assert.strictEqual(result.path_segment, 'nested');
	});
});

describe('DocsLinks', () => {
	let docs_links: DocsLinks;

	beforeEach(() => {
		docs_links = new DocsLinks();
	});

	describe('constructor', () => {
		test('initializes with default root_path', () => {
			const instance = new DocsLinks();
			assert.strictEqual(instance.root_path, DOCS_PATH_DEFAULT);
		});

		test('initializes with custom root_path', () => {
			const instance = new DocsLinks('/custom');
			assert.strictEqual(instance.root_path, '/custom');
		});

		test('initializes with empty links map', () => {
			const instance = new DocsLinks();
			assert.strictEqual(instance.links.size, 0);
		});

		test('initializes with empty docs_links array', () => {
			const instance = new DocsLinks();
			assert.strictEqual(instance.docs_links.length, 0);
		});

		test('initializes with empty fragments_onscreen set', () => {
			const instance = new DocsLinks();
			assert.strictEqual(instance.fragments_onscreen.size, 0);
		});
	});

	describe('add', () => {
		test('adds a link to the map', () => {
			docs_links.add('test-slug', 'Test Title', '/docs/test');
			flushSync();

			assert.strictEqual(docs_links.links.size, 1);
		});

		test('adds link with correct properties', () => {
			const id = docs_links.add('test-slug', 'Test Title', '/docs/test', 'h3');
			flushSync();

			const link = docs_links.links.get(id);
			assert.ok(link);
			assert.strictEqual(link.id, id);
			assert.strictEqual(link.fragment, 'test-slug');
			assert.strictEqual(link.text, 'Test Title');
			assert.strictEqual(link.tag, 'h3');
			assert.strictEqual(link.order, 0);
		});

		test('adds link without tag', () => {
			const id = docs_links.add('test-slug', 'Test Title', '/docs/test');
			flushSync();

			const link = docs_links.links.get(id);
			assert.ok(link);
			assert.strictEqual(link.tag, undefined);
		});

		test('derived docs_links array contains added link', () => {
			docs_links.add('test-slug', 'Test Title', '/docs/test');
			flushSync();

			assert.strictEqual(docs_links.docs_links.length, 1);
			assert.strictEqual(docs_links.docs_links[0]!.fragment, 'test-slug');
			assert.strictEqual(docs_links.docs_links[0]!.text, 'Test Title');
		});

		test('adding same fragment twice creates two separate entries', () => {
			const id1 = docs_links.add('test-slug', 'First Title', '/docs/test', 'h3');
			flushSync();
			const id2 = docs_links.add('test-slug', 'Updated Title', '/docs/test', 'h4');
			flushSync();

			assert.strictEqual(docs_links.links.size, 2);
			const link1 = docs_links.links.get(id1);
			const link2 = docs_links.links.get(id2);
			assert.ok(link1);
			assert.ok(link2);
			assert.strictEqual(link1.text, 'First Title');
			assert.strictEqual(link2.text, 'Updated Title');
			assert.strictEqual(link1.order, 0); // Same slug = same order
			assert.strictEqual(link2.order, 0); // Same slug = same order
		});

		test('adding same fragment twice does not duplicate in docs_links array', () => {
			docs_links.add('test-slug', 'First Title', '/docs/test');
			flushSync();
			docs_links.add('test-slug', 'Updated Title', '/docs/test');
			flushSync();

			assert.strictEqual(docs_links.docs_links.length, 2);
		});

		test('adds multiple links', () => {
			docs_links.add('slug-1', 'Title 1', '/docs/test', 'h3');
			docs_links.add('slug-2', 'Title 2', '/docs/test', 'h4');
			docs_links.add('slug-3', 'Title 3', '/docs/test');
			flushSync();

			assert.strictEqual(docs_links.links.size, 3);
			assert.strictEqual(docs_links.docs_links.length, 3);
		});

		test('multiple rapid adds work correctly', () => {
			// Simulate rapid successive adds (race condition test)
			docs_links.add('slug-1', 'Title 1', '/docs/test');
			docs_links.add('slug-2', 'Title 2', '/docs/test');
			docs_links.add('slug-3', 'Title 3', '/docs/test');
			docs_links.add('slug-4', 'Title 4', '/docs/test');
			docs_links.add('slug-5', 'Title 5', '/docs/test');
			flushSync();

			assert.strictEqual(docs_links.links.size, 5);
			assert.strictEqual(docs_links.docs_links.length, 5);
		});
	});

	describe('remove', () => {
		let id1: string, id2: string, id3: string;

		beforeEach(() => {
			id1 = docs_links.add('slug-1', 'Title 1', '/docs/test');
			id2 = docs_links.add('slug-2', 'Title 2', '/docs/test');
			id3 = docs_links.add('slug-3', 'Title 3', '/docs/test');
			flushSync();
		});

		test('removes a link from the map', () => {
			docs_links.remove(id2);
			flushSync();

			assert.strictEqual(docs_links.links.size, 2);
			assert.ok(!docs_links.links.has(id2));
		});

		test('removes link from derived docs_links array', () => {
			docs_links.remove(id2);
			flushSync();

			assert.strictEqual(docs_links.docs_links.length, 2);
			assert.ok(!docs_links.docs_links.some((l) => l.id === id2));
		});

		test('removing non-existent id does nothing', () => {
			docs_links.remove('non-existent');
			flushSync();

			assert.strictEqual(docs_links.links.size, 3);
			assert.strictEqual(docs_links.docs_links.length, 3);
		});

		test('removing all links empties the array', () => {
			docs_links.remove(id1);
			docs_links.remove(id2);
			docs_links.remove(id3);
			flushSync();

			assert.strictEqual(docs_links.links.size, 0);
			assert.strictEqual(docs_links.docs_links.length, 0);
		});

		test('multiple rapid removes work correctly', () => {
			// Simulate rapid successive removes (race condition test)
			docs_links.remove(id1);
			docs_links.remove(id2);
			docs_links.remove(id3);
			flushSync();

			assert.strictEqual(docs_links.links.size, 0);
			assert.strictEqual(docs_links.docs_links.length, 0);
		});
	});

	describe('race conditions', () => {
		test('rapid add and remove cycles maintain consistency', () => {
			// Simulate component mount/unmount cycles
			const id1 = docs_links.add('slug-1', 'Title 1', '/docs/test');
			const id2 = docs_links.add('slug-2', 'Title 2', '/docs/test');
			const id3 = docs_links.add('slug-3', 'Title 3', '/docs/test');
			flushSync();

			// Rapid remove all (component unmount)
			docs_links.remove(id1);
			docs_links.remove(id2);
			docs_links.remove(id3);

			// Rapid add all back (component remount with new IDs but same slugs preserve order)
			docs_links.add('slug-1', 'Title 1', '/docs/test');
			docs_links.add('slug-2', 'Title 2', '/docs/test');
			docs_links.add('slug-3', 'Title 3', '/docs/test');
			flushSync();

			assert.strictEqual(docs_links.links.size, 3);
			assert.strictEqual(docs_links.docs_links.length, 3);
		});

		test('simultaneous remove and add of same fragment works correctly', () => {
			const oldId = docs_links.add('test-slug', 'Original', '/docs/test');
			flushSync();

			// Simulate rapid unmount/remount - old instance removes, new instance adds
			docs_links.remove(oldId);
			const newId = docs_links.add('test-slug', 'Remounted', '/docs/test');
			flushSync();

			assert.strictEqual(docs_links.links.size, 1);
			assert.strictEqual(docs_links.docs_links.length, 1);
			assert.strictEqual(docs_links.docs_links[0]!.text, 'Remounted');
			assert.strictEqual(docs_links.docs_links[0]!.id, newId);
		});

		test('interleaved add and remove operations maintain consistency', () => {
			const id1 = docs_links.add('slug-1', 'Title 1', '/docs/test');
			const id2 = docs_links.add('slug-2', 'Title 2', '/docs/test');
			docs_links.remove(id1);
			const id3 = docs_links.add('slug-3', 'Title 3', '/docs/test');
			docs_links.remove(id2);
			const id4 = docs_links.add('slug-4', 'Title 4', '/docs/test');
			flushSync();

			assert.strictEqual(docs_links.links.size, 2);
			assert.strictEqual(docs_links.docs_links.length, 2);
			assert.ok(docs_links.links.has(id3));
			assert.ok(docs_links.links.has(id4));
		});
	});

	describe('generate_section_id', () => {
		test('generates incrementing section IDs', () => {
			assert.strictEqual(docs_links.generate_section_id(), 'section_0');
			assert.strictEqual(docs_links.generate_section_id(), 'section_1');
			assert.strictEqual(docs_links.generate_section_id(), 'section_2');
		});

		test('counter is instance-scoped', () => {
			const other = new DocsLinks();
			assert.strictEqual(docs_links.generate_section_id(), 'section_0');
			assert.strictEqual(other.generate_section_id(), 'section_0');
		});
	});

	describe('add with explicit_id', () => {
		test('uses explicit_id when provided', () => {
			const id = docs_links.add('slug', 'Title', '/docs/test', undefined, 1, undefined, 'my-id');
			flushSync();

			assert.strictEqual(id, 'my-id');
			assert.ok(docs_links.links.has('my-id'));
		});

		test('auto-generates id when explicit_id is not provided', () => {
			const id = docs_links.add('slug', 'Title', '/docs/test');
			flushSync();

			assert.ok(id.startsWith('docs_link_'));
		});
	});

	describe('fragments_onscreen', () => {
		test('can add fragment to fragments_onscreen', () => {
			docs_links.fragments_onscreen.add('test-slug');
			assert.ok(docs_links.fragments_onscreen.has('test-slug'));
			assert.strictEqual(docs_links.fragments_onscreen.size, 1);
		});

		test('can remove fragment from fragments_onscreen', () => {
			docs_links.fragments_onscreen.add('test-slug');
			docs_links.fragments_onscreen.delete('test-slug');
			assert.ok(!docs_links.fragments_onscreen.has('test-slug'));
			assert.strictEqual(docs_links.fragments_onscreen.size, 0);
		});

		test('can add multiple fragments to fragments_onscreen', () => {
			docs_links.fragments_onscreen.add('slug-1');
			docs_links.fragments_onscreen.add('slug-2');
			docs_links.fragments_onscreen.add('slug-3');
			assert.strictEqual(docs_links.fragments_onscreen.size, 3);
		});

		test('adding same fragment twice does not duplicate', () => {
			docs_links.fragments_onscreen.add('test-slug');
			docs_links.fragments_onscreen.add('test-slug');
			assert.strictEqual(docs_links.fragments_onscreen.size, 1);
		});

		test('fragments_onscreen is independent of links', () => {
			const id = docs_links.add('slug-1', 'Title 1', '/docs/test');
			docs_links.fragments_onscreen.add('slug-2');
			flushSync();

			assert.strictEqual(docs_links.links.size, 1);
			assert.strictEqual(docs_links.fragments_onscreen.size, 1);
			assert.ok(docs_links.links.has(id));
			assert.ok(docs_links.fragments_onscreen.has('slug-2'));
		});
	});

	describe('derived array reactivity', () => {
		test('docs_links array reflects map contents and is sorted by order', () => {
			// Add in order - order is now auto-assigned
			docs_links.add('slug-a', 'Title A', '/docs/test');
			docs_links.add('slug-b', 'Title B', '/docs/test');
			docs_links.add('slug-c', 'Title C', '/docs/test');
			flushSync();

			// Should be sorted by order
			assert.strictEqual(docs_links.docs_links.length, 3);
			assert.strictEqual(docs_links.docs_links[0]!.fragment, 'slug-a');
			assert.strictEqual(docs_links.docs_links[1]!.fragment, 'slug-b');
			assert.strictEqual(docs_links.docs_links[2]!.fragment, 'slug-c');
		});
	});

	describe('auto-generated IDs with fragments for keying', () => {
		test('id and fragment are separate fields', () => {
			const id = docs_links.add('my-slug', 'My Title', '/docs/test');
			flushSync();

			const link = docs_links.docs_links[0]!;
			assert.strictEqual(link.id, id);
			assert.strictEqual(link.fragment, 'my-slug');
		});

		test('adding same fragment twice creates separate entries with same order', () => {
			const id1 = docs_links.add('slug-1', 'Original', '/docs/test');
			flushSync();

			const original_link = docs_links.links.get(id1);
			assert.ok(original_link);
			assert.strictEqual(original_link.text, 'Original');
			assert.strictEqual(original_link.order, 0);

			const id2 = docs_links.add('slug-1', 'Updated', '/docs/test');
			flushSync();

			const updated_link = docs_links.links.get(id2);
			assert.ok(updated_link);
			assert.strictEqual(updated_link.id, id2);
			assert.strictEqual(updated_link.text, 'Updated');
			assert.strictEqual(updated_link.order, 0); // Same slug = same order

			// Map should have two entries (different IDs)
			assert.strictEqual(docs_links.links.size, 2);
		});

		test('different IDs with same fragment coexist and maintain order', () => {
			const id1 = docs_links.add('same-slug', 'Instance 1', '/docs/test');
			const id2 = docs_links.add('same-slug', 'Instance 2', '/docs/test');
			const id3 = docs_links.add('same-slug', 'Instance 3', '/docs/test');
			flushSync();

			assert.strictEqual(docs_links.links.size, 3);
			assert.strictEqual(docs_links.docs_links.length, 3);

			// All have same fragment
			const fragments = docs_links.docs_links.map((l) => l.fragment);
			assert.ok(fragments.every((s) => s === 'same-slug'));

			// But different IDs
			const ids = new Set(docs_links.docs_links.map((l) => l.id));
			assert.strictEqual(ids.size, 3);

			// And sorted by order (all have same order=0 since same slug)
			assert.strictEqual(docs_links.docs_links[0]!.id, id1);
			assert.strictEqual(docs_links.docs_links[1]!.id, id2);
			assert.strictEqual(docs_links.docs_links[2]!.id, id3);
		});
	});
});
