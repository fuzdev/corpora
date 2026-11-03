export const render_value_to_string = (value: unknown): string => {
	if (value === null) return 'null';
	if (value === undefined) return 'undefined';
	const type = typeof value;
	if (type === 'string') return `'${value}'`; // eslint-disable-line @typescript-eslint/no-base-to-string
	if (type === 'number' || type === 'boolean') return value + ''; // eslint-disable-line @typescript-eslint/no-base-to-string
	if (Array.isArray(value)) return `[${value.map(render_value_to_string).join(', ')}]`;
	if (type === 'object') return JSON.stringify(value);
	return value + ''; // eslint-disable-line @typescript-eslint/no-base-to-string
};

/**
 * Strips the whitespace prefix that a CSS custom property's multi-line
 * `fallback` shares across its continuation lines, so a value broken over
 * several stylesheet lines renders without the stylesheet's indentation.
 * Line endings normalize to `\n`, and whitespace-only lines become empty.
 *
 * @param fallback - the verbatim fallback source text
 * @returns the fallback with its continuation lines dedented
 */
export const dedent_css_fallback = (fallback: string): string => {
	const lines = fallback.split(/\r?\n/);
	if (lines.length === 1) return fallback;
	// svelte-docinfo trims the fallback, so the first line's original column is
	// lost — it stays as-is, and only the continuation lines are compared
	let prefix: string | undefined;
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i]!;
		if (!line.trim()) continue;
		const leading = /^[ \t]*/.exec(line)![0];
		if (prefix === undefined) {
			prefix = leading;
		} else {
			let j = 0;
			while (j < prefix.length && j < leading.length && prefix[j] === leading[j]) j++;
			prefix = prefix.slice(0, j);
		}
	}
	const width = prefix?.length ?? 0;
	return lines.map((line, i) => (i === 0 ? line : line.trim() ? line.slice(width) : '')).join('\n');
};
