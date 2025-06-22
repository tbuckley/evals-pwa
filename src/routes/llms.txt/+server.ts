import type { RequestHandler } from '@sveltejs/kit';
import rawDocumentation from '../documentation/+page.md?raw';

export const prerender = true;

export const GET: RequestHandler = () => {
  const examples = import.meta.glob(
    [
      '../../../examples/**/*.{yaml,json,js,ts,txt,csv}',
      '!../../../examples/*/runs/**/*',
      '!../../../examples/*/cache/**/*',
    ],
    {
      query: '?raw',
      eager: true,
    },
  ) as unknown as Record<string, { default: string }>;

  const folders = new Map<string, Map<string, string>>();
  for (const [path, file] of Object.entries(examples)) {
    const parts = path.substring('../../../examples/'.length).split('/');
    const folder = parts[0];
    if (!folders.has(folder)) {
      folders.set(folder, new Map());
    }
    folders.get(folder)?.set(parts.slice(1).join('/'), file.default);
  }

  const exampleNames = [...folders.keys()];

  return new Response(
    `
${rawDocumentation}

# Examples

${exampleNames.map((name) => formatExample(name, folders.get(name))).join('\n')}`.trim(),
    {
      headers: {
        'Content-Type': 'text/plain',
      },
    },
  );
};

function formatExample(name: string, files: Map<string, string> | undefined): string {
  if (!files) {
    return '';
  }

  return `
<example name="${name}">
${Array.from(files.entries())
  .map(
    ([path, content]) => `${path}
---
${content}
---`,
  )
  .join('\n')}
</example>
  `;
}
