/**
 * @vitest-environment jsdom
 */
import { test, assert, describe, beforeEach, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';

import { intersect } from '$lib/intersect.svelte.ts';

// Mock IntersectionObserver
let observer_callback: IntersectionObserverCallback | null = null;
let observer_options: IntersectionObserverInit | undefined = undefined;
let observed_elements: Array<Element> = [];
let disconnected = false;

class MockIntersectionObserver implements IntersectionObserver {
	readonly root: Element | Document | null = null;
	readonly rootMargin: string = '';
	readonly thresholds: ReadonlyArray<number> = [];

	constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
		observer_callback = callback;
		observer_options = options;
		disconnected = false;
	}

	observe(target: Element): void {
		observed_elements.push(target);
	}

	unobserve(_target: Element): void {
		// not implemented for these tests
	}

	disconnect(): void {
		disconnected = true;
		observer_callback = null;
		observer_options = undefined;
		observed_elements = [];
	}

	takeRecords(): Array<IntersectionObserverEntry> {
		return [];
	}
}

// Helper to trigger intersection callback
const trigger_intersection = (isIntersecting: boolean): void => {
	if (!observer_callback) throw new Error('No observer callback');
	const entry = {
		isIntersecting,
		target: observed_elements[0]
	} as IntersectionObserverEntry;
	observer_callback([entry], observer_callback as any);
};

// Install mock globally
beforeEach(() => {
	global.IntersectionObserver = MockIntersectionObserver;
	observer_callback = null;
	observer_options = undefined;
	observed_elements = [];
	disconnected = false;
});

