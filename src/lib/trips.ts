import type { AssetResponseDto } from '@immich/sdk';
import { localDate } from './format';
import { takenAt } from './grouping';

const DAY = 86_400_000;
/** Within this of home counts as home: a day out near home is everyday life, not a trip. */
const HOME_RADIUS_KM = 50;
/** A trip ends after this long without a single photo, even with no photo back home. */
const TRIP_SILENCE_MS = 3 * DAY;
/** Longest trip one session covers — commit-as-you-go keeps long ones manageable. */
const MAX_TRIP_MS = 30 * DAY;
/** At home there's no natural end, so a stretch covers this long from the anchor's scene. */
const HOME_STRETCH_MS = 3 * DAY;
/** A photo without GPS borrows the nearest fix within this. */
const BORROW_MS = 12 * 3_600_000;

interface Point {
	lat: number;
	lon: number;
}

const gps = (a: AssetResponseDto): Point | null => {
	const { latitude: lat, longitude: lon } = a.exifInfo ?? {};
	return lat == null || lon == null || (lat === 0 && lon === 0) ? null : { lat, lon };
};

/** Great-circle distance in km. */
export function km(a: Point, b: Point): number {
	const rad = Math.PI / 180;
	const h =
		Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
		Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
	return 12_742 * Math.asin(Math.sqrt(h));
}

/**
 * Home: the ~10 km cell photographed on the most different days. Days, not photos, so a
 * week away with 2,000 shots can't outvote months of everyday life.
 */
export function homeOf(assets: AssetResponseDto[]): Point | null {
	const cells = new Map<string, { days: Set<number>; lat: number; lon: number; n: number }>();
	for (const asset of assets) {
		const p = gps(asset);
		if (!p) continue;
		const key = `${Math.round(p.lat * 10)},${Math.round(p.lon * 10)}`;
		const cell = cells.get(key) ?? { days: new Set(), lat: 0, lon: 0, n: 0 };
		cell.days.add(Math.floor(takenAt(asset) / DAY));
		cell.lat += p.lat;
		cell.lon += p.lon;
		cell.n++;
		cells.set(key, cell);
	}
	const best = [...cells.values()].sort((a, b) => b.days.size - a.days.size)[0];
	return best ? { lat: best.lat / best.n, lon: best.lon / best.n } : null;
}

/** A session's time span (inclusive, epoch ms), and whether it's a trip away from home. */
export interface TripSpan {
	start: number;
	end: number;
	away: boolean;
}

/**
 * The trip around `anchor`, from the photos taken in the weeks around it:
 * - away from home: out from the anchor both ways until a photo back home, 3 days without
 *   photos, or 30 days in all — so the session opens on the trip's first day;
 * - at home, or with no GPS to go on: from the anchor's scene, up to 3 days, stopping short
 *   of the next trip.
 */
export function tripSpan(assets: AssetResponseDto[], anchor: AssetResponseDto, sceneGapMs: number): TripSpan {
	const timeline = [...assets].sort((a, b) => takenAt(a) - takenAt(b));
	const t0 = takenAt(anchor);
	const i0 = Math.max(
		timeline.findIndex((a) => takenAt(a) >= t0),
		0
	);
	const home = homeOf(timeline);
	const where = (a: AssetResponseDto): 'home' | 'away' | null => {
		const p = gps(a);
		return p && home ? (km(p, home) > HOME_RADIUS_KM ? 'away' : 'home') : null;
	};
	const fix = timeline
		.filter((a) => where(a) && Math.abs(takenAt(a) - t0) <= BORROW_MS)
		.sort((a, b) => Math.abs(takenAt(a) - t0) - Math.abs(takenAt(b) - t0))[0];

	if (fix && where(fix) === 'away') {
		/** The furthest photo still on the trip, stepping one way along the timeline. */
		const reach = (step: 1 | -1): number => {
			let edge = t0;
			for (let i = i0 + step; i >= 0 && i < timeline.length; i += step) {
				const t = takenAt(timeline[i]);
				if (Math.abs(t - edge) > TRIP_SILENCE_MS || Math.abs(t - t0) > MAX_TRIP_MS) break;
				if (where(timeline[i]) === 'home') break;
				edge = t;
			}
			return edge;
		};
		const start = reach(-1);
		return { start, end: Math.min(reach(1), start + MAX_TRIP_MS), away: true };
	}

	let start = t0;
	for (let i = i0 - 1; i >= 0 && start - takenAt(timeline[i]) <= sceneGapMs; i--) start = takenAt(timeline[i]);
	let end = t0;
	for (let i = i0 + 1; i < timeline.length; i++) {
		const t = takenAt(timeline[i]);
		if (t - t0 > HOME_STRETCH_MS || where(timeline[i]) === 'away') break;
		end = t;
	}
	return { start, end, away: false };
}

/** The most photographed cities, most first. */
export function topCities(assets: AssetResponseDto[], n = 3): string[] {
	const counts = new Map<string, number>();
	for (const a of assets) {
		const city = a.exifInfo?.city;
		if (city) counts.set(city, (counts.get(city) ?? 0) + 1);
	}
	return [...counts]
		.sort((a, b) => b[1] - a[1])
		.slice(0, n)
		.map(([city]) => city);
}

/** "a trip back to Jul 12, 2018 — Vienna, Lisbon, Sintra" */
export const tripLabel = (firstLocalDateTime: string, places: string[] = []): string =>
	`a trip back to ${localDate(firstLocalDateTime)}${places.length > 0 ? ` — ${places.join(', ')}` : ''}`;
