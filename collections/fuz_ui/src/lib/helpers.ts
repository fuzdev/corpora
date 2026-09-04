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
