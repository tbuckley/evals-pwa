import type { CodeReference } from '$lib/storage/CodeReference';
import { blobToFile } from '$lib/storage/dereferenceFilePaths';
import {
  type ConversationPrompt,
  type PromptFormatter,
  type PromptPart,
  type VarSet,
} from '$lib/types';
import { z } from 'zod';

const simpleStringSchema = z.string();
const contentArraySchema = z.array(z.union([z.string(), z.instanceof(Blob)]));
const conversationPartSchema = z.union([
  z.object({ system: z.union([simpleStringSchema, contentArraySchema]) }),
  z.object({ user: z.union([simpleStringSchema, contentArraySchema]) }),
  z.object({ assistant: z.union([simpleStringSchema, contentArraySchema]) }),
]);
const conversationSchema = z.array(conversationPartSchema);

export class CodePromptFormatter implements PromptFormatter {
  get prompt(): string {
    // FIXME: Get actual code, requires async
    return this.code.uri;
  }

  constructor(private readonly code: CodeReference) {}

  async format(vars: VarSet, mimeTypes: string[] | undefined): Promise<ConversationPrompt> {
    const execute = await this.code.bind();
    const result = await execute(vars, mimeTypes);

    const simpleString = simpleStringSchema.safeParse(result);
    if (simpleString.success) {
      return [{ role: 'user', content: [{ text: simpleString.data }] }];
    }
    const contentArray = contentArraySchema.safeParse(result);
    if (contentArray.success) {
      return [
        { role: 'user', content: await Promise.all(contentArray.data.map(parseContentArray)) },
      ];
    }
    const conversation = conversationSchema.parse(result);
    return await Promise.all(
      conversation.map(async (part) => {
        if ('system' in part) {
          return {
            role: 'system',
            content: await parseConversationPart(part.system),
          };
        }
        if ('user' in part) {
          return {
            role: 'user',
            content: await parseConversationPart(part.user),
          };
        }
        return {
          role: 'assistant',
          content: await parseConversationPart(part.assistant),
        };
      }),
    );
  }
}

async function parseConversationPart(part: string | (string | Blob)[]): Promise<PromptPart[]> {
  if (typeof part === 'string') {
    return [{ text: part }];
  }
  return await Promise.all(part.map(parseContentArray));
}

async function parseContentArray(content: string | Blob): Promise<PromptPart> {
  if (typeof content === 'string') {
    return { text: content };
  }
  const file = await blobToFile(content);
  return { file };
}