describe('intersect', () => {
	let el: HTMLElement;
	let cleanup: (() => void) | void;
	let effect_cleanup: (() => void) | void;

	beforeEach(() => {
		el = document.createElement('div');
	});

	afterEach(() => {
		if (cleanup) {
			cleanup();
			cleanup = undefined;
		}
		if (effect_cleanup) {
			effect_cleanup();
			effect_cleanup = undefined;
		}
	});

	describe('basic functionality', () => {
		test('creates observer and observes element with simple callback', () => {
			effect_cleanup = $effect.root(() => {
				const callback = vi.fn();
				cleanup = intersect(() => callback)(el);
				flushSync();

				assert.ok(observer_callback, 'observer should be created');
				assert.strictEqual(observed_elements.length, 1, 'element should be observed');
				assert.strictEqual(observed_elements[0], el);
			});
		});

		test('calls callback when element intersects', () => {
			effect_cleanup = $effect.root(() => {
				const callback = vi.fn();
				cleanup = intersect(() => callback)(el);
				flushSync();

				trigger_intersection(true);

				assert.strictEqual(callback.mock.calls.length, 1);
				assert.strictEqual(callback.mock.calls[0]![0].intersecting, true);
				assert.strictEqual(callback.mock.calls[0]![0].intersections, 0);
			});
		});

		test('tracks intersections count', () => {
			effect_cleanup = $effect.root(() => {
				const callback = vi.fn();
				cleanup = intersect(() => callback)(el);
				flushSync();

				// Enter viewport
				trigger_intersection(true);
				assert.strictEqual(callback.mock.calls[0]![0].intersections, 0);

				// Leave viewport
				trigger_intersection(false);
				assert.strictEqual(callback.mock.calls[1]![0].intersections, 1);

				// Enter again
				trigger_intersection(true);
				assert.strictEqual(callback.mock.calls[2]![0].intersections, 1);

				// Leave again
				trigger_intersection(false);
				assert.strictEqual(callback.mock.calls[3]![0].intersections, 2);
			});
		});

		test('provides disconnect function to callback', () => {
			effect_cleanup = $effect.root(() => {
				const callback = vi.fn();
				cleanup = intersect(() => callback)(el);
				flushSync();

				trigger_intersection(true);

				assert.ok(callback.mock.calls[0]![0].disconnect, 'disconnect should be provided');
				assert.strictEqual(typeof callback.mock.calls[0]![0].disconnect, 'function');
			});
		});

		test('provides observer reference to callback', () => {
			effect_cleanup = $effect.root(() => {
				const callback = vi.fn();
				cleanup = intersect(() => callback)(el);
				flushSync();

				trigger_intersection(true);

				assert.ok(callback.mock.calls[0]![0].observer, 'observer should be provided');
			});
		});

		test('provides element reference to callback', () => {
			effect_cleanup = $effect.root(() => {
				const callback = vi.fn();
				cleanup = intersect(() => callback)(el);
				flushSync();

				trigger_intersection(true);

				assert.strictEqual(callback.mock.calls[0]![0].el, el);
			});
		});
	});

	describe('params object', () => {
		test('accepts params object with onintersect', () => {
			effect_cleanup = $effect.root(() => {
				const onintersect = vi.fn();
				cleanup = intersect(() => ({ onintersect }))(el);
				flushSync();

				trigger_intersection(true);

				assert.strictEqual(onintersect.mock.calls.length, 1);
			});
		});

		test('accepts params object with options', () => {
			effect_cleanup = $effect.root(() => {
				const callback = vi.fn();
				const options = { threshold: 0.5 };
				cleanup = intersect(() => ({ onintersect: callback, options }))(el);
				flushSync();

				assert.deepEqual(observer_options, options);
			});
		});

		test('calls ondisconnect when disconnected', () => {
			effect_cleanup = $effect.root(() => {
				const onintersect = vi.fn();
				const ondisconnect = vi.fn();
				cleanup = intersect(() => ({ onintersect, ondisconnect }))(el);
				flushSync();

				trigger_intersection(true);

				cleanup!();

				assert.strictEqual(ondisconnect.mock.calls.length, 1);
				assert.strictEqual(ondisconnect.mock.calls[0]![0].intersecting, true);
				// After entering viewport once, intersections counter is incremented to 1
				assert.strictEqual(ondisconnect.mock.calls[0]![0].intersections, 1);
			});
		});
	});

	describe('count feature', () => {
		test('disconnects after count intersections when leaving viewport', () => {
			effect_cleanup = $effect.root(() => {
				const callback = vi.fn();
				cleanup = intersect(() => ({ onintersect: callback, count: 2 }))(el);
				flushSync();

				// First intersection
				trigger_intersection(true);
				trigger_intersection(false);
				assert.strictEqual(disconnected, false, 'should not disconnect after 1');

				// Second intersection
				trigger_intersection(true);
				trigger_intersection(false);
				assert.strictEqual(disconnected, true, 'should disconnect after 2');
			});
		});

		test('count of 0 disables observer', () => {
			effect_cleanup = $effect.root(() => {
				const callback = vi.fn();
				cleanup = intersect(() => ({ onintersect: callback, count: 0 }))(el);
				flushSync();

				assert.strictEqual(observer_callback, null, 'observer should not be created');
			});
		});

		test('count of 1 disconnects after first intersection cycle', () => {
			effect_cleanup = $effect.root(() => {
				const callback = vi.fn();
				cleanup = intersect(() => ({ onintersect: callback, count: 1 }))(el);
				flushSync();

				trigger_intersection(true);
				assert.strictEqual(disconnected, false, 'should not disconnect while intersecting');

				trigger_intersection(false);
				assert.strictEqual(disconnected, true, 'should disconnect after leaving viewport');
			});
		});

		test('negative count never disconnects', () => {
			effect_cleanup = $effect.root(() => {
				const callback = vi.fn();
				cleanup = intersect(() => ({ onintersect: callback, count: -1 }))(el);
				flushSync();

				// Multiple intersection cycles
				for (let i = 0; i < 10; i++) {
					trigger_intersection(true);
					trigger_intersection(false);
				}

				assert.strictEqual(disconnected, false, 'should never disconnect');
			});
		});

		test('undefined count never disconnects', () => {
			effect_cleanup = $effect.root(() => {
				const callback = vi.fn();
				cleanup = intersect(() => ({ onintersect: callback, count: undefined }))(el);
				flushSync();

				// Multiple intersection cycles
				for (let i = 0; i < 10; i++) {
					trigger_intersection(true);
					trigger_intersection(false);
				}

				assert.strictEqual(disconnected, false, 'should never disconnect');
			});
		});
	});

	describe('conditional enabling', () => {
		test('null params does not create observer', () => {
			effect_cleanup = $effect.root(() => {
				cleanup = intersect(() => null)(el);
				flushSync();

				assert.strictEqual(observer_callback, null, 'observer should not be created');
			});
		});

		test('undefined params does not create observer', () => {
			effect_cleanup = $effect.root(() => {
				cleanup = intersect(() => undefined)(el);
				flushSync();

				assert.strictEqual(observer_callback, null, 'observer should not be created');
			});
		});

		test('changing from callback to null disconnects observer', () => {
			effect_cleanup = $effect.root(() => {
				let enabled = $state(true);
				const callback = vi.fn();
				cleanup = intersect(() => (enabled ? callback : null))(el);
				flushSync();

				assert.ok(observer_callback, 'observer should be created initially');

				enabled = false;
				flushSync();

				assert.strictEqual(disconnected, true, 'observer should be disconnected');
			});
		});

		test('changing from null to callback creates observer', () => {
			effect_cleanup = $effect.root(() => {
				let enabled = $state(false);
				const callback = vi.fn();
				cleanup = intersect(() => (enabled ? callback : null))(el);
				flushSync();

				assert.strictEqual(observer_callback, null, 'observer should not be created initially');

				enabled = true;
				flushSync();

				assert.ok(observer_callback, 'observer should be created');
			});
		});
	});

	describe('reactivity - callback changes', () => {
		test('changing callback does not recreate observer', () => {
			effect_cleanup = $effect.root(() => {
				let callback_version = $state(1);
				const callback1 = vi.fn();
				const callback2 = vi.fn();

				cleanup = intersect(() => (callback_version === 1 ? callback1 : callback2))(el);
				flushSync();

				const first_observer_callback = observer_callback;
				const first_options = observer_options;

				// Change callback
				callback_version = 2;
				flushSync();

				// Observer should not be recreated
				assert.strictEqual(
					observer_callback,
					first_observer_callback,
					'observer callback should be the same'
				);
				assert.strictEqual(observer_options, first_options, 'observer options should be the same');
			});
		});

		test('changing callback preserves intersections count', () => {
			effect_cleanup = $effect.root(() => {
				let callback_version = $state(1);
				const callback1 = vi.fn();
				const callback2 = vi.fn();

				cleanup = intersect(() => (callback_version === 1 ? callback1 : callback2))(el);
				flushSync();

				// First intersection with callback1
				trigger_intersection(true);
				assert.strictEqual(callback1.mock.calls[0]![0].intersections, 0);

				trigger_intersection(false);
				assert.strictEqual(callback1.mock.calls[1]![0].intersections, 1);

				// Change callback
				callback_version = 2;
				flushSync();

				// Second intersection with callback2 should preserve count
				trigger_intersection(true);
				assert.strictEqual(
					callback2.mock.calls[0]![0].intersections,
					1,
					'count should be preserved'
				);
			});
		});

		test('new callback receives subsequent intersection events', () => {
			effect_cleanup = $effect.root(() => {
				let callback_version = $state(1);
				const callback1 = vi.fn();
				const callback2 = vi.fn();

				cleanup = intersect(() => (callback_version === 1 ? callback1 : callback2))(el);
				flushSync();

				trigger_intersection(true);
				assert.strictEqual(callback1.mock.calls.length, 1);
				assert.strictEqual(callback2.mock.calls.length, 0);

				// Change callback
				callback_version = 2;
				flushSync();

				trigger_intersection(false);
				// Old callback should not be called again
				assert.strictEqual(callback1.mock.calls.length, 1);
				// New callback should be called
				assert.strictEqual(callback2.mock.calls.length, 1);
			});
		});
	});

	describe('reactivity - options changes', () => {
		test('changing options recreates observer', () => {
			effect_cleanup = $effect.root(() => {
				let threshold = $state(0.5);
				const callback = vi.fn();

				cleanup = intersect(() => ({
					onintersect: callback,
					options: { threshold }
				}))(el);
				flushSync();

				const first_observer_callback = observer_callback;
				assert.deepEqual(observer_options, { threshold: 0.5 });

				// Change options
				threshold = 0.8;
				flushSync();

				// Observer should be recreated
				assert.notStrictEqual(
					observer_callback,
					first_observer_callback,
					'observer should be recreated'
				);
				assert.deepEqual(observer_options, { threshold: 0.8 });
			});
		});

		test('changing options resets intersections count', () => {
			effect_cleanup = $effect.root(() => {
				let threshold = $state(0.5);
				const callback = vi.fn();

				cleanup = intersect(() => ({
					onintersect: callback,
					options: { threshold }
				}))(el);
				flushSync();

				// First intersection
				trigger_intersection(true);
				trigger_intersection(false);
				assert.strictEqual(callback.mock.calls[1]![0].intersections, 1);

				// Change options (recreates observer)
				threshold = 0.8;
				flushSync();

				// Count should be reset
				trigger_intersection(true);
				assert.strictEqual(
					callback.mock.calls[2]![0].intersections,
					0,
					'count should be reset to 0'
				);
			});
		});

		test('changing from undefined to defined options recreates observer', () => {
			effect_cleanup = $effect.root(() => {
				let has_options = $state(false);
				const callback = vi.fn();

				cleanup = intersect(() => ({
					onintersect: callback,
					options: has_options ? { threshold: 0.5 } : undefined
				}))(el);
				flushSync();

				const first_observer_callback = observer_callback;
				assert.strictEqual(observer_options, undefined);

				// Add options
				has_options = true;
				flushSync();

				assert.notStrictEqual(observer_callback, first_observer_callback);
				assert.deepEqual(observer_options, { threshold: 0.5 });
			});
		});

		test('changing from defined to undefined options recreates observer', () => {
			effect_cleanup = $effect.root(() => {
				let has_options = $state(true);
				const callback = vi.fn();

				cleanup = intersect(() => ({
					onintersect: callback,
					options: has_options ? { threshold: 0.5 } : undefined
				}))(el);
				flushSync();

				const first_observer_callback = observer_callback;
				assert.deepEqual(observer_options, { threshold: 0.5 });

				// Remove options
				has_options = false;
				flushSync();

				assert.notStrictEqual(observer_callback, first_observer_callback);
				assert.strictEqual(observer_options, undefined);
			});
		});
	});

	describe('cleanup', () => {
		test('cleanup function disconnects observer', () => {
			effect_cleanup = $effect.root(() => {
				const callback = vi.fn();
				cleanup = intersect(() => callback)(el);
				flushSync();

				assert.strictEqual(disconnected, false);

				cleanup!();

				assert.strictEqual(disconnected, true);
			});
		});

		test('cleanup is safe to call multiple times', () => {
			effect_cleanup = $effect.root(() => {
				const callback = vi.fn();
				cleanup = intersect(() => callback)(el);
				flushSync();

				cleanup!();
				// Should not throw
				cleanup!();
				cleanup!();

				assert.strictEqual(disconnected, true);
			});
		});

		test('calling disconnect from callback disconnects observer', () => {
			effect_cleanup = $effect.root(() => {
				const callback = vi.fn(({ disconnect }) => {
					disconnect();
				});
				cleanup = intersect(() => callback)(el);
				flushSync();

				trigger_intersection(true);

				assert.strictEqual(disconnected, true);
			});
		});
	});

	describe('edge cases', () => {
		test('changing count does not recreate observer', () => {
			effect_cleanup = $effect.root(() => {
				let count = $state(2);
				const callback = vi.fn();

				cleanup = intersect(() => ({ onintersect: callback, count }))(el);
				flushSync();

				const first_observer_callback = observer_callback;

				// Change count
				count = 3;
				flushSync();

				// Observer should not be recreated
				assert.strictEqual(observer_callback, first_observer_callback);
			});
		});

		test('changing ondisconnect does not recreate observer', () => {
			effect_cleanup = $effect.root(() => {
				let ondisconnect_version = $state(1);
				const callback = vi.fn();
				const ondisconnect1 = vi.fn();
				const ondisconnect2 = vi.fn();

				cleanup = intersect(() => ({
					onintersect: callback,
					ondisconnect: ondisconnect_version === 1 ? ondisconnect1 : ondisconnect2
				}))(el);
				flushSync();

				const first_observer_callback = observer_callback;

				// Change ondisconnect
				ondisconnect_version = 2;
				flushSync();

				// Observer should not be recreated
				assert.strictEqual(observer_callback, first_observer_callback);

				// Cleanup should call new ondisconnect
				cleanup!();
				assert.strictEqual(ondisconnect1.mock.calls.length, 0);
				assert.strictEqual(ondisconnect2.mock.calls.length, 1);
			});
		});

		test('complex options changes are detected', () => {
			effect_cleanup = $effect.root(() => {
				let root_margin = $state('0px');
				const callback = vi.fn();

				cleanup = intersect(() => ({
					onintersect: callback,
					options: { rootMargin: root_margin, threshold: [0, 0.5, 1] }
				}))(el);
				flushSync();

				const first_observer_callback = observer_callback;

				// Change nested option
				root_margin = '10px';
				flushSync();

				// Observer should be recreated
				assert.notStrictEqual(observer_callback, first_observer_callback);
			});
		});
	});
});
