export interface ReadonlyFileStorage {
  load(uri: string): Promise<File | { uri: string; file: File }[]>;
  loadFile(uri: string): Promise<File>;
  isDirectory(uri: string): Promise<boolean>;
}

export interface FileStorage extends ReadonlyFileStorage {
  getName(): string;
  writeFile(uri: string, data: string | Blob): Promise<void>;
  appendFile(uri: string, data: string | Blob): Promise<void>;
}
