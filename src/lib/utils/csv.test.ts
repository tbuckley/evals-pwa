import dedent from 'dedent';
import { describe, it, expect } from 'vitest';
import { parseCSV } from './csv';

describe('csv', () => {
  it('should parse csv', () => {
    const csv = dedent`
            name,email
            John Doe,john.doe@example.com
            Jane Doe,jane.doe@example.com
        `;

    const result = parseCSV(csv);
    expect(result).toEqual([
      { name: 'John Doe', email: 'john.doe@example.com' },
      { name: 'Jane Doe', email: 'jane.doe@example.com' },
    ]);
  });

  it('should handle strings with commas', () => {
    const csv = dedent`
            name,email
            "Doe, John",john.doe@example.com
            "Doe, Jane",jane.doe@example.com
        `;

    const result = parseCSV(csv);
    expect(result).toEqual([
      { name: 'Doe, John', email: 'john.doe@example.com' },
      { name: 'Doe, Jane', email: 'jane.doe@example.com' },
    ]);
  });

  it('should handle strings with quotes', () => {
    const csv = dedent`
            quote,author
            """To be or not to be, that is the question."" - Hamlet",Shakespeare
            """Luke, I am your father."" - Darth Vader",George Lucas
        `;

    const result = parseCSV(csv);
    expect(result).toEqual([
      { quote: '"To be or not to be, that is the question." - Hamlet', author: 'Shakespeare' },
      { quote: '"Luke, I am your father." - Darth Vader', author: 'George Lucas' },
    ]);
  });
});
