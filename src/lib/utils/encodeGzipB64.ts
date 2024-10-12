export async function encodeGzipB64(data: string): Promise<string> {
  // Convert the input string to a Uint8Array (binary data)
  const textEncoder = new TextEncoder();
  const inputData = textEncoder.encode(data);

  // Create a stream to compress (gzip) the data
  const gzipStream = new CompressionStream('gzip');
  const writer = gzipStream.writable.getWriter();
  writer.write(inputData).catch((err: unknown) => {
    console.error(err);
  });
  writer.close().catch((err: unknown) => {
    console.error(err);
  });

  // Read the compressed data as a blob
  const compressedStream = gzipStream.readable;
  const compressedChunks = [];
  const reader = compressedStream.getReader();
  let chunk: ReadableStreamReadResult<Uint8Array>;
  let totalLength = 0;
  while (!(chunk = await reader.read()).done) {
    compressedChunks.push(chunk.value);
    totalLength += chunk.value.length;
  }

  // Combine chunks into a single Uint8Array
  const compressedData = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of compressedChunks) {
    compressedData.set(chunk, offset);
    offset += chunk.length;
  }

  // Convert the compressed binary data to a base64 string
  const blob = new Blob([compressedData]);
  const base64String = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Did not receive string result'));
        return;
      }
      resolve(reader.result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  console.log(`Encoded: ${data.length} to ${base64String.length}`);

  return encodeURIComponent(base64String);
}

export async function decodeGzipB64(encoded: string): Promise<string> {
  const uriDecoded = decodeURIComponent(encoded);

  // Convert the base64 string back into binary data (Uint8Array)
  const binaryString = atob(uriDecoded); // Decode base64 string to binary string
  const len = binaryString.length;
  const byteArray = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    byteArray[i] = binaryString.charCodeAt(i);
  }

  // Create a readable stream from the byte array (necessary for DecompressionStream)
  const readableStream = new ReadableStream({
    start(controller) {
      controller.enqueue(byteArray);
      controller.close();
    },
  });

  // Pipe the readable stream through DecompressionStream
  const decompressedStream = readableStream.pipeThrough(new DecompressionStream('gzip'));

  // Read the decompressed chunks
  const decompressedChunks = [];
  const reader = decompressedStream.getReader();
  let chunk: ReadableStreamReadResult<Uint8Array>;
  let totalLength = 0;
  while (!(chunk = await reader.read()).done) {
    decompressedChunks.push(chunk.value);
    totalLength += chunk.value.length;
  }

  // Combine decompressed chunks into a single Uint8Array
  const decompressedData = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of decompressedChunks) {
    decompressedData.set(chunk, offset);
    offset += chunk.length;
  }

  // Decode the Uint8Array back into a string
  const textDecoder = new TextDecoder();
  const decodedString = textDecoder.decode(decompressedData);

  return decodedString;
}
