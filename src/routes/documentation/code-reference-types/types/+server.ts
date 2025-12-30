import type { RequestHandler } from '@sveltejs/kit';
import codeReferenceTypes from '$lib/documentation/codeReferenceTypes.ts?raw';

export const GET: RequestHandler = () => {
  return new Response(codeReferenceTypes, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'attachment; filename="code-reference-types.ts"',
    },
  });
};
