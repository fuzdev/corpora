import { test, assert, describe, beforeEach, afterEach } from 'vitest';
import { HighlightManager, supports_css_highlight_api } from '$lib/highlight_manager.ts';
import { TokenTypeRegistry, type LexedSyntax } from '$lib/lexer.ts';
import {
	setup_mock_highlight_api,
	restore_globals,
	create_code_element,
	create_code_element_with_comment,
	type SavedGlobals
} from './highlight_test_helpers.ts';

/**
 * Test suite for HighlightManager, which builds CSS Custom Highlight API ranges
 * directly from a lexed flat event stream (`LexedSyntax`).
 *
 * `build_lexed` constructs a `LexedSyntax` from a nested token spec — a leaf is
 * emitted as `[id, start, end]`, a container (with `children`) as
 * `[-id, start] … [0, end]` — mirroring the lexer's event encoding.
 */

interface TokenSpec {
	type: string;
	start: number;
	end: number;
	alias?: string | Array<string>;
	children?: Array<TokenSpec>;
}

const build_lexed = (text: string, specs: Array<TokenSpec>): LexedSyntax => {
	const types = new TokenTypeRegistry();
	const events: Array<number> = [];
	const emit = (spec: TokenSpec): void => {
		const id = types.intern(spec.type, spec.alias);
		if (spec.children && spec.children.length > 0) {
			events.push(-id, spec.start);
			for (const child of spec.children) emit(child);
			events.push(0, spec.end);
		} else {
			events.push(id, spec.start, spec.end);
		}
	};
	for (const spec of specs) emit(spec);
	return { text, events: Int32Array.from(events), events_len: events.length, types };
};

let saved_globals: SavedGlobals;

beforeEach(() => {
	saved_globals = setup_mock_highlight_api();
});

afterEach(() => {
	restore_globals(saved_globals);
});

describe('API detection', () => {
	test('supports_css_highlight_api returns true when API is available', () => {
		assert.ok(supports_css_highlight_api());
	});

	test('supports_css_highlight_api returns false when CSS is undefined', () => {
		const saved_css = (globalThis as any).CSS;
		delete (globalThis as any).CSS;
		assert.equal(supports_css_highlight_api(), false);
		(globalThis as any).CSS = saved_css;
	});

	test('supports_css_highlight_api returns false when CSS.highlights is undefined', () => {
		const saved_highlights = (globalThis as any).CSS.highlights;
		delete (globalThis as any).CSS.highlights;
		assert.equal(supports_css_highlight_api(), false);
		(globalThis as any).CSS.highlights = saved_highlights;
	});

	test('supports_css_highlight_api returns false when Highlight constructor is undefined', () => {
		const saved_highlight = (globalThis as any).Highlight;
		delete (globalThis as any).Highlight;
		assert.equal(supports_css_highlight_api(), false);
		(globalThis as any).Highlight = saved_highlight;
	});
});

describe('initialization', () => {
	test('constructor throws if CSS Highlight API is not supported', () => {
		const saved_css = (globalThis as any).CSS;
		delete (globalThis as any).CSS;
		assert.throws(() => new HighlightManager(), /CSS Highlights API not supported/);
		(globalThis as any).CSS = saved_css;
	});

	test('constructor initializes with empty element_ranges map', () => {
		const manager = new HighlightManager();
		assert.equal(manager.element_ranges.size, 0);
	});
});

describe('DOM element handling', () => {
	test('no-op when no text node and no events', () => {
		const manager = new HighlightManager();
		const element = { childNodes: [] } as unknown as Element;
		assert.doesNotThrow(() => manager.highlight_from_lexed(element, build_lexed('', [])));
		assert.equal(manager.element_ranges.size, 0);
	});

	test('finds the text node past leading comment nodes', () => {
		const manager = new HighlightManager();
		const element = create_code_element_with_comment('const x = 1;');
		const lexed = build_lexed('const x = 1;', [{ type: 'keyword', start: 0, end: 5 }]);
		assert.doesNotThrow(() => manager.highlight_from_lexed(element, lexed));
		assert.ok(manager.element_ranges.has('token_keyword'));
	});

	test('handles empty text node', () => {
		const manager = new HighlightManager();
		const element = create_code_element('');
		manager.highlight_from_lexed(element, build_lexed('', []));
		assert.equal(manager.element_ranges.size, 0);
	});
});

