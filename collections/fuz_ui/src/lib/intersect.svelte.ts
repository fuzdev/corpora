import type { Attachment } from 'svelte/attachments';
import { deep_equal } from '@fuzdev/fuz_util/deep_equal.ts';

export interface IntersectParams {
	/**
	 * Called when the element enters or leaves the viewport until disconnected.
	 */
	onintersect?: OnIntersect;
	/**
	 * Called when the attachment's observer is disconnected,
	 * either by the user calling disconnect or the attachment being destroyed.
	 */
	ondisconnect?: OnDisconnect;
	/**
	 * A value of `1` disconnects after `el` enters and leaves the viewport one time,
	 * similar to 'once' for an event.
	 * `0` disables and `undefined` or a negative number like `-1` never disconnects.
	 */
	count?: number;
	/**
	 * Same as the `options` param to
	 * [`IntersectionObserver`](https://developer.mozilla.org/en-US/docs/Web/API/IntersectionObserver/IntersectionObserver#options)
	 */
	options?: IntersectionObserverInit;
}

export type IntersectParamsOrCallback = OnIntersect | IntersectParams;

/**
 * Creates an attachment that observes element viewport intersection.
 * Uses the lazy function pattern to optimize reactivity:
 * callbacks can update without recreating the observer, preserving state.
 * @param get_params - function that returns callback, params object, or nullish to disable
 */
export const intersect =
	(
		get_params: () => IntersectParamsOrCallback | null | undefined
	): Attachment<HTMLElement | SVGElement> =>
	(el) => {
		// State that persists across callback changes
		let intersecting = false;
		let intersections = 0;
		let observer: IntersectionObserver | null = null;
		let current_options: IntersectionObserverInit | undefined = undefined;

		// Current callbacks - updated reactively without recreating observer
		let current_onintersect: OnIntersect | undefined;
		let current_ondisconnect: OnDisconnect | undefined;
		let current_count: number | undefined;

		const disconnect = (): void => {
			if (!observer) return;
			const observer_to_disconnect = observer;
			observer.disconnect();
			if (current_ondisconnect) {
				current_ondisconnect({ intersecting, intersections, el, observer: observer_to_disconnect });
			}
			observer = null;
		};

		$effect(() => {
			const params = get_params();

			if (params == null) {
				// Params disabled, disconnect if active
				current_onintersect = undefined;
				current_ondisconnect = undefined;
				current_count = undefined;
				if (observer) {
					disconnect();
				}
				return;
			}

			// Parse params and update current callbacks
			let options: IntersectionObserverInit | undefined;
			if (typeof params === 'function') {
				current_onintersect = params;
				current_ondisconnect = undefined;
				current_count = undefined;
				options = undefined;
			} else {
				current_onintersect = params.onintersect;
				current_ondisconnect = params.ondisconnect;
				current_count = params.count;
				options = params.options;
			}

			// Check if count is 0 (disabled)
			if (current_count === 0) {
				if (observer) {
					disconnect();
				}
				return;
			}

			// Check if options changed (requires observer recreation)
			const options_changed = !deep_equal(current_options, options);

			if (options_changed || !observer) {
				// Disconnect old observer if exists
				if (observer) {
					disconnect();
				}

				// Reset state on observer recreation
				intersecting = false;
				intersections = 0;
				current_options = options;

				// Create new observer
				observer = new IntersectionObserver((entries) => {
					intersecting = entries[0]!.isIntersecting;
					if (current_onintersect && observer) {
						current_onintersect({ intersecting, intersections, el, observer, disconnect });
					}
					if (intersecting) {
						intersections++;
					} else {
						if (current_count && current_count > 0 && intersections >= current_count) {
							disconnect();
						}
					}
				}, options);
				observer.observe(el);
			}
			// If only callbacks changed, observer stays alive and uses new callbacks from closure
		});

		return disconnect;
	};

// TODO how to forward generic `el` type?
export type OnIntersect = (state: IntersectState) => void;

export interface IntersectState {
	intersecting: boolean;
	intersections: number;
	el: HTMLElement | SVGElement;
	observer: IntersectionObserver;
	disconnect: () => void;
}

// TODO how to forward generic `el` type?
export type OnDisconnect = (state: DisconnectState) => void;

export interface DisconnectState {
	intersecting: boolean;
	intersections: number;
	el: HTMLElement | SVGElement;
	observer: IntersectionObserver;
}
