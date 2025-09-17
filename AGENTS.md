Always validate before finishing a change:
* `CI=1 npm run test` - use CI=1 to run non-interactively.
  If browsers are not available, `npx playwright install --with-deps chromium`
* `npm run check`
* `npm run lint`
