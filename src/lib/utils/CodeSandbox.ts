// CodeSandbox executes javascript in an iframe.
// It assumes the provided code has a default export that is a function
// with the type (output: string) => MaybePromise<AssertionResult>.
// CodeSandbox.execute(args: unknown) will use postMessage to run the function
// and return the result.
export class CodeSandbox {
	iframe: HTMLIFrameElement;

	constructor(js: string) {
		this.iframe = document.createElement('iframe');
		document.body.appendChild(this.iframe);

		const doc = this.iframe.contentDocument;
		if (!doc) {
			throw new Error('iframe contentDocument is null');
		}
		doc.open();
		doc.write(`
            <script>
                ${js}
                window.addEventListener('message', async (event) => {
                    const result = await execute(...event.data.args);
                    window.parent.postMessage({
                        type: "execute-output",
                        nonce: event.data.nonce,
                        result,
                    }, '*');
                });
            </script>
        `);
		doc.close();
	}

	execute(...args: unknown[]): Promise<unknown> {
		// Add a nonce so we can identify responses from this iframe
		const nonce = crypto.randomUUID();

		return new Promise((resolve) => {
			window.addEventListener('message', (event) => {
				if (event.data.type === 'execute-output' && event.data.nonce === nonce) {
					resolve(event.data.result);
				} else {
					console.log(
						'Unexpected message:',
						event.data,
						event.data.type === 'execute-output',
						event.data.nonce === nonce
					);
				}
			});
			this.iframe.contentWindow?.postMessage({ args, nonce }, '*');
		});
	}

	destroy() {
		document.body.removeChild(this.iframe);
	}
}
