/**
 * Runs `fn` in an `$effect`, passing `true` as the `skip` argument for the first `count` runs.
 * Calls `fn` even when skipping so callers can read any dependent signals.
 */
export const effect_with_count = (fn: (count: number) => void, initial = 0): void => {
	let count = initial;
	$effect(() => {
		fn(++count);
	});
};
