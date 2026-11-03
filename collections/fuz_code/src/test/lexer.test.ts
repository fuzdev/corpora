import { describe, test, assert } from 'vitest';

import {
	advance_probe,
	copy_lexed_syntax,
	Lexer,
	lex_syntax,
	PROBE_NOT_FOUND,
	render_syntax_html,
	syntax_events_to_tokens,
	token_type,
	token_types_global,
	TokenTypeRegistry,
	validate_syntax_events,
	EMBED_UNAVAILABLE,
	WordIndex,
	words_map,
	type LexedSyntax,
	type SyntaxLang
} from '#lib/lexer.ts';

const T_A = token_type('test_a');
const T_B = token_type('test_b');
const T_ALIASED = token_type('test_aliased', ['test_alias_1', 'test_alias_2']);
const T_CONTAINER = token_type('test_container');

const lexed_of = (text: string, build: (l: Lexer) => void): LexedSyntax => {
	const lexer = new Lexer();
	lexer.text = text;
	lexer.end = text.length;
	build(lexer);
	return { text, events: lexer.events, events_len: lexer.events_len, types: token_types_global };
};

describe('token_type', () => {
	test('interns by name and aliases', () => {
		assert.strictEqual(token_type('test_a'), T_A);
		assert.notStrictEqual(token_type('test_a', 'other'), T_A);
	});

	test('precomputes classes and open tag', () => {
		const info = token_types_global.info(T_ALIASED);
		assert.strictEqual(info.classes, 'token_test_aliased token_test_alias_1 token_test_alias_2');
		assert.strictEqual(info.open_tag, `<span class="${info.classes}">`);
	});
});

describe('TokenTypeRegistry', () => {
	test('isolates id spaces per registry', () => {
		const types = new TokenTypeRegistry();
		const global_size = token_types_global.infos.length;
		const t_word = types.intern('word');
		// a fresh registry starts its own id space at 1 (0 is the close tag)
		assert.strictEqual(t_word, 1);
		assert.strictEqual(types.intern('word'), t_word);
		// interning into the isolated registry leaves the global one untouched
		assert.strictEqual(token_types_global.infos.length, global_size);

		const lang: SyntaxLang = {
			id: 'test_isolated',
			lex: (l) => {
				l.leaf(t_word, 0, 4);
				l.pos = l.end;
			}
		};
		const lexed = lex_syntax('abcd', lang, undefined, types);
		assert.strictEqual(lexed.types, types);
		assert.deepEqual(validate_syntax_events(lexed), []);
		assert.strictEqual(render_syntax_html(lexed), '<span class="token_word">abcd</span>');
		assert.deepEqual(syntax_events_to_tokens(lexed), [{ type: 'word', start: 0, end: 4 }]);
	});
});

describe('Lexer', () => {
	test('coalesces adjacent same-type leaves', () => {
		const lexed = lexed_of('abcdef', (l) => {
			l.leaf(T_A, 0, 2);
			l.leaf(T_A, 2, 4);
			l.leaf(T_B, 4, 5);
		});
		assert.deepEqual(syntax_events_to_tokens(lexed), [
			{ type: 'test_a', start: 0, end: 4 },
			{ type: 'test_b', start: 4, end: 5 }
		]);
	});

	test('does not coalesce across gaps or containers', () => {
		const lexed = lexed_of('abcdef', (l) => {
			l.leaf(T_A, 0, 1);
			l.leaf(T_A, 2, 3); // gap between 1 and 2
			l.open(T_CONTAINER, 3);
			l.leaf(T_A, 3, 4);
			l.close(4);
			l.leaf(T_A, 4, 5); // adjacent but separated by a close event
		});
		const tokens = syntax_events_to_tokens(lexed);
		assert.strictEqual(tokens.length, 5);
	});

	test('drops empty leaves', () => {
		const lexed = lexed_of('ab', (l) => {
			l.leaf(T_A, 1, 1);
		});
		assert.strictEqual(lexed.events_len, 0);
	});

	test('grows the event buffer', () => {
		const lexed = lexed_of('x'.repeat(2000), (l) => {
			for (let i = 0; i < 1000; i++) {
				l.leaf(i % 2 === 0 ? T_A : T_B, i * 2, i * 2 + 2);
			}
		});
		assert.strictEqual(syntax_events_to_tokens(lexed).length, 1000);
		assert.deepEqual(validate_syntax_events(lexed), []);
	});
});

