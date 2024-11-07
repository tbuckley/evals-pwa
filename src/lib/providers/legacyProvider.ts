import type { ConversationPrompt, MultiPartPrompt } from '$lib/types';

export function conversationToSinglePrompt(conversation: ConversationPrompt): MultiPartPrompt {
  if (conversation.length > 1) {
    throw new Error('Legacy provider does not support multi-part conversations');
  }

  if (conversation.length === 0) {
    return [];
  }
  return conversation[0].content;
}
