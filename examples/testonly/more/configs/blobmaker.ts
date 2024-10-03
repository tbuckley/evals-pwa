export function execute() {
  const blob = new Blob(['test'], { type: 'image/png' });
  console.log(blob);
  return {
    pass: false,
    message: 'Test blob',
    visuals: [blob],
  };
}