describe('range creation', () => {
	test('creates ranges for a simple token stream', () => {
		const manager = new HighlightManager();
		const element = create_code_element('const x = 1;');
		const lexed = build_lexed('const x = 1;', [
			{ type: 'keyword', start: 0, end: 5 },
			{ type: 'variable', start: 6, end: 7 },
			{ type: 'number', start: 10, end: 11 }
		]);

		manager.highlight_from_lexed(element, lexed);

		assert.equal(manager.element_ranges.size, 3);
		assert.ok(manager.element_ranges.has('token_keyword'));
		assert.ok(manager.element_ranges.has('token_variable'));
		assert.ok(manager.element_ranges.has('token_number'));
	});

	test('creates a range covering a leaf token', () => {
		const manager = new HighlightManager();
		const element = create_code_element('keyword');
		manager.highlight_from_lexed(
			element,
			build_lexed('keyword', [{ type: 'keyword', start: 0, end: 7 }])
		);

		const ranges = manager.element_ranges.get('token_keyword')!;
		assert.equal(ranges.length, 1);
		assert.equal(ranges[0]!.startOffset, 0);
		assert.equal(ranges[0]!.endOffset, 7);
	});

	test('creates ranges for nested container tokens', () => {
		const manager = new HighlightManager();
		const element = create_code_element('`hello ${name}`');
		// `hello ${name}` — template_string [0,15] > punctuation, interpolation [7,14]
		const lexed = build_lexed('`hello ${name}`', [
			{
				type: 'template_string',
				start: 0,
				end: 15,
				children: [
					{ type: 'punctuation', start: 0, end: 1 },
					{
						type: 'interpolation',
						start: 7,
						end: 14,
						children: [
							{ type: 'punctuation', start: 7, end: 9 },
							{ type: 'variable', start: 9, end: 13 },
							{ type: 'punctuation', start: 13, end: 14 }
						]
					},
					{ type: 'punctuation', start: 14, end: 15 }
				]
			}
		]);

		manager.highlight_from_lexed(element, lexed);

		assert.ok(manager.element_ranges.has('token_template_string'));
		assert.ok(manager.element_ranges.has('token_punctuation'));
		assert.ok(manager.element_ranges.has('token_interpolation'));
		assert.ok(manager.element_ranges.has('token_variable'));
		// the container spans the whole text
		const ts = manager.element_ranges.get('token_template_string')!;
		assert.equal(ts[0]!.startOffset, 0);
		assert.equal(ts[0]!.endOffset, 15);
	});

	test('creates ranges for deeply nested tokens (4 levels)', () => {
		const manager = new HighlightManager();
		const element = create_code_element('abcd');
		const lexed = build_lexed('abcd', [
			{
				type: 'level1',
				start: 0,
				end: 4,
				children: [
					{
						type: 'level2',
						start: 0,
						end: 4,
						children: [
							{
								type: 'level3',
								start: 0,
								end: 4,
								children: [{ type: 'level4', start: 0, end: 1 }]
							}
						]
					}
				]
			}
		]);

		manager.highlight_from_lexed(element, lexed);

		assert.ok(manager.element_ranges.has('token_level1'));
		assert.ok(manager.element_ranges.has('token_level2'));
		assert.ok(manager.element_ranges.has('token_level3'));
		assert.ok(manager.element_ranges.has('token_level4'));

		const level4_ranges = manager.element_ranges.get('token_level4')!;
		assert.equal(level4_ranges[0]!.startOffset, 0);
		assert.equal(level4_ranges[0]!.endOffset, 1);
	});

	test('tracks positions across sibling leaf tokens', () => {
		const manager = new HighlightManager();
		const element = create_code_element('a-b-c');
		const lexed = build_lexed('a-b-c', [
			{ type: 'part1', start: 0, end: 1 },
			{ type: 'part2', start: 2, end: 3 },
			{ type: 'part3', start: 4, end: 5 }
		]);

		manager.highlight_from_lexed(element, lexed);

		assert.equal(manager.element_ranges.get('token_part1')![0]!.startOffset, 0);
		assert.equal(manager.element_ranges.get('token_part1')![0]!.endOffset, 1);
		assert.equal(manager.element_ranges.get('token_part2')![0]!.startOffset, 2);
		assert.equal(manager.element_ranges.get('token_part2')![0]!.endOffset, 3);
		assert.equal(manager.element_ranges.get('token_part3')![0]!.startOffset, 4);
		assert.equal(manager.element_ranges.get('token_part3')![0]!.endOffset, 5);
	});

	test('shares one range across a token type and its aliases', () => {
		const manager = new HighlightManager();
		const element = create_code_element('function');
		const lexed = build_lexed('function', [
			{ type: 'keyword', start: 0, end: 8, alias: ['reserved', 'special_keyword'] }
		]);

		manager.highlight_from_lexed(element, lexed);

		assert.ok(manager.element_ranges.has('token_keyword'));
		assert.ok(manager.element_ranges.has('token_reserved'));
		assert.ok(manager.element_ranges.has('token_special_keyword'));

		assert.equal(manager.element_ranges.get('token_keyword')!.length, 1);
		assert.equal(manager.element_ranges.get('token_reserved')!.length, 1);
		assert.equal(manager.element_ranges.get('token_special_keyword')!.length, 1);

		// the SAME range object is reused across the type and its aliases
		const range = manager.element_ranges.get('token_keyword')![0];
		assert.equal(manager.element_ranges.get('token_reserved')![0], range);
		assert.equal(manager.element_ranges.get('token_special_keyword')![0], range);
	});

	test('falls back to live Range when StaticRange is unavailable', () => {
		const saved_static = (globalThis as any).StaticRange;
		delete (globalThis as any).StaticRange;
		try {
			const manager = new HighlightManager();
			const element = create_code_element('const');
			manager.highlight_from_lexed(
				element,
				build_lexed('const', [{ type: 'keyword', start: 0, end: 5 }])
			);

			const ranges = manager.element_ranges.get('token_keyword')!;
			assert.equal(ranges.length, 1);
			assert.equal(ranges[0]!.startOffset, 0);
			assert.equal(ranges[0]!.endOffset, 5);
		} finally {
			(globalThis as any).StaticRange = saved_static;
		}
	});

	test('downgrades to live Range if Highlight.add rejects StaticRange', () => {
		class RejectingHighlight extends Set<AbstractRange> {
			priority = 0;
			override add(range: AbstractRange): this {
				if (range instanceof (globalThis as any).StaticRange) {
					throw new Error('StaticRange not supported');
				}
				return super.add(range);
			}
		}
		const saved_highlight = (globalThis as any).Highlight;
		(globalThis as any).Highlight = RejectingHighlight;
		try {
			const manager = new HighlightManager();
			const element = create_code_element('const');
			const lexed = build_lexed('const', [{ type: 'keyword', start: 0, end: 5 }]);

			assert.doesNotThrow(() => manager.highlight_from_lexed(element, lexed));

			assert.ok(CSS.highlights.has('token_keyword'));
			assert.equal(CSS.highlights.get('token_keyword')!.size, 1);
			const range = manager.element_ranges.get('token_keyword')![0]!;
			assert.equal(range instanceof (globalThis as any).StaticRange, false);
		} finally {
			(globalThis as any).Highlight = saved_highlight;
		}
	});

	test('an event-free stream creates no ranges', () => {
		const manager = new HighlightManager();
		const element = create_code_element('plain text');
		manager.highlight_from_lexed(element, build_lexed('plain text', []));
		assert.equal(manager.element_ranges.size, 0);
	});

	test('adds ranges to the global CSS.highlights registry', () => {
		const manager = new HighlightManager();
		const element = create_code_element('const');
		assert.equal(CSS.highlights.size, 0);

		manager.highlight_from_lexed(
			element,
			build_lexed('const', [{ type: 'keyword', start: 0, end: 5 }])
		);

		assert.ok(CSS.highlights.has('token_keyword'));
		assert.equal(CSS.highlights.get('token_keyword')!.size, 1);
	});

	test('prefixes token types with "token_"', () => {
		const manager = new HighlightManager();
		const element = create_code_element('test');
		manager.highlight_from_lexed(
			element,
			build_lexed('test', [{ type: 'mytype', start: 0, end: 4 }])
		);

		assert.equal(CSS.highlights.has('mytype'), false);
		assert.ok(CSS.highlights.has('token_mytype'));
	});

	test('sets highlight priority from highlight_priorities', () => {
		const manager = new HighlightManager();
		const element = create_code_element('const');
		manager.highlight_from_lexed(
			element,
			build_lexed('const', [{ type: 'keyword', start: 0, end: 5 }])
		);

		// keyword has priority 2 according to highlight_priorities
		assert.equal(CSS.highlights.get('token_keyword')!.priority, 2);
	});
});

