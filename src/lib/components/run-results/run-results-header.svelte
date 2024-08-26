<script lang="ts">
	import type { Env } from '$lib/types';

	export let env: Env;

	$: providerId = typeof env.provider === 'string' ? env.provider : env.provider.id;
</script>

<div>
	<div>{providerId}</div>
	<div>{env.prompt}</div>
</div>
