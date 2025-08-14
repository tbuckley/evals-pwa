import { FileReference } from '$lib/storage/FileReference';
import { WaveFile } from 'wavefile';

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unexpected reader result'));
      }
    };
    reader.onerror = () => {
      reject(new Error(reader.error?.message ?? 'Unknown error'));
    };
    reader.readAsDataURL(file);
  });
}

export function mimeTypeForFile(file: File): string {
  const ext = file.name.split('.').pop();
  if (ext === 'jpg' || ext === 'jpeg') {
    return 'image/jpeg';
  }
  if (ext === 'png') {
    return 'image/png';
  }
  throw new Error(`Unsupported file type: ${ext}`);
}

export function matchesMimeType(pattern: string, mimeType: string): boolean {
  if (pattern === '*/*') {
    return true;
  }
  if (pattern === mimeType) {
    return true;
  }

  // Try matching with wildcards
  const [mainType, subType] = pattern.split('/');
  const [mainType2, subType2] = mimeType.split('/');
  const mainMatch = mainType === mainType2 || mainType === '*';
  const subMatch = subType === subType2 || subType === '*';
  return mainMatch && subMatch;
}

export function isImageFile(val: unknown): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
  return (
    val instanceof FileReference &&
    imageExtensions.some((ext) => val.uri.toLowerCase().endsWith(ext))
  );
}

export function isAudioFile(val: unknown): boolean {
  const audioExtensions = ['.wav', '.mp3', '.ogg', '.flac', '.m4a', '.opus'];
  return (
    val instanceof FileReference &&
    audioExtensions.some((ext) => val.uri.toLowerCase().endsWith(ext))
  );
}

export async function wavToGeminiLive(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const wav = new WaveFile();
  wav.fromBuffer(new Uint8Array(buffer));
  wav.toSampleRate(16000);
  wav.toBitDepth('16');
  const base64Audio = wav.toBase64();
  return base64Audio;
}

export function geminiDataToWav(chunks: Uint8Array[]): Blob {
  const data = new Int16Array(chunks.flatMap((c) => Array.from(new Int16Array(c.buffer))));
  const wav = new WaveFile();
  wav.fromScratch(1, 24000, '16', new Int16Array(data.buffer));
  return new Blob([wav.toBuffer()], { type: 'audio/wav' });
}

export function decodeB64Blob(data: string): Uint8Array {
  const byteCharacters = atob(data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return byteArray;
}