describe('bounds and multi-byte handling', () => {
	test('clamps a token whose end exceeds the text node length', () => {
		const manager = new HighlightManager();
		const element = create_code_element('abc'); // 3 chars
		// a DOM/source mismatch: the lexed text is longer than the element's text node
		const lexed = build_lexed('abcd', [{ type: 'bad', start: 0, end: 4 }]);

		assert.doesNotThrow(() => manager.highlight_from_lexed(element, lexed));

		const ranges = manager.element_ranges.get('token_bad')!;
		assert.equal(ranges[0]!.startOffset, 0);
		assert.equal(ranges[0]!.endOffset, 3); // clamped to text node length
	});

	test('skips a token that starts at or past the text node length', () => {
		const manager = new HighlightManager();
		const element = create_code_element('abc'); // 3 chars
		const lexed = build_lexed('abcdef', [{ type: 'past', start: 4, end: 6 }]);

		manager.highlight_from_lexed(element, lexed);
		// clamped end (3) <= start (4) -> no range
		assert.equal(manager.element_ranges.has('token_past'), false);
	});

	test('handles emoji and multi-byte characters by code-unit offsets', () => {
		const manager = new HighlightManager();
		const emoji = '🎨'; // 2 UTF-16 code units
		assert.equal(emoji.length, 2);
		const text = `${emoji} = 1;`;
		const element = create_code_element(text);
		const lexed = build_lexed(text, [
			{ type: 'variable', start: 0, end: 2 },
			{ type: 'number', start: 5, end: 6 }
		]);

		manager.highlight_from_lexed(element, lexed);

		const variable_ranges = manager.element_ranges.get('token_variable')!;
		const number_ranges = manager.element_ranges.get('token_number')!;
		assert.equal(variable_ranges[0]!.startOffset, 0);
		assert.equal(variable_ranges[0]!.endOffset, 2);
		assert.equal(number_ranges[0]!.startOffset, 5);
		assert.equal(number_ranges[0]!.endOffset, 6);
	});
});

