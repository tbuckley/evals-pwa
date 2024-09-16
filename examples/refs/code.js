function execute(output) {
  const pass = output.split('').reverse().join('').includes('friend');
  return {
    pass,
    message: pass ? undefined : `Output doesn't contain 'friend' in reverse: ${output}`,
  };
}
