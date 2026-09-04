import { BROWSER } from 'esm-env';

// TODO more than just localStorage, maybe rework the module

/**
 * Utility function to save a value to `localStorage`.
 */
export const save_to_storage = (key: string, value: any, is_json = false): void => {
	if (!BROWSER) return;
	if (value !== null) {
		try {
			localStorage.setItem(key, is_json ? JSON.stringify(value) : value);
			return;
		} catch (_) {}
	}
	localStorage.removeItem(key); // remove if null or error
};

/**
 * Utility function to load a value from `localStorage` with optional parsing
 * @param key - the localStorage key
 * @param is_json - whether to parse the value as JSON
 * @param parse_fn - optional custom parsing function to transform the value
 * @returns the parsed value or null if not found or parsing fails
 */
export const load_from_storage = <T>(
	key: string,
	is_json = false,
	parse_fn?: (value: unknown) => T | null
): T | null => {
	if (!BROWSER) return null;
	try {
		const loaded = localStorage.getItem(key);
		if (loaded === null) return null;

		// First handle JSON parsing if requested
		const value = is_json ? JSON.parse(loaded) : loaded;

		// Then apply the custom parse function if provided
		if (parse_fn) {
			return parse_fn(value);
		}

		return value;
	} catch (_) {
		return null;
	}
};
