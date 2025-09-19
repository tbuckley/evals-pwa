// Use JSON Merge Patch (RFC 7396)
export function deepMerge(a: unknown, b: unknown): unknown {
  if (!isObject(a) || !isObject(b)) {
    return b;
  }

  const result: Record<string, unknown> = {};
  for (const key in a) {
    if (key in b) {
      const res = deepMerge(a[key], b[key]);
      if (res !== null) {
        result[key] = res;
      }
    } else {
      result[key] = a[key];
    }
  }
  for (const key in b) {
    if (!(key in a)) {
      result[key] = b[key];
    }
  }

  return result;
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && Object.getPrototypeOf(val) === Object.prototype;
}
