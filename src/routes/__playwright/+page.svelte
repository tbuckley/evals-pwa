<script lang="ts">
	import { CodeSandbox } from '$lib/utils/CodeSandbox';
	import { onDestroy, onMount } from 'svelte';

	// Expose any classes globally for Playwright testing

	onMount(() => {
		(window as any).__dev = {
			CodeSandbox
		};
	});
	onDestroy(() => {
		(window as any).__dev = undefined;
	});
</script>