describe('lifecycle management', () => {
	const const_lexed = () => build_lexed('const', [{ type: 'keyword', start: 0, end: 5 }]);

	test('clear_element_ranges removes ranges from CSS.highlights', () => {
		const manager = new HighlightManager();
		manager.highlight_from_lexed(create_code_element('const'), const_lexed());
		assert.ok(CSS.highlights.has('token_keyword'));

		manager.clear_element_ranges();
		assert.equal(CSS.highlights.has('token_keyword'), false);
	});

	test('clear_element_ranges only removes own ranges from shared highlights', () => {
		const manager1 = new HighlightManager();
		const manager2 = new HighlightManager();

		manager1.highlight_from_lexed(create_code_element('const'), const_lexed());
		manager2.highlight_from_lexed(create_code_element('const'), const_lexed());

		const highlight = CSS.highlights.get('token_keyword')!;
		assert.equal(highlight.size, 2);

		manager1.clear_element_ranges();
		assert.equal(highlight.size, 1);
		assert.ok(CSS.highlights.has('token_keyword'));
	});

	test('clear_element_ranges is a safe no-op if highlight already removed', () => {
		const manager = new HighlightManager();
		manager.highlight_from_lexed(create_code_element('const'), const_lexed());

		CSS.highlights.delete('token_keyword');

		assert.doesNotThrow(() => manager.clear_element_ranges());
		assert.equal(manager.element_ranges.size, 0);
	});

	test('clear_element_ranges deletes the highlight when the last range is removed', () => {
		const manager = new HighlightManager();
		manager.highlight_from_lexed(create_code_element('const'), const_lexed());
		assert.ok(CSS.highlights.has('token_keyword'));

		manager.clear_element_ranges();
		assert.equal(CSS.highlights.size, 0);
	});

	test('clear_element_ranges can be called multiple times safely', () => {
		const manager = new HighlightManager();
		manager.clear_element_ranges();
		manager.clear_element_ranges();
		assert.equal(manager.element_ranges.size, 0);
	});

	test('destroy calls clear_element_ranges', () => {
		const manager = new HighlightManager();
		manager.highlight_from_lexed(create_code_element('const'), const_lexed());
		assert.equal(manager.element_ranges.size, 1);

		manager.destroy();
		assert.equal(manager.element_ranges.size, 0);
		assert.equal(CSS.highlights.size, 0);
	});

	test('highlight_from_lexed clears previous highlights', () => {
		const manager = new HighlightManager();
		const element = create_code_element('const');

		manager.highlight_from_lexed(element, const_lexed());
		assert.ok(manager.element_ranges.has('token_keyword'));
		assert.equal(manager.element_ranges.size, 1);

		manager.highlight_from_lexed(
			element,
			build_lexed('const', [{ type: 'variable', start: 0, end: 5 }])
		);
		assert.equal(manager.element_ranges.has('token_keyword'), false);
		assert.ok(manager.element_ranges.has('token_variable'));
		assert.equal(manager.element_ranges.size, 1);
	});
});

