import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	esbuild: {
		target: 'es2022'
	},
	build: {
		target: 'es2022'
	},
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		browser: {
			enabled: true,
			name: 'chromium',
			headless: true,
			provider: 'playwright',
			screenshotFailures: false
		}
	}
});
