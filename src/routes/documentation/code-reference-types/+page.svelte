<script lang="ts">
  import codeReferenceTypes from '$lib/documentation/codeReferenceTypes.ts?raw';

  const downloadUrl = '/documentation/code-reference-types/types';
</script>

<svelte:head>
  <title>CodeReference Types</title>
</svelte:head>

<div class="prose max-w-none">
  <h1>CodeReference Types</h1>
  <p>
    Copy the TypeScript definitions below or
    <a href={downloadUrl} download="code-reference-types.ts">download the file</a>
    to keep all CodeReference-related types in sync with your project. This file is generated directly
    from the source types, so it stays aligned as we evolve the API.
  </p>

  <pre><code>{codeReferenceTypes}</code></pre>
</div>
