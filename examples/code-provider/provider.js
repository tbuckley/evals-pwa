export function prepare(prompt, { env, config: _config }) {
  return { prompt, greeting: env.GREETING };
}

export function run(key, { env, config: _config }) {
  const text = key.prompt?.[0]?.content?.[0]?.text ?? '';
  return `${env.GREETING}: ${text}`;
}

export const env = ['GREETING'];