describe('lex_syntax', () => {
	// one leaf per word of lowercase letters
	const lang_words: SyntaxLang = {
		id: 'test_words',
		lex: (l) => {
			let i = l.pos;
			while (i < l.end) {
				const start = i;
				while (i < l.end && l.text.charCodeAt(i) !== 32) i++;
				l.leaf(start % 2 ? T_A : T_B, start, i);
				i++;
			}
			l.pos = l.end;
		}
	};

	test('reuses one buffer, so a kept result needs copy_lexed_syntax', () => {
		const first = lex_syntax('aa bb cc', lang_words);
		const tokens = syntax_events_to_tokens(first);
		const kept = copy_lexed_syntax(first);
		assert.strictEqual(kept.events.length, kept.events_len);
		const second = lex_syntax('dddddddd eeeeeeee', lang_words);
		assert.strictEqual(second.events, first.events);
		assert.notDeepEqual(syntax_events_to_tokens(first), tokens);
		assert.deepEqual(syntax_events_to_tokens(kept), tokens);
	});

	test('a lexer that calls lex_syntax gets a buffer of its own', () => {
		let inner: LexedSyntax | null = null;
		const lang_outer: SyntaxLang = {
			id: 'test_reentrant',
			lex: (l) => {
				l.leaf(T_A, 0, 2);
				inner = lex_syntax('xx yy', lang_words);
				l.leaf(T_B, 3, 5);
				l.pos = l.end;
			}
		};
		const outer = lex_syntax('aa bb', lang_outer);
		assert.deepEqual(syntax_events_to_tokens(outer), [
			{ type: 'test_a', start: 0, end: 2 },
			{ type: 'test_b', start: 3, end: 5 }
		]);
		assert(inner);
		assert.deepEqual(syntax_events_to_tokens(inner), [
			{ type: 'test_b', start: 0, end: 2 },
			{ type: 'test_a', start: 3, end: 5 }
		]);
	});

	test('grows past the scratch buffer and past the retained size', () => {
		const big = 'ab '.repeat(200_000);
		const lexed = lex_syntax(big, lang_words);
		assert.strictEqual(lexed.events_len, 200_000 * 3);
		assert.deepEqual(validate_syntax_events(lexed), []);
		// a small lex after an outsized one still works from a retained buffer
		assert.deepEqual(syntax_events_to_tokens(lex_syntax('aa', lang_words)), [
			{ type: 'test_b', start: 0, end: 2 }
		]);
	});
});

describe('WordIndex', () => {
	const index = new WordIndex([
		['as', 1],
		['async', 2],
		['await', 3],
		['a', 4],
		['in', 5],
		['interface', -6]
	]);

	test("finds a span by its words, returning the word's value", () => {
		const text = 'x async await as a in interface';
		assert.strictEqual(index.find(text, 2, 7), 2);
		assert.strictEqual(index.find(text, 8, 13), 3);
		assert.strictEqual(index.find(text, 14, 16), 1);
		assert.strictEqual(index.find(text, 17, 18), 4);
		assert.strictEqual(index.find(text, 19, 21), 5);
		assert.strictEqual(index.find(text, 22, 31), -6);
	});

	test('misses spans that are not words of the table', () => {
		const text = 'asyncs asynx awai x é inn';
		assert.strictEqual(index.find(text, 0, 6), 0); // longer
		assert.strictEqual(index.find(text, 7, 12), 0); // same length and first char
		assert.strictEqual(index.find(text, 13, 17), 0); // a prefix of a word
		assert.strictEqual(index.find(text, 18, 19), 0); // no word starts with it
		assert.strictEqual(index.find(text, 20, 21), 0); // non-ASCII
		assert.strictEqual(index.find(text, 22, 25), 0);
		assert.strictEqual(index.find(text, 0, 30), 0); // past the longest word
	});

	test('takes the entries of a `words_map`, a repeated word keeping its last value', () => {
		const words = new WordIndex([...words_map([1, 'if else'], [2, 'true']), ['if', 9]]);
		assert.strictEqual(words.find('if else true', 0, 2), 9);
		assert.strictEqual(words.find('if else true', 3, 7), 1);
		assert.strictEqual(words.find('if else true', 8, 12), 2);
	});

	test('rejects entries it cannot index', () => {
		assert.throws(
			() =>
				new WordIndex([
					['ok', 1],
					['', 1]
				]),
			/empty word/
		);
		assert.throws(() => new WordIndex([['café', 1]]), /not an ASCII word/);
		assert.throws(() => new WordIndex([['ok', 0]]), /non-zero 32-bit integer/);
		assert.throws(() => new WordIndex([['ok', 1.5]]), /non-zero 32-bit integer/);
		assert.throws(() => new WordIndex([['ok', 2 ** 31]]), /non-zero 32-bit integer/);
	});
});

