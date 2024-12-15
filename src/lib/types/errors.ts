export type ErrorState =
  | { type: 'missing-config'; path: string }
  | { type: 'invalid-config'; errors: string[] }
  | { type: 'missing-config-reference'; path: string };

export class UiError extends Error {
  constructor(
    public detail: ErrorState,
    message?: string,
  ) {
    super(message);
  }
}
export class MissingFileError extends Error {
  constructor(public path: string) {
    super(`File not found: ${path}`);
  }
}
