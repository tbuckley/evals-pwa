import { CodeReference } from '$lib/storage/CodeReference';

function stringToDataUrl(input: string): string {
	// Encode the string as UTF-8
	const utf8Encoder = new TextEncoder();
	const utf8Bytes = utf8Encoder.encode(input);

	// Convert the UTF-8 byte array to a base64 string
	const base64String = btoa(String.fromCharCode(...utf8Bytes));

	// Prepend the data URL prefix
	return `data:text/javascript;base64,${base64String}`;
}

// CodeSandbox executes javascript in an iframe.
// It assumes the provided code has a default export that is a function
// with the type (output: string) => MaybePromise<AssertionResult>.
// CodeSandbox.execute(args: unknown) will use postMessage to run the function
// and return the result.
export class CodeSandbox {
	iframe: HTMLIFrameElement;
	loaded: Promise<void>;

	constructor(code: string | CodeReference) {
		this.iframe = document.createElement('iframe');
		document.body.appendChild(this.iframe);
		this.loaded = this.init(code);
	}

	private async init(code: string | CodeReference) {
		if (code instanceof CodeReference) {
			if (code.file.name.endsWith('.ts')) {
				code = `const execute = (await import("${stringToDataUrl(await code.getCode())}")).default;`;
			} else {
				code = await code.getCode();
			}
		}

		const nonce = crypto.randomUUID();
		let resolve: () => void;
		const ready = new Promise<void>((r) => (resolve = r));

		const listener = (event: MessageEvent) => {
			if (event.data.type === 'register' && event.data.nonce === nonce) {
				resolve();
				window.removeEventListener('message', listener);
			}
		};
		window.addEventListener('message', listener);

		const doc = this.iframe.contentDocument;
		if (!doc) {
			throw new Error('iframe contentDocument is null');
		}

		doc.open();
		doc.write(`
            <script type="module">
                ${code}
                window.addEventListener('message', async (event) => {
					try {
						const result = await execute(...event.data.args);
						window.parent.postMessage({
							type: "execute-output",
							nonce: event.data.nonce,
							result,
						}, '*');
					} catch (e) {
						window.parent.postMessage({
							type: 'execute-error',
							nonce: event.data.nonce,
							error: e instanceof Error ? e.message : String(e),
							stack: e instanceof Error ? e.stack : undefined,
							lineNumber: e instanceof Error && 'lineNumber' in e ? e.lineNumber : undefined
						}, '*');
					}
                });
				window.parent.postMessage({ type: 'register', nonce: '${nonce}' }, '*');
            </script>
        `);
		doc.close();
		await ready;
	}

	async execute(...args: unknown[]): Promise<unknown> {
		await this.loaded;

		// Add a nonce so we can identify responses from this iframe
		const nonce = crypto.randomUUID();

		return new Promise((resolve, reject) => {
			const listener = (event: MessageEvent) => {
				if (event?.data?.nonce === nonce) {
					if (event.data.type === 'execute-output') {
						resolve(event.data.result);
					} else if (event.data.type === 'execute-error') {
						const error = new Error(event.data.error);
						error.stack = event.data.stack;
						(error as unknown as { lineNumber: number }).lineNumber = event.data.lineNumber;
						reject(error);
					}
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
