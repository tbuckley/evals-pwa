export interface ReadonlyFileStorage {
  load(uri: string): Promise<File | { uri: string; file: File }[]>;
  loadFile(uri: string): Promise<File>;
}

export interface FileStorage extends ReadonlyFileStorage {
  getName(): string;
  writeFile(uri: string, data: string | Blob): Promise<void>;
}
