/**
 * Test helpers for `Dialog`/`DialogContent`.
 *
 * jsdom recognizes `<dialog>` but does not implement the modal methods
 * (`showModal`/`show`/`close`), so importing this module polyfills minimal
 * versions on `HTMLDialogElement.prototype` -- enough for `Dialog` to open and
 * close in tests. Import it for its side effect before mounting a dialog.
 */

if (typeof HTMLDialogElement !== 'undefined') {
	const proto = HTMLDialogElement.prototype as any;

	// `open` reflects the attribute; define it if jsdom didn't
	if (!Object.getOwnPropertyDescriptor(proto, 'open')) {
		Object.defineProperty(proto, 'open', {
			get(this: HTMLDialogElement) {
				return this.hasAttribute('open');
			},
			set(this: HTMLDialogElement, value: boolean) {
				if (value) this.setAttribute('open', '');
				else this.removeAttribute('open');
			},
			configurable: true
		});
	}

	if (!proto.showModal) {
		proto.showModal = function (this: HTMLDialogElement) {
			this.open = true;
		};
	}
	if (!proto.show) {
		proto.show = function (this: HTMLDialogElement) {
			this.open = true;
		};
	}
	if (!proto.close) {
		proto.close = function (this: HTMLDialogElement, return_value?: string) {
			if (!this.open) return;
			this.open = false;
			if (return_value !== undefined) (this as any).returnValue = return_value;
			this.dispatchEvent(new Event('close'));
		};
	}
}
