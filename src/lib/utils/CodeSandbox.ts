// CodeSandbox executes javascript in an iframe.
// It assumes the provided code has a default export that is a function
// with the type (output: string) => MaybePromise<AssertionResult>.
// CodeSandbox.execute(args: unknown) will use postMessage to run the function
// and return the result.
export class CodeSandbox {
	iframe: HTMLIFrameElement;
	loaded: Promise<void>;

	constructor(js: string) {
		this.iframe = document.createElement('iframe');
		document.body.appendChild(this.iframe);

		const doc = this.iframe.contentDocument;
		if (!doc) {
			throw new Error('iframe contentDocument is null');
		}

		const nonce = crypto.randomUUID();

		let resolve: () => void;
		this.loaded = new Promise<void>((r) => (resolve = r));

		const listener = (event: MessageEvent) => {
			if (event.data.type === 'register' && event.data.nonce === nonce) {
				resolve();
				window.removeEventListener('message', listener);
			}
		};
		window.addEventListener('message', listener);

		doc.open();
		doc.write(`
            <script type="module">
                ${js}
                window.addEventListener('message', async (event) => {
                    const result = await execute(...event.data.args);
                    window.parent.postMessage({
                        type: "execute-output",
                        nonce: event.data.nonce,
                        result,
                    }, '*');
                });
				window.parent.postMessage({ type: 'register', nonce: '${nonce}' }, '*');
            </script>
        `);
		doc.close();
	}

	async execute(...args: unknown[]): Promise<unknown> {
		await this.loaded;

		// Add a nonce so we can identify responses from this iframe
		const nonce = crypto.randomUUID();

		return new Promise((resolve) => {
			const listener = (event: MessageEvent) => {
				if (event.data.type === 'execute-output' && event.data.nonce === nonce) {
					resolve(event.data.result);
					window.removeEventListener('message', listener);
				}
			};
			window.addEventListener('message', listener);
			this.iframe.contentWindow?.postMessage({ args, nonce }, '*');
		});
	}

	destroy() {
		document.body.removeChild(this.iframe);
	}
}
