import { thumbHashToDataURL } from 'thumbhash';

const cache = new Map<string, string | null>();

/** Decoded thumbhash as a data-URL for instant image placeholders; null when the asset has none. */
export function thumbhashUrl(asset: { id: string; thumbhash: string | null }): string | null {
	const hit = cache.get(asset.id);
	if (hit !== undefined) return hit;
	let url: string | null = null;
	if (asset.thumbhash) {
		try {
			url = thumbHashToDataURL(Uint8Array.from(atob(asset.thumbhash), (c) => c.charCodeAt(0)));
		} catch {
			// malformed hash — no placeholder
		}
	}
	cache.set(asset.id, url);
	return url;
}

/** Ready-to-use CSS for an <img> that should show its thumbhash until pixels arrive. */
export function thumbhashStyle(
	asset: { id: string; thumbhash: string | null },
	size: 'cover' | 'contain' = 'cover'
): string {
	const url = thumbhashUrl(asset);
	return url
		? `background-image:url(${url});background-size:${size};background-position:center;background-repeat:no-repeat;`
		: '';
}