describe('advance_probe', () => {
	test('probes, reuses, and re-probes monotonically', () => {
		// fresh cache probes from `from`
		assert.strictEqual(advance_probe('a&b&c', -1, 0, '&'), 1);
		// a cached position at or ahead of `from` is reused as-is
		assert.strictEqual(advance_probe('a&b&c', 3, 2, '&'), 3);
		assert.strictEqual(advance_probe('a&b&c', 1, 1, '&'), 1);
		// a cached position behind `from` re-probes
		assert.strictEqual(advance_probe('a&b&c', 1, 2, '&'), 3);
	});

	test('no further occurrence is PROBE_NOT_FOUND, and it persists', () => {
		assert.strictEqual(advance_probe('abc', -1, 0, '&'), PROBE_NOT_FOUND);
		assert.strictEqual(advance_probe('abc', PROBE_NOT_FOUND, 2, '&'), PROBE_NOT_FOUND);
	});

	test('PROBE_NOT_FOUND is a small integer past any string index', () => {
		// a double would change the probe caches' field representation
		assert.ok(Number.isInteger(PROBE_NOT_FOUND));
		// within a Smi under pointer compression, the narrower case
		assert.ok(PROBE_NOT_FOUND <= 2 ** 30 - 1);
		// past V8's 64-bit string length cap, `2 ** 29 - 24`
		assert.ok(PROBE_NOT_FOUND > 2 ** 29 - 24);
	});
});

describe('render_syntax_html', () => {
	test('renders leaves with gaps', () => {
		const lexed = lexed_of('a b c', (l) => {
			l.leaf(T_A, 0, 1);
			l.leaf(T_B, 4, 5);
		});
		assert.strictEqual(
			render_syntax_html(lexed),
			'<span class="token_test_a">a</span> b <span class="token_test_b">c</span>'
		);
	});

	test('renders nested containers', () => {
		const lexed = lexed_of('abc', (l) => {
			l.open(T_CONTAINER, 0);
			l.leaf(T_A, 1, 2);
			l.close(3);
		});
		assert.strictEqual(
			render_syntax_html(lexed),
			'<span class="token_test_container">a<span class="token_test_a">b</span>c</span>'
		);
	});

	test('escapes text content', () => {
		const lexed = lexed_of('a & <b> c', (l) => {
			l.leaf(T_A, 4, 7);
		});
		assert.strictEqual(
			render_syntax_html(lexed),
			'a &amp; <span class="token_test_a">&lt;b></span> c'
		);
	});

	test('normalizes non-breaking spaces to regular spaces', () => {
		// U+00A0 in a token span and in gap text both render as a normal space
		const lexed = lexed_of('a\u00a0b\u00a0c', (l) => {
			l.leaf(T_A, 0, 3); // 'a\u00a0b'
		});
		assert.strictEqual(render_syntax_html(lexed), '<span class="token_test_a">a b</span> c');
	});

	test('renders one-char leaves, escaped, the same from the cache', () => {
		const lexed = lexed_of('a<&;\u00a0\u00e9', (l) => {
			l.leaf(T_A, 0, 1);
			l.leaf(T_B, 1, 2);
			l.leaf(T_A, 2, 3);
			l.leaf(T_B, 3, 4);
			l.leaf(T_A, 4, 5); // nbsp
			l.leaf(T_B, 5, 6); // past ascii, so not cached
		});
		const expected =
			'<span class="token_test_a">a</span><span class="token_test_b">&lt;</span>' +
			'<span class="token_test_a">&amp;</span><span class="token_test_b">;</span>' +
			'<span class="token_test_a"> </span><span class="token_test_b">\u00e9</span>';
		assert.strictEqual(render_syntax_html(lexed), expected);
		assert.strictEqual(render_syntax_html(lexed), expected);
		const spans = token_types_global.info(T_B).char_spans;
		assert(spans !== null);
		assert.strictEqual(spans[60], '<span class="token_test_b">&lt;</span>');
		assert.strictEqual(spans[65], '');
	});

	test('escapes text wherever it falls', () => {
		// an escape in the gap before each kind of event, in a leaf, and in the tail
		const text = '<a x &b; <(c<d)e& f <g';
		const lexed = lexed_of(text, (l) => {
			l.leaf(T_A, 3, 4); // 'x', one char, after a gap with `<`
			l.leaf(T_B, 5, 7); // '&b'
			l.open(T_CONTAINER, 10); // after a gap with `<`
			l.leaf(T_A, 11, 14); // 'c<d'
			l.close(17); // after a gap with `&`
		});
		assert.strictEqual(
			render_syntax_html(lexed),
			'&lt;a <span class="token_test_a">x</span> <span class="token_test_b">&amp;b</span>; &lt;' +
				'<span class="token_test_container">(<span class="token_test_a">c&lt;d</span>)e&amp;</span>' +
				' f &lt;g'
		);
	});

	test('renders text with no events, escaped or not', () => {
		assert.strictEqual(render_syntax_html(lexed_of('plain text', () => {})), 'plain text');
		assert.strictEqual(
			render_syntax_html(lexed_of('a < b\u00a0& c', () => {})),
			'a &lt; b &amp; c'
		);
	});

	test('caches one-char spans per registry', () => {
		const types = new TokenTypeRegistry();
		const id = types.intern('test_other');
		const lexer = new Lexer();
		lexer.text = ';';
		lexer.end = 1;
		lexer.leaf(id, 0, 1);
		const lexed = { text: ';', events: lexer.events, events_len: lexer.events_len, types };
		assert.strictEqual(render_syntax_html(lexed), '<span class="token_test_other">;</span>');
		assert.strictEqual(types.info(id).char_spans?.[59], '<span class="token_test_other">;</span>');
	});
});

