import { reverseGeocode, searchPlaces, type AssetResponseDto, type ExifResponseDto } from '@immich/sdk';
import { takenAt } from './grouping';
import type { Place } from './types';

/** "Porto, Portugal": city (or state), then country. */
export const placeLabel = (geo: Pick<ExifResponseDto, 'city' | 'state' | 'country'> | null | undefined): string =>
	[geo?.city ?? geo?.state, geo?.country].filter(Boolean).join(', ');

/**
 * Immich says it has no GPS. Sessions saved before locations were kept can't tell, and
 * count as located, so filling gaps never overwrites real GPS.
 */
export const lacksLocation = (asset: AssetResponseDto): boolean => asset.exifInfo?.latitude === null;

const NEARBY_MS = 6 * 3_600_000;

/** Where photos taken around `t` were: nearest in time first, within 6 hours, one per place, at most 3. */
export function nearbyPlaces(assets: AssetResponseDto[], t: number): Place[] {
	const places: Place[] = [];
	const byDistance = [...assets].sort((a, b) => Math.abs(takenAt(a) - t) - Math.abs(takenAt(b) - t));
	for (const asset of byDistance) {
		if (places.length === 3 || Math.abs(takenAt(asset) - t) > NEARBY_MS) break;
		const { latitude, longitude } = asset.exifInfo ?? {};
		const label = placeLabel(asset.exifInfo);
		if (latitude == null || longitude == null || !label || places.some((p) => p.label === label)) continue;
		places.push({ latitude, longitude, label });
	}
	return places;
}

/** A place search match; `region` (when the name doesn't already say it) tells same-named places apart. */
export interface FoundPlace extends Place {
	region?: string;
}

/** How many matches get looked up for their proper name — one query each on Immich's local place database. */
const NAMED = 8;

/**
 * Immich's place search, each match named the way Immich will show it once set ("Porto,
 * Portugal"). Immich matches place names only, so "porto portugal" or "porto, portugal" also
 * searches the name part ("porto"); matches holding more of the typed words come first.
 */
export async function findPlaces(query: string): Promise<FoundPlace[]> {
	const words = query.toLowerCase().split(/[\s,]+/).filter(Boolean);
	const names = [
		...new Set(
			[query, query.split(',')[0], words.slice(0, -1).join(' '), words[0] ?? '']
				.map((n) => n.trim().toLowerCase())
				.filter(Boolean)
		)
	];
	const found = (await Promise.all(names.map((name) => searchPlaces({ name }).catch(() => [])))).flat();

	/** Typed words found in the text, plus a half point when the name is exactly one that was searched. */
	const fit = (name: string, ...text: (string | undefined)[]) => {
		const haystack = text.join(' ').toLowerCase();
		return words.filter((w) => haystack.includes(w)).length + (names.includes(name.toLowerCase()) ? 0.5 : 0);
	};
	const best = found
		.filter((p, i) => found.findIndex((o) => o.latitude === p.latitude && o.longitude === p.longitude) === i)
		.map((p) => ({ p, fit: fit(p.name, p.name, p.admin1name, p.admin2name) }))
		.sort((a, b) => b.fit - a.fit)
		.slice(0, NAMED);

	const named = await Promise.all(
		best.map(async ({ p }) => {
			const geo = await reverseGeocode({ lat: p.latitude, lon: p.longitude }).then(([g]) => g, () => undefined);
			const label = placeLabel(geo) || [p.name, p.admin1name].filter(Boolean).join(', ');
			const region = [p.admin1name, p.admin2name].find((r) => r && !label.includes(r));
			return {
				place: { latitude: p.latitude, longitude: p.longitude, label, region },
				fit: fit(p.name, label, p.admin1name, p.admin2name)
			};
		})
	);
	return named.sort((a, b) => b.fit - a.fit).map((n) => n.place);
}
