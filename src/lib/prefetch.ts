/** Keep upcoming preview images warm in the browser cache so duels never wait on the network. */
const warmed = new Set<string>();

export function prefetchImage(url: string): void {
	if (warmed.has(url)) return;
	warmed.add(url);
	new Image().src = url;
}
