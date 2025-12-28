import { CodeReference } from '$lib/storage/CodeReference';
import type { Provider } from '$lib/types';

export type ProviderId = string | CodeReference;

export function formatProviderId(id: ProviderId): string {
  if (id instanceof CodeReference) {
    return `code:${id.uri}`;
  }
  return id;
}

export function formatProviderLabel(provider: Provider | null): string {
  if (!provider) {
    return 'unknown';
  }
  if (provider instanceof CodeReference || typeof provider === 'string') {
    return formatProviderId(provider);
  }
  return formatProviderId(provider.id);
}
