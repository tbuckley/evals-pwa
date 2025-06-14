import { describe, expect, test } from 'vitest';
import { InMemoryStorage } from './InMemoryStorage';
import dedent from 'dedent';
import { FileSystemEvalsStorage } from './FileSystemEvalsStorage';

describe('FileSystemEvalsStorage', () => {
  test('adds a default test', async () => {
    const storage = new InMemoryStorage();
    await storage.writeFile(
      'file:///config.yaml',
      dedent`
            prompts:
              - "hello world"
              - "another"
            
            providers:
              - gemini:gemini-1.5-flash-latest
        `,
    );
    const fs = new FileSystemEvalsStorage(storage);
    const config = await fs.getConfig();
    expect(config.tests).toEqual([
      {
        vars: {},
        assert: [],
      },
    ]);
  });

  test('loads relative files', async () => {
    const storage = new InMemoryStorage();
    await storage.writeFile(
      'file:///runs/test.json',
      JSON.stringify({
        version: 1,
        id: 'file://./id.txt',
        timestamp: 123456,
        envs: [],
        tests: [],
        results: [[]],
      }),
    );
    await storage.writeFile('file:///runs/id.txt', 'my-id');

    const fs = new FileSystemEvalsStorage(storage);
    const runs = await fs.getAllRuns('evals.yaml');
    expect(runs).toMatchInlineSnapshot(`
      [
        {
          "envs": [],
          "id": "my-id",
          "results": [
            [],
          ],
          "tests": [],
          "timestamp": 123456,
          "version": 1,
        },
      ]
    `);
  });

  test('normalizes conversations', async () => {
    const storage = new InMemoryStorage();
    await storage.writeFile(
      'file:///config.yaml',
      dedent`
            prompts:
              - - system: A system prompt.
                - user: A user prompt.
                - assistant: An assistant response.
                - user: A final user prompt.
            providers:
              - gemini:gemini-1.5-flash-latest
        `,
    );

    const fs = new FileSystemEvalsStorage(storage);
    const config = await fs.getConfig();
    expect(config.prompts).toEqual([
      {
        prompt:
          dedent`
        - system: A system prompt.
        - user: A user prompt.
        - assistant: An assistant response.
        - user: A final user prompt.
      ` + '\n', // Annoyingly, yaml.stringify() adds a newline...
      },
    ]);
  });
});
