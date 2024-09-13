import { describe, expect, test } from 'vitest';
import { dereferenceFilePaths } from './dereferenceFilePaths';
import { FileReference } from './FileReference';
import { InMemoryStorage } from './InMemoryStorage';

describe('dereferenceFilePaths', () => {
	test('returns a normal object untouched', async () => {
		const storage = new InMemoryStorage();
		const input = { a: 1, b: [2, 3], c: { d: 4 } };
		const { result, changed } = await dereferenceFilePaths(input, { storage });
		expect(changed).toEqual(false);
		expect(result).toEqual(input);
	});

	test('inserts text files', async () => {
		const storage = new InMemoryStorage();
		await storage.writeFile('file:///a.txt', 'hello world!');

		const input = { a: 1, b: 'file:///a.txt' };
		const ouput = await dereferenceFilePaths(input, { storage });
		expect(ouput).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "result": {
			    "a": 1,
			    "b": "hello world!",
			  },
			}
		`);
	});

	test('inserts yaml files', async () => {
		const storage = new InMemoryStorage();
		await storage.writeFile('file:///a.yaml', 'c: 3\nd:\n  - 5\n  - 6\n');

		const input = { a: 1, b: 'file:///a.yaml' };
		const ouput = await dereferenceFilePaths(input, { storage });
		expect(ouput).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "result": {
			    "a": 1,
			    "b": {
			      "c": 3,
			      "d": [
			        5,
			        6,
			      ],
			    },
			  },
			}
		`);
	});

	test('inserts json files', async () => {
		const storage = new InMemoryStorage();
		await storage.writeFile('file:///a.json', '{"c": 3, "d": [5, 6]}');

		const input = { a: 1, b: 'file:///a.json' };
		const ouput = await dereferenceFilePaths(input, { storage });
		expect(ouput).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "result": {
			    "a": 1,
			    "b": {
			      "c": 3,
			      "d": [
			        5,
			        6,
			      ],
			    },
			  },
			}
		`);
	});

	test('allows referenced yaml to reference additional files', async () => {
		const storage = new InMemoryStorage();
		await storage.writeFile('file:///a.yaml', 'c: 3\nd: file:///b.txt');
		await storage.writeFile('file:///b.txt', 'hello world!');

		const input = { a: 1, b: 'file:///a.yaml' };
		const ouput = await dereferenceFilePaths(input, { storage });
		expect(ouput).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "result": {
			    "a": 1,
			    "b": {
			      "c": 3,
			      "d": "hello world!",
			    },
			  },
			}
		`);
	});

	test('throws an error on recursive cycles', async () => {
		const storage = new InMemoryStorage();
		await storage.writeFile('file:///a.yaml', 'b: file:///b.yaml');
		await storage.writeFile('file:///b.yaml', 'a: file:///a.yaml');

		const input = { a: 'file:///a.yaml' };
		await expect(dereferenceFilePaths(input, { storage })).rejects.toThrowError();
	});

	test('supports glob references as arrays', async () => {
		const storage = new InMemoryStorage();
		await storage.writeFile('file:///a.txt', 'a');
		await storage.writeFile('file:///b.txt', 'b');

		const input = { values: 'file:///*.txt' };
		const output = await dereferenceFilePaths(input, { storage });
		expect(output).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "result": {
			    "values": [
			      "a",
			      "b",
			    ],
			  },
			}
		`);
	});

	test('flattens any glob references within an array', async () => {
		const storage = new InMemoryStorage();
		await storage.writeFile('file:///a.txt', 'a');
		await storage.writeFile('file:///b.txt', 'b');

		const input = { values: ['file:///*.txt', 'c'] };
		const output = await dereferenceFilePaths(input, { storage });
		expect(output).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "result": {
			    "values": [
			      "a",
			      "b",
			      "c",
			    ],
			  },
			}
		`);
	});

	test('embeds image files as FileReference', async () => {
		const storage = new InMemoryStorage();
		await storage.writeFile('file:///a.txt', 'a');
		await storage.writeFile('file:///b.png', 'b');

		const input = { txt: 'file:///a.txt', img: 'file:///b.png' };
		const { result: output } = await dereferenceFilePaths(input, { storage });

		// expect(output).toHaveProperty('txt');
		// expect(output).toHaveProperty('img');
		expect(output).property('txt').to.equal('a');
		expect(output).property('img').to.be.instanceOf(FileReference);
		expect(output).property('img').property('uri').to.equal('file:///b.png');
		expect(output).property('img').property('file').to.be.instanceOf(File);
		expect(output).property('img').property('file').property('name').to.equal('b.png');
	});

	test('supports relative paths', async () => {
		const storage = new InMemoryStorage();
		await storage.writeFile(
			'file:///tests/a.yaml',
			'vars: file://./b.yaml\nassert: file://../assert.js\nabs: file:///assert.js'
		);
		await storage.writeFile('file:///tests/b.yaml', 'foo: 1\nbar: 2\nbaz: file://./baz/c.png');
		await storage.writeFile('file:///tests/baz/c.png', 'image');
		await storage.writeFile('file:///assert.js', 'code');

		const input = { tests: ['file:///tests/a.yaml'] };
		const output = await dereferenceFilePaths(input, { storage });
		expect(output).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "result": {
			    "tests": [
			      {
			        "abs": CodeReference {
			          "file": File {},
			          "type": "code",
			          "uri": "file:///assert.js",
			        },
			        "assert": CodeReference {
			          "file": File {},
			          "type": "code",
			          "uri": "file:///assert.js",
			        },
			        "vars": {
			          "bar": 2,
			          "baz": FileReference {
			            "file": File {},
			            "type": "image",
			            "uri": "file:///tests/baz/c.png",
			          },
			          "foo": 1,
			        },
			      },
			    ],
			  },
			}
		`);
	});
});
