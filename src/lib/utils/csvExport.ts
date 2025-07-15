import type { LiveRun } from '../types';
import type { AnnotationManager } from '../state/annotations';
import { get } from 'svelte/store';

export interface CsvExportOptions {
  includeNotes?: boolean;
  annotations?: AnnotationManager | null;
}

export function generateCsvContent(run: LiveRun, options: CsvExportOptions = {}): string {
  const { includeNotes = false, annotations = null } = options;

  // Build headers
  const headers = ['Test'];

  // Add variable headers in the same order as displayed
  for (const varName of run.varNames) {
    headers.push(varName);
  }

  // Add environment headers with notes columns
  for (let envIndex = 0; envIndex < run.envs.length; envIndex++) {
    const env = run.envs[envIndex];
    let envHeader = 'unknown';
    if (typeof env.provider === 'string') {
      envHeader = env.provider;
    } else if (env.provider !== null) {
      envHeader = env.provider.id;
    }
    headers.push(envHeader);

    if (get(run.results[0][envIndex]).history) {
      headers.push(`${envHeader} History`);
    }

    // Add Notes column after each environment if annotations exist and includeNotes is true
    if (includeNotes && annotations) {
      headers.push(`${envHeader} Notes`);
    }
  }

  // Build provider row
  const providerRow = ['Provider'];
  for (const _varName of run.varNames) {
    providerRow.push(''); // Empty cells for var columns
  }
  for (let envIndex = 0; envIndex < run.envs.length; envIndex++) {
    const env = run.envs[envIndex];
    let providerName = 'unknown';
    if (typeof env.provider === 'string') {
      providerName = env.provider;
    } else if (env.provider !== null) {
      providerName = env.provider.id;
    }
    providerRow.push(providerName);

    if (get(run.results[0][envIndex]).history) {
      providerRow.push(''); // Empty cell for history column
    }

    if (includeNotes && annotations) {
      providerRow.push(''); // Empty cell for notes column
    }
  }

  // Build prompt row
  const promptRow = ['Prompt'];
  for (const _varName of run.varNames) {
    promptRow.push(''); // Empty cells for var columns
  }
  for (let envIndex = 0; envIndex < run.envs.length; envIndex++) {
    const env = run.envs[envIndex];
    const promptText =
      typeof env.prompt === 'string' ? env.prompt : JSON.stringify(env.prompt, null, 2);
    promptRow.push(promptText);

    if (get(run.results[0][envIndex]).history) {
      providerRow.push(''); // Empty cell for history column
    }

    if (includeNotes && annotations) {
      promptRow.push(''); // Empty cell for notes column
    }
  }

  // Build data rows
  const dataRows = [];
  for (let testIndex = 0; testIndex < run.results.length; testIndex++) {
    const test = run.tests[testIndex];
    const row = [test.description ?? 'Test'];

    // Add variable values in the same order as headers
    for (const varName of run.varNames) {
      const varValue: unknown = test.vars?.[varName];
      if (varValue === undefined || varValue === null) {
        row.push('');
      } else if (typeof varValue === 'string') {
        row.push(varValue);
      } else {
        row.push(JSON.stringify(varValue));
      }
    }

    // Add test results and notes
    for (let envIndex = 0; envIndex < run.envs.length; envIndex++) {
      const result = get(run.results[testIndex][envIndex]);

      // Add test result
      let resultText = '--no output--';
      if (result.error) {
        resultText = result.error;
      } else if (typeof result.output === 'string') {
        resultText = result.output;
      } else if (Array.isArray(result.output)) {
        resultText = result.output
          .map((item) => (typeof item === 'string' ? item : `![](${item.uri})`))
          .join('');
      }
      row.push(resultText);

      if (get(run.results[0][envIndex]).history) {
        const history = (result.history ?? []).map((h) => ({ id: h.id, output: h.output ?? null }));
        row.push(JSON.stringify(history, null, 2));
      }

      // Add notes if annotations exist and includeNotes is true
      if (includeNotes && annotations) {
        const cellAnnotation = get(annotations.getCellAnnotation([testIndex, envIndex]));
        const notes = cellAnnotation.notes?.value ?? '';
        row.push(notes);
      }
    }

    dataRows.push(row);
  }

  // Combine all rows
  const allRows = [headers, providerRow, promptRow, ...dataRows];

  // Convert to CSV
  const csv = allRows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  return csv;
}

export function downloadCsv(content: string, filename: string): void {
  // Create blob and download link
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
