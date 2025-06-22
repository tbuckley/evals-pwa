import { describe, expect, test } from 'vitest';
import { InMemoryStorage } from './InMemoryStorage';
import dedent from 'dedent';
import { FileSystemEvalsStorage } from './FileSystemEvalsStorage';
import { UiError } from '$lib/types/errors';

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
              - gemini:gemini-2.5-flash
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
              - gemini:gemini-2.5-flash
        `,
    );

    const fs = new FileSystemEvalsStorage(storage);
    const config = await fs.getConfig();
    expect(config.prompts).toEqual([
      dedent`
        - system: A system prompt.
        - user: A user prompt.
        - assistant: An assistant response.
        - user: A final user prompt.
      ` + '\n', // Annoyingly, yaml.stringify() adds a newline...
    ]);
  });

  test('throws an error if you use an unsupported property', async () => {
    const storage = new InMemoryStorage();
    await storage.writeFile(
      'file:///config.yaml',
      dedent`
        prompts:
          - "hello world"
        providers:
          - gemini:gemini-2.5-flash
        tests:
          - vars:
              foo: bar
            assertions: # Not supported!
              - type: equals
                vars:
                  value: "hello world"
        `,
    );
    const fs = new FileSystemEvalsStorage(storage);
    // Expect a UiError with type 'invalid-config'
    await expect(fs.getConfig()).rejects.toThrow();

    // To inspect the error details, you can also do:
    try {
      await fs.getConfig();
    } catch (error) {
      expect(error).toBeInstanceOf(UiError);
      if (error instanceof UiError) {
        expect(error.detail.type).toBe('invalid-config');
        if (error.detail.type === 'invalid-config') {
          expect(error.detail.errors).toBeInstanceOf(Array);
          expect(error.detail.errors).toHaveLength(1);
          expect(error.detail.errors[0]).toContain('assertions');
        }
      }
    }
  });
});
