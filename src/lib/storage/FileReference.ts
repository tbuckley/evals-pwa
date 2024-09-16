export class FileReference {
  constructor(
    public readonly uri: string,
    public readonly file: File,
    public readonly type: 'file' | 'image' | 'code' = fileTypeOf(file.name),
  ) {}
}

function fileTypeOf(path: string): 'image' | 'file' {
  return path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg')
    ? 'image'
    : 'file';
}
