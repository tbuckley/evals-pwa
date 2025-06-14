async function execute(vars, mimeTypes) {
  const size = vars.number * 100;
  const resp = await fetch(`https://placehold.co/600x${size}.png`);
  const blob = await resp.blob();
  return ['How big is this image?', blob];
}
