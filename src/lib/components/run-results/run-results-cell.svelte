<script lang="ts">
	import type { LiveResult, TestResult } from '$lib/types';
	import type { Readable } from 'svelte/store';
	import { resultDialogStore } from '$lib/state/ui';
	import Button from '../ui/button/button.svelte';
	import SquareCode from 'lucide-svelte/icons/square-code';

	export let testResult: Readable<LiveResult>;

	let firstFailedAssertionMessage: string | null;
	$: firstFailedAssertionMessage =
		($testResult.assertionResults ?? []).filter(
			(assertion) => !assertion.pass && assertion.message
		)[0]?.message ?? null;

	function openRawPromptDialog() {
		resultDialogStore.set({
			title: `Raw Prompt`,
			result: $testResult
		});
	}
</script>

<div class="relative">
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
	<div class="whitespace-pre-wrap break-words">
		{$testResult.error ?? $testResult.output ?? '--no output--'}
	</div>
	<Button
		on:click={openRawPromptDialog}
		variant="ghost"
		size="icon"
		class="absolute right-0 top-0 text-gray-500"
	>
		<SquareCode class="h-5 w-5"></SquareCode>
	</Button>
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
