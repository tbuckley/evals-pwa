<script lang="ts">
	import type { TestResult } from '$lib/types';

	export let testResult: TestResult;

	let firstFailedAssertionMessage: string | null;
	$: firstFailedAssertionMessage =
		testResult.assertionResults.filter((assertion) => !assertion.pass && assertion.message)[0]
			?.message ?? null;
</script>

<div>
	{#if testResult.pass}
		<div
			class="mb-2 inline-block rounded-sm border border-green-700 bg-green-100 p-1 text-green-700"
		>
			PASS
		</div>
	{:else}
		<div class="mb-2 inline-block rounded-sm border border-red-700 bg-red-100 p-1 text-red-700">
			FAIL {firstFailedAssertionMessage ? ' - ' + firstFailedAssertionMessage : ''}
		</div>
	{/if}
	<div>{testResult.error ?? testResult.output ?? '--no output--'}</div>
	{#if typeof testResult.latencyMillis === 'number'}
		<div class="mt-2 text-xs font-bold text-gray-500">{testResult.latencyMillis}ms</div>
	{/if}
</div>
