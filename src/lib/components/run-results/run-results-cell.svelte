<script lang="ts">
	import type { LiveResult, TestResult } from '$lib/types';
	import type { Readable } from 'svelte/store';

	export let testResult: Readable<LiveResult>;

	let firstFailedAssertionMessage: string | null;
	$: firstFailedAssertionMessage =
		($testResult.assertionResults ?? []).filter(
			(assertion) => !assertion.pass && assertion.message
		)[0]?.message ?? null;
</script>

<div>
	{#if $testResult.state === 'success'}
		<div
			class="mb-2 inline-block rounded-sm border border-green-700 bg-green-100 p-1 text-green-700"
		>
			PASS
		</div>
	{:else if $testResult.state === 'error'}
		<div class="mb-2 inline-block rounded-sm border border-red-700 bg-red-100 p-1 text-red-700">
			FAIL {firstFailedAssertionMessage ? ' - ' + firstFailedAssertionMessage : ''}
		</div>
	{:else}
		<div class="mb-2 inline-block rounded-sm border border-gray-700 bg-gray-100 p-1 text-gray-700">
			{$testResult.state === 'in-progress' ? 'IN PROGRESS' : 'WAITING'}
		</div>
	{/if}
	<div class="whitespace-pre-wrap">
		{$testResult.error ?? $testResult.output ?? '--no output--'}
	</div>
	{#if typeof $testResult.latencyMillis === 'number'}
		<div class="mt-2 text-xs font-bold text-gray-500">{$testResult.latencyMillis}ms</div>
	{/if}
	{#if typeof $testResult.tokenUsage === 'object'}
		<div class="mt-2 text-xs font-bold text-gray-500">
			{#if $testResult.tokenUsage.inputTokens && $testResult.tokenUsage.outputTokens}
				<span>
					({$testResult.tokenUsage.inputTokens}+{$testResult.tokenUsage.outputTokens})
				</span>
			{/if}
			{#if $testResult.tokenUsage.costDollars}
				<span>
					${$testResult.tokenUsage.costDollars.toFixed(4)}
				</span>
			{/if}
		</div>
	{/if}
</div>
