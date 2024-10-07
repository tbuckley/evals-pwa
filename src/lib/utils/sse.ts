async function* iterateStream<T>(stream: ReadableStream<T>) {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Stream server-sent events.
 * See https://html.spec.whatwg.org/multipage/server-sent-events.html
 */
export async function* sse(response: Response) {
  const stream = response.body;
  let buffer = '';

  if (!stream) throw new Error(`No response`);
  for await (const chunk of iterateStream(stream.pipeThrough(new TextDecoderStream()))) {
    // Sometimes the chunks are split/merged.
    // Buffer them so that we can pull them apart correctly.
    buffer += chunk;
    const parts = buffer.split('\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      if (part.startsWith('data: ')) {
        const value = part.substring(6);
        if (value === '[DONE]') break;
        yield value;
      }
    }
  }
}
