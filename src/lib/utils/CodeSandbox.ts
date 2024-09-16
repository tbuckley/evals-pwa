function stringToDataUrl(input: string): string {
  // Encode the string as UTF-8
  const utf8Encoder = new TextEncoder();
  const utf8Bytes = utf8Encoder.encode(input);

  // Convert the UTF-8 byte array to a base64 string
  const base64String = btoa(String.fromCharCode(...utf8Bytes));

  // Prepend the data URL prefix
  return `data:text/javascript;base64,${base64String}`;
}

interface ErrorResponse {
  type: 'error';
  error: string;
  stack?: string;
}

interface OkResponse {
  type: 'ok';
}

interface ResultResponse {
  type: 'result';
  result: unknown;
}

type Response = ErrorResponse | OkResponse | ResultResponse;

export class CodeSandbox {
  private static loaded: Promise<HTMLIFrameElement> | null = null;
  private static instance = 0;

  private static initIframe() {
    if (this.loaded) return this.loaded;

    // Create and configure the iframe
    const iframe = document.createElement('iframe');
    iframe.sandbox.add('allow-scripts'); // Allow scripts but restrict other capabilities
    document.body.appendChild(iframe);

    // Set up the iframe content
    const iframeContent = `
            <script type="module">
                window.addEventListener('message', async (event) => {
                    if (event.data.type === 'bind') {
                        const { code, port } = event.data;
                        const codePort = port;
                        try {
                            // Dynamically import the code module
                            const module = await import(code);
                            const execute = module.default ?? module.execute;
                            if (typeof execute !== 'function') {
                                codePort.postMessage({ type: 'error', error: 'Module does not export a function' });
                                return;
                            }
                            // Listen for function calls on the codePort
                            codePort.onmessage = async (event) => {
                                const { args, port } = event.data;
                                const callPort = port;
                                try {
                                    const result = await execute(...args);
                                    callPort.postMessage({ type: 'result', result });
                                } catch (e) {
                                    callPort.postMessage({
                                        type: 'error',
                                        error: e instanceof Error ? e.message : String(e),
                                        stack: e instanceof Error ? e.stack : undefined
                                    });
                                }
                            };
                            codePort.postMessage({ type: 'ok' });
                        } catch (e) {
                            codePort.postMessage({
                                type: 'error',
                                error: e instanceof Error ? e.message : String(e),
                                stack: e instanceof Error ? e.stack : undefined
                            });
                        }
                    }
                });
            </script>
        `;

    // Use srcdoc to set the iframe's content
    iframe.srcdoc = iframeContent;
    this.loaded = new Promise<HTMLIFrameElement>((resolve) => {
      iframe.addEventListener('load', () => {
        resolve(iframe);
      });
    });

    return this.loaded;
  }

  static async bind(code: string): Promise<(...args: unknown[]) => Promise<unknown>> {
    const iframe = await this.initIframe();

    // Convert the code to a data URL
    const codeDataUrl = stringToDataUrl(code);

    // Set up a message channel for communication with the iframe
    const codePortChannel = new MessageChannel();
    const codePort = codePortChannel.port1;
    const iframeWindow = iframe.contentWindow!;
    iframeWindow.postMessage(
      { type: 'bind', code: codeDataUrl, port: codePortChannel.port2 },
      '*',
      [codePortChannel.port2],
    );

    const currentInstance = this.instance;
    return new Promise((resolve, reject) => {
      codePort.onmessage = (event) => {
        const data = event.data as Response;
        if (data.type === 'ok') {
          // Return the bound function
          const boundFunction = (...args: unknown[]) => {
            return new Promise<unknown>((resolve, reject) => {
              const callPortChannel = new MessageChannel();
              const callPort = callPortChannel.port1;
              callPort.onmessage = (event) => {
                const data = event.data as Response;
                if (data.type === 'result') {
                  resolve(data.result);
                } else if (data.type === 'error') {
                  const error = new Error(data.error);
                  error.stack = data.stack;
                  reject(error);
                }
              };
              if (this.instance !== currentInstance) {
                throw new Error('Attempt to call bound function after destroy');
              }
              // Send the function call along with arguments
              codePort.postMessage({ args, port: callPortChannel.port2 }, [callPortChannel.port2]);
            });
          };
          resolve(boundFunction);
        } else if (data.type === 'error') {
          const error = new Error(data.error + code);
          error.stack = data.stack;
          reject(error);
        }
      };
    });
  }

  static async destroy() {
    this.instance++;
    if (this.loaded) {
      const iframe = await this.loaded;
      document.body.removeChild(iframe);
      this.loaded = null;
    }
  }
}
