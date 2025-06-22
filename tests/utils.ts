import type { Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';
import { promises as fs } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function chooseDirectory(page: Page, relpath: string | string[]) {
  await page.goto('/__playwright');
  await page.waitForLoadState('networkidle');

  const fs = new FileSystem(page);
  await fs.clear();

  // Copy over paths
  if (!Array.isArray(relpath)) {
    relpath = [relpath];
  }
  for (const p of relpath) {
    await fs.mirrorFolder(path.join(__dirname, p));
  }

  await page.getByText('Use OPFS').click();
}

// From https://github.com/dstoc/pkmapp/blob/main/tests/pages/main.ts

export class FileSystem {
  constructor(readonly page: Page) {}
  async clear() {
    return this.page.evaluate(async () => {
      const directory = await navigator.storage.getDirectory();
      (directory as unknown as { remove: (arg: unknown) => void }).remove({
        recursive: true,
      });
    });
  }
  async mirrorFolder(relpath: string) {
    const page = this.page;
    async function copyFile(dirs: string[], filename: string, contents: string): Promise<void> {
      return page.evaluate(
        async ({ dirs, filename, contents }) => {
          let dir = await navigator.storage.getDirectory();
          for (const d of dirs) {
            dir = await dir.getDirectoryHandle(d, { create: true });
          }
          const file = await dir.getFileHandle(filename, { create: true });
          const writable = await file.createWritable();
          await writable.write(contents);
          await writable.close();
        },
        {
          dirs,
          filename,
          contents,
        },
      );
    }

    async function cloneDirectory(dirname: string, dirs: string[]) {
      const entries = await fs.readdir(dirname, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await cloneDirectory(path.join(dirname, entry.name), [...dirs, entry.name]);
        } else {
          // const blob = new Blob([await fs.readFile(path.join(dirname, entry.name))]);
          const binaryString: string = await fs.readFile(path.join(dirname, entry.name), 'binary');
          await copyFile(dirs, entry.name, binaryString);
        }
      }
    }

    await cloneDirectory(relpath, []);
  }
  async getFile(fileName: string): Promise<string> {
    return this.page.evaluate(async (fileName) => {
      const directory = await navigator.storage.getDirectory();
      const handle = await directory.getFileHandle(fileName);
      const file = await handle.getFile();
      const decoder = new TextDecoder();
      return decoder.decode(await file.arrayBuffer());
    }, fileName);
  }
  async setFile(fileName: string, content: string): Promise<void> {
    return this.page.evaluate(
      async ({ fileName, content }) => {
        const directory = await navigator.storage.getDirectory();
        const handle = await directory.getFileHandle(fileName, { create: true });
        const stream = await handle.createWritable();
        await stream.write(content);
        await stream.close();
      },
      { fileName, content },
    );
  }
}
