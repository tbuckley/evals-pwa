import { describe, expect, test } from 'vitest';
import { runGenerators } from './runGenerators';
import { FileReference } from './FileReference';
import { getFilename } from '$lib/utils/path';

describe('runGenerators', () => {
  test('returns a normal object untouched', async () => {
    const input = { a: 1, b: [2, 3], c: { d: 4 } };
    const { result, changed } = await runGenerators(input);
    expect(changed).toEqual(false);
    expect(result).toEqual(input);
  });
  test('runs generators on properties', async () => {
    const input = {
      property: {
        '=gen': `function execute() { return 'yes' }`,
      },
    };
    const ouput = await runGenerators(input);
    expect(ouput).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "result": {
			    "property": "yes",
			  },
			}
		`);
  });
  test('runs generators in arrays', async () => {
    const input = [
      1,
      {
        '=gen': `function execute() { return 2 }`,
      },
      3,
    ];
    const ouput = await runGenerators(input);
    expect(ouput).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "result": [
			    1,
			    2,
			    3,
			  ],
			}
		`);
  });
  test('generators receive args (array)', async () => {
    const input = {
      property: {
        '=gen': `function execute(...args) { return args }`,
        args: [1, 2, 3],
      },
    };
    const ouput = await runGenerators(input);
    expect(ouput).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "result": {
			    "property": [
			      1,
			      2,
			      3,
			    ],
			  },
			}
		`);
  });
  test('generators receive args (non-array)', async () => {
    const input = {
      property: {
        '=gen': `function execute(arg) { return arg }`,
        args: { a: 1 },
      },
    };
    const ouput = await runGenerators(input);
    expect(ouput).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "result": {
			    "property": {
			      "a": 1,
			    },
			  },
			}
		`);
  });
  test('generators can splice into arrays', async () => {
    const input = [
      1,
      {
        '=gen': `function execute() { return [2, 3] }`,
      },
      4,
    ];
    const ouput = await runGenerators(input);
    expect(ouput).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "result": [
			    1,
			    2,
			    3,
			    4,
			  ],
			}
		`);
  });
  test('generators can spread into objects', async () => {
    const input = {
      '...': {
        '=gen': `function execute() { return {a: 1} }`,
      },
    };
    const ouput = await runGenerators(input);
    expect(ouput).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "result": {
			    "a": 1,
			  },
			}
		`);
  });
  test('multiple generators can spread into the same object', async () => {
    const input = {
      '...': [
        {
          '=gen': `function execute() { return {a: 1} }`,
        },
        {
          '=gen': `function execute() { return {b: 1} }`,
        },
      ],
    };
    const ouput = await runGenerators(input);
    expect(ouput).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "result": {
			    "a": 1,
			    "b": 1,
			  },
			}
		`);
  });
  test('=gen-tests supports csv files', async () => {
    const csvFile = createFakeFileReference('test.csv', 'a,b,c\n1,2,3\n4,5,6');
    const input = {
      tests: {
        '=gen-tests': csvFile,
      },
    };
    const ouput = await runGenerators(input);
    expect(ouput).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "result": {
			    "tests": [
			      {
			        "description": undefined,
			        "vars": {
			          "a": "1",
			          "b": "2",
			          "c": "3",
			        },
			      },
			      {
			        "description": undefined,
			        "vars": {
			          "a": "4",
			          "b": "5",
			          "c": "6",
			        },
			      },
			    ],
			  },
			}
		`);
  });
  test('=gen-tests supports csv files with special __description column', async () => {
    const csvFile = createFakeFileReference(
      'test.csv',
      '__description,a,b,c\n"The first",1,2,3\n"The second",4,5,6',
    );
    const input = {
      tests: {
        '=gen-tests': csvFile,
      },
    };
    const ouput = await runGenerators(input);
    expect(ouput).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "result": {
			    "tests": [
			      {
			        "description": "The first",
			        "vars": {
			          "a": "1",
			          "b": "2",
			          "c": "3",
			        },
			      },
			      {
			        "description": "The second",
			        "vars": {
			          "a": "4",
			          "b": "5",
			          "c": "6",
			        },
			      },
			    ],
			  },
			}
		`);
  });
  test('=gen-tests supports csv files mixed with normal tests', async () => {
    const csvFile = createFakeFileReference('test.csv', 'a,b,c\n1,2,3\n4,5,6');
    const input = {
      tests: [
        {
          '=gen-tests': csvFile,
        },
        { vars: { a: '7', b: '8', c: '9' } },
      ],
    };
    const ouput = await runGenerators(input);
    expect(ouput).toMatchInlineSnapshot(`
			{
			  "changed": true,
			  "result": {
			    "tests": [
			      {
			        "description": undefined,
			        "vars": {
			          "a": "1",
			          "b": "2",
			          "c": "3",
			        },
			      },
			      {
			        "description": undefined,
			        "vars": {
			          "a": "4",
			          "b": "5",
			          "c": "6",
			        },
			      },
			      {
			        "vars": {
			          "a": "7",
			          "b": "8",
			          "c": "9",
			        },
			      },
			    ],
			  },
			}
		`);
  });
});

function createFakeFileReference(uri: string, content: string) {
  const filename = getFilename(uri);
  if (!filename) {
    throw new Error('Invalid uri');
  }
  return new FileReference(uri, new File([content], filename), 'file');
}