describe('multiple managers', () => {
	test('multiple managers share the global CSS.highlights registry', () => {
		const manager1 = new HighlightManager();
		const manager2 = new HighlightManager();

		manager1.highlight_from_lexed(
			create_code_element('const'),
			build_lexed('const', [{ type: 'keyword', start: 0, end: 5 }])
		);
		manager2.highlight_from_lexed(
			create_code_element('let'),
			build_lexed('let', [{ type: 'keyword', start: 0, end: 3 }])
		);

		assert.equal(CSS.highlights.get('token_keyword')!.size, 2);
	});

	test('managers maintain independent element_ranges', () => {
		const manager1 = new HighlightManager();
		const manager2 = new HighlightManager();

		manager1.highlight_from_lexed(
			create_code_element('const'),
			build_lexed('const', [{ type: 'keyword', start: 0, end: 5 }])
		);
		manager2.highlight_from_lexed(
			create_code_element('let'),
			build_lexed('let', [{ type: 'keyword', start: 0, end: 3 }])
		);

		assert.equal(manager1.element_ranges.get('token_keyword')!.length, 1);
		assert.equal(manager2.element_ranges.get('token_keyword')!.length, 1);
		assert.notEqual(
			manager1.element_ranges.get('token_keyword')![0],
			manager2.element_ranges.get('token_keyword')![0]
		);
	});
});
