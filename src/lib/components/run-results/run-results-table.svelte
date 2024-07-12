<script lang="ts">
	import type { Prompt, Provider, Run } from '$lib/types';
	import { createTable, Render, Subscribe } from 'svelte-headless-table';
	import { readable } from 'svelte/store';
	import * as Table from '../ui/table/';

	export let run: Run;

	function getColumnName(env: { provider: Provider; prompt: Prompt }): string {
		if (typeof env.provider === 'string') {
			return env.provider + ' ' + env.prompt;
		}
		return env.provider.id + ' ' + env.prompt;
	}

	const table = createTable(readable(run.results));
	const columns = table.createColumns([
		table.column({
			header: 'Test',
			accessor: (row) => {
				const index = run.results.indexOf(row);
				return run.tests[index];
			},
			cell: ({ value }) => {
				return value.description ?? 'Test';
			}
		}),
		...run.envs.map((env, index) =>
			table.column({
				header: getColumnName(env),
				accessor: (row) => row[index],
				cell: ({ value }) => {
					return `${value.pass ? '[PASS]' : '[FAIL]'}: ${value.error ?? value.output ?? ''}`;
				}
			})
		)
	]);

	const { headerRows, pageRows, tableAttrs, tableBodyAttrs } = table.createViewModel(columns);
</script>

<div class="rounded-md border">
	<Table.Root {...$tableAttrs}>
		<Table.Header>
			{#each $headerRows as headerRow}
				<Subscribe rowAttrs={headerRow.attrs()}>
					<Table.Row>
						{#each headerRow.cells as cell (cell.id)}
							<Subscribe attrs={cell.attrs()} let:attrs props={cell.props()}>
								<Table.Head {...attrs}>
									<Render of={cell.render()} />
								</Table.Head>
							</Subscribe>
						{/each}
					</Table.Row>
				</Subscribe>
			{/each}
		</Table.Header>
		<Table.Body {...$tableBodyAttrs}>
			{#each $pageRows as row (row.id)}
				<Subscribe rowAttrs={row.attrs()} let:rowAttrs>
					<Table.Row {...rowAttrs}>
						{#each row.cells as cell (cell.id)}
							<Subscribe attrs={cell.attrs()} let:attrs>
								<Table.Cell {...attrs}>
									<Render of={cell.render()} />
								</Table.Cell>
							</Subscribe>
						{/each}
					</Table.Row>
				</Subscribe>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