describe('validate_syntax_events', () => {
	test('flags overlapping leaves', () => {
		const lexed = lexed_of('abcdef', (l) => {
			l.leaf(T_A, 0, 3);
			l.leaf(T_B, 2, 4);
		});
		assert.isNotEmpty(validate_syntax_events(lexed));
	});

	test('flags unclosed containers', () => {
		const lexed = lexed_of('abc', (l) => {
			l.open(T_CONTAINER, 0);
		});
		assert.isNotEmpty(validate_syntax_events(lexed));
	});

	test('accepts a valid stream', () => {
		const lexed = lexed_of('abcdef', (l) => {
			l.leaf(T_A, 0, 2);
			l.open(T_CONTAINER, 2);
			l.leaf(T_B, 2, 3);
			l.leaf(T_A, 3, 4);
			l.close(5);
			l.leaf(T_B, 5, 6);
		});
		assert.deepEqual(validate_syntax_events(lexed), []);
	});
});

describe('embed', () => {
	test('lexes a window with another registered language', () => {
		const inner: SyntaxLang = {
			id: 'test_inner',
			lex: (l) => {
				l.leaf(T_B, l.pos, l.end);
				l.pos = l.end;
			}
		};
		const outer: SyntaxLang = {
			id: 'test_outer',
			lex: (l) => {
				l.open(T_CONTAINER, 0);
				l.embed('test_inner', 1, 3);
				l.close(4);
				l.pos = l.end;
			}
		};
		const langs = new Map([
			['test_inner', inner],
			['test_outer', outer]
		]);
		const lexed = lex_syntax('abcd', outer, langs);
		assert.deepEqual(validate_syntax_events(lexed), []);
		assert.deepEqual(syntax_events_to_tokens(lexed), [
			{ type: 'test_container', start: 0, end: 4 },
			{ type: 'test_b', start: 1, end: 3 }
		]);
	});
});

describe('embed_to_brace', () => {
	// lexes one leaf up to the first `}`
	const inner: SyntaxLang = {
		id: 'test_inner',
		lex: (l) => {
			l.pos = l.end;
		},
		lex_to_brace: (l) => {
			const close = l.text.indexOf('}', l.pos);
			const found = close !== -1 && close < l.end;
			l.leaf(T_B, l.pos, found ? close : l.end);
			l.pos = found ? close : l.end;
			return found ? close : -1;
		}
	};
	const lex_with = (text: string, lang_id: string, langs: Array<SyntaxLang>): Array<number> => {
		const results: Array<number> = [];
		const outer: SyntaxLang = {
			id: 'test_outer',
			lex: (l) => {
				results.push(l.embed_to_brace(lang_id, 1, l.end));
				// the host's window is restored
				results.push(l.pos, l.end);
				l.pos = l.end;
			}
		};
		const lexed = lex_syntax(text, outer, new Map(langs.map((lang) => [lang.id, lang])));
		assert.deepEqual(validate_syntax_events(lexed), []);
		return results;
	};

	test('returns the brace the language found', () => {
		assert.deepEqual(lex_with('{ab}c', 'test_inner', [inner]), [3, 0, 5]);
	});

	test('returns -1 when the region runs to the end', () => {
		assert.deepEqual(lex_with('{abc', 'test_inner', [inner]), [-1, 0, 4]);
	});

	test('lexes nothing for an unregistered language or one without `lex_to_brace`', () => {
		const plain: SyntaxLang = { id: 'test_plain', lex: inner.lex };
		assert.deepEqual(lex_with('{ab}', 'test_missing', [inner]), [EMBED_UNAVAILABLE, 0, 4]);
		assert.deepEqual(lex_with('{ab}', 'test_plain', [plain]), [EMBED_UNAVAILABLE, 0, 4]);
	});
});
