<script lang="ts">
	import '../app.css';

	let { children } = $props();

	/** Amber dot on a dark rounded square. */
	const favicon =
		"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230f1210'/%3E%3Ccircle cx='32' cy='32' r='15' fill='%23e2a03f'/%3E%3C/svg%3E";
</script>

<svelte:head>
	<title>focull</title>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
