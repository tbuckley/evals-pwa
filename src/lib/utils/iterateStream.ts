export function iterateStream<T>(stream: ReadableStream<T>) {
	return {
		[Symbol.asyncIterator]: async function* () {
			const reader = stream.getReader();
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) return;
					yield value;
				}
			} finally {
				reader.releaseLock();
			}
		}
	};
}
