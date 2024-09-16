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
});
