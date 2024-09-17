export function objectDfsMap(
  val: unknown,
  map: (val: unknown, path: string) => unknown,
  path = '$',
): unknown {
  if (Array.isArray(val)) {
    return val.map((v, i) => objectDfsMap(v, map, `${path}[${i}]`));
  }
  if (typeof val === 'object' && val !== null && Object.getPrototypeOf(val) === Object.prototype) {
    const obj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(val)) {
      obj[key] = objectDfsMap(value as unknown, map, path + '.' + key);
    }
    return obj;
  }
  return map(val, path);
}

export async function asyncObjectDfsMap(
  val: unknown,
  map: (val: unknown, path: string) => Promise<unknown>,
  path = '$',
): Promise<unknown> {
  if (Array.isArray(val)) {
    return await Promise.all(val.map((v, i) => asyncObjectDfsMap(v, map, `${path}[${i}]`)));
  }
  if (typeof val === 'object' && val !== null && Object.getPrototypeOf(val) === Object.prototype) {
    const obj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(val)) {
      obj[key] = await asyncObjectDfsMap(value as unknown, map, path + '.' + key);
    }
    return obj;
  }
  return map(val, path);
}
