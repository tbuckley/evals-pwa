export async function hashJson(obj: unknown): Promise<string> {
  const canonicalize = (obj: unknown): unknown => {
    if (Array.isArray(obj)) {
      return obj.map(canonicalize);
    } else if (typeof obj === 'object' && obj !== null) {
      const sortedKeys = Object.keys(obj).sort();
      const result: Record<string, unknown> = {};
      for (const key of sortedKeys) {
        result[key] = canonicalize((obj as Record<string, unknown>)[key]);
      }
      return result;
    } else {
      return obj;
    }
  };

  const canonicalizedObj = canonicalize(obj);
  const jsonString = JSON.stringify(canonicalizedObj);

  // Encode the JSON string as a Uint8Array
  const encoder = new TextEncoder();
  const data = encoder.encode(jsonString);

  // Hash the data using SHA-256
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // Convert the hash buffer to a hexadecimal string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}
