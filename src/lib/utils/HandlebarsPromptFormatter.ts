import {
  type ConversationPrompt,
  type MultiPartPrompt,
  type PromptFormatter,
  type RolePromptPart,
  type VarSet,
} from '$lib/types';
import Handlebars from 'handlebars';
import { FileReference } from '$lib/storage/FileReference';
import { asyncObjectDfsMap } from './objectDFS';
import { matchesMimeType } from './media';
import * as yaml from 'yaml';
import { z } from 'zod';

// Boolean
Handlebars.registerHelper('not', (a) => !a);
Handlebars.registerHelper('and', (a: boolean, b: boolean) => a && b);
Handlebars.registerHelper('or', (a: boolean, b: boolean) => a || b);
// Comparison
Handlebars.registerHelper('eq', (a, b) => a === b);
Handlebars.registerHelper('neq', (a, b) => a !== b);
Handlebars.registerHelper('lt', (a: number, b: number) => a < b);
Handlebars.registerHelper('gt', (a: number, b: number) => a > b);
Handlebars.registerHelper('lte', (a: number, b: number) => a <= b);
Handlebars.registerHelper('gte', (a: number, b: number) => a >= b);
// Type
Handlebars.registerHelper('isArray', (a) => Array.isArray(a));
Handlebars.registerHelper('typeof', (a) => typeof a);
// Math
Handlebars.registerHelper('add', (a: number, b: number) => a + b);
Handlebars.registerHelper('sub', (a: number, b: number) => a - b);
Handlebars.registerHelper('mult', (a: number, b: number) => a * b);
Handlebars.registerHelper('div', (a: number, b: number) => a / b);
// Array
Handlebars.registerHelper('first', (a: string[]) => a[0]);
Handlebars.registerHelper('last', (a: string[]) => a[a.length - 1]);
Handlebars.registerHelper('rest', (a: string[]) => a.slice(1));
Handlebars.registerHelper('length', (a: string[]) => a.length);
Handlebars.registerHelper('slice', (a: string[], start: number, end: number) =>
  a.slice(start, end),
);
// JSON
Handlebars.registerHelper('json', (a: unknown) => JSON.stringify(a));

export class HandlebarsPromptFormatter implements PromptFormatter {
  template: HandlebarsTemplateDelegate;

  constructor(public readonly prompt: string) {
    this.template = Handlebars.compile(prompt, { noEscape: true });
  }
  async format(vars: VarSet, mimeTypes?: string[]): Promise<ConversationPrompt> {
    const files: Record<string, FileReference> = {};
    const stringVars: Record<string, string> = {};
    const errorFiles: Record<string, FileReference> = {};
    const placeholderVars = await asyncObjectDfsMap(vars, async (val, path) => {
      if (val instanceof FileReference) {
        if (mimeTypes?.some((pattern) => matchesMimeType(pattern, val.file.type))) {
          // Replace files with placeholders, which will be split out at the end
          files[path] = val;
          return `__FILE_PLACEHOLDER_${path}__`;
        } else {
          // Try reading the file as a utf-8 string
          try {
            const decoder = new TextDecoder('utf-8', { fatal: true });
            const decodedText = decoder.decode(await val.file.arrayBuffer());
            return decodedText;
          } catch (e) {
            console.warn(`Cannot read file ${val.uri} (for ${path}) as utf-8:`, e);
            errorFiles[path] = val;
            return `__FILE_PLACEHOLDER_${path}__`;
          }
        }
      } else if (typeof val === 'string' && val.includes('\n')) {
        // If it's a string that contains newlines, use a placeholder
        // We want to leave other strings alone so equality tests work, ex. `(eq this.id "b")`
        stringVars[path] = val;
        return `__STRING_PLACEHOLDER_${path}__`;
      }
      return val;
    });

    const rendered = this.template(placeholderVars);
    const conversation = getAsConversation(rendered);

    // Find all file placeholders, and use the file
    const prompt = conversation.map((part): RolePromptPart => {
      if ('system' in part) {
        return {
          role: 'system',
          content: replacePlaceholders(part.system, stringVars, files, errorFiles),
        };
      }
      if ('user' in part) {
        return {
          role: 'user',
          content: replacePlaceholders(part.user, stringVars, files, errorFiles),
        };
      }
      if ('assistant' in part) {
        return {
          role: 'assistant',
          content: replacePlaceholders(part.assistant, stringVars, files, errorFiles),
        };
      }
      throw new Error(`Invalid conversation part: ${JSON.stringify(part)}`);
    });
    return prompt;
  }
}

function getAsConversation(rendered: string): Conversation {
  try {
    const parsed: unknown = yaml.parse(rendered);
    return conversationSchema.parse(parsed);
  } catch (e) {
    console.error('Error parsing conversation:', e);
    return [{ user: rendered }];
  }
}

const conversationSchema = z.array(
  z.union([
    z.object({ system: z.string() }),
    z.object({ user: z.string() }),
    z.object({ assistant: z.string() }),
  ]),
);
type Conversation = z.infer<typeof conversationSchema>;

function replacePlaceholders(
  rendered: string,
  stringVars: Record<string, string>,
  files: Record<string, FileReference>,
  errorFiles: Record<string, FileReference>,
): MultiPartPrompt {
  const replacedStrings = rendered
    .split(/(__STRING_PLACEHOLDER_[a-zA-Z0-9_\-[\].$]+?__)/)
    .map((part) => {
      if (part.startsWith('__STRING_PLACEHOLDER_')) {
        const key = part.slice('__STRING_PLACEHOLDER_'.length, -2);
        if (!(key in stringVars)) {
          throw new Error(`Cannot read string ${key}`);
        }
        return stringVars[key];
      }
      return part;
    })
    .join('');

  const parsed: MultiPartPrompt = [];
  replacedStrings.split(/(__FILE_PLACEHOLDER_[a-zA-Z0-9_\-[\].$]+?__)/).forEach((part) => {
    if (part.startsWith('__FILE_PLACEHOLDER_')) {
      const key = part.slice('__FILE_PLACEHOLDER_'.length, -2);
      if (key in errorFiles) {
        throw new Error(`Cannot read file ${errorFiles[key].uri}: unsupported file type`);
      }
      parsed.push({ file: files[key].file });
    } else if (part.length > 0) {
      parsed.push({ text: part });
    }
  });
  return parsed;
}
