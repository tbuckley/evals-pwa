export function prepare(prompt, { env }) {
  return { prompt, greeting: env.GREETING ?? 'Hello' };
}

export function run(key) {
  const text = key.prompt?.[0]?.content?.[0]?.text ?? '';
  return `${key.greeting}: ${text}`;
}

export const env = ['GREETING'];
