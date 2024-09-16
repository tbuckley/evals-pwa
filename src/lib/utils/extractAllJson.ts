export function extractAllJsonObjects(input: string): unknown[] {
  const validObjects: unknown[] = [];
  let openBraceIndex = input.indexOf('{');
  let closeBraceIndex = openBraceIndex;

  while (openBraceIndex !== -1) {
    // Find the next closing brace
    closeBraceIndex = input.indexOf('}', closeBraceIndex + 1);

    // If there are no more closing braces, so iterate to the next open brace
    if (closeBraceIndex === -1) {
      openBraceIndex = input.indexOf('{', openBraceIndex + 1);
      closeBraceIndex = openBraceIndex;
      continue;
    }

    // Try extracting an object
    try {
      const object = JSON.parse(input.slice(openBraceIndex, closeBraceIndex + 1));
      validObjects.push(object);

      // Move to after the closing brace
      openBraceIndex = input.indexOf('{', closeBraceIndex + 1);
      closeBraceIndex = openBraceIndex;
    } catch {
      // If the object is invalid, try the next closing brace
    }
  }
  return validObjects;
}
