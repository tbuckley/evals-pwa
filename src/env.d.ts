/// <reference types="@sveltejs/kit" />

declare module '$env/static/private' {
  export const PLAYWRIGHT: string | undefined;
}
