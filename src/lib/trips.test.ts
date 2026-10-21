import { AssetTypeEnum, type AssetResponseDto } from '@immich/sdk';
import { describe, expect, it } from 'vitest';
import { takenAt } from './grouping';
import { linkedAssets, tripSpan } from './trips';
import { DEFAULT_SETTINGS } from './types';

const DAY = 86_400_000;
const T0 = Date.parse('2018-06-01T12:00:00Z');
const PLACES = { perth: [-31.95, 115.86], porto: [41.15, -8.61], lisbon: [38.72, -9.14] } as const;

/** A photo `days` after T0, at a place (or without GPS). */
const shot = (id: string, days: number, place: keyof typeof PLACES | null) =>
	({
		id,
		fileCreatedAt: new Date(T0 + days * DAY).toISOString(),
		exifInfo: place ? { latitude: PLACES[place][0], longitude: PLACES[place][1] } : { latitude: null, longitude: null }
	}) as AssetResponseDto;

const days = (from: number, to: number, place: keyof typeof PLACES | null, step = 1) =>
	Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => shot(`${place}${from + i * step}`, from + i * step, place));

/** The span as day offsets from T0. */
const span = (assets: AssetResponseDto[], anchor: AssetResponseDto) => {
	const { start, end, away } = tripSpan(assets, anchor, 5 * 60_000);
	return { start: (start - T0) / DAY, end: (end - T0) / DAY, away };
};

describe('tripSpan', () => {
	const home = [...days(0, 29, 'perth'), ...days(46, 80, 'perth')];
	const trip = [...days(30, 37, 'porto'), ...days(38, 45, 'lisbon')];

	it('follows a trip away from home to its first and last day, whatever the cities', () => {
		const all = [...home, ...trip];
		expect(span(all, trip[9])).toEqual({ start: 30, end: 45, away: true });
	});

	it('ends a trip after 3 days without photos, even with no photo back home', () => {
		const all = [...home.filter((a) => takenAt(a) < T0 + 30 * DAY), ...trip.slice(0, 5), ...days(40, 45, 'lisbon')];
		expect(span(all, trip[2])).toEqual({ start: 30, end: 34, away: true });
	});

	it('covers a few days at home, stopping short of the next trip', () => {
		const all = [...days(0, 28, 'perth', 0.5), ...days(29, 32, 'porto'), ...days(40, 60, 'perth')];
		expect(span(all, all[50])).toEqual({ start: 25, end: 28, away: false });
		expect(span(all, all[54])).toEqual({ start: 27, end: 28, away: false });
	});

	it('falls back to a few days from the anchor when nothing has GPS', () => {
		const all = days(0, 10, null, 0.5);
		expect(span(all, all[4])).toEqual({ start: 2, end: 5, away: false });
	});
});

describe('linkedAssets', () => {
	/** A photo `minutes` after T0. */
	const photo = (id: string, minutes: number) =>
		({ id, type: AssetTypeEnum.Image, fileCreatedAt: new Date(T0 + minutes * 60_000).toISOString() }) as AssetResponseDto;
	// A burst around the anchor, then another scene an hour later.
	const anchor = photo('anchor', 3);
	const trip = [photo('a', 0), photo('b', 1), photo('c', 2), anchor, photo('d', 60), photo('e', 61)];

	it("brings the anchor's scene back whole, but not culled photos or the trip's other reviewed ones", () => {
		const judged = { reviewed: new Set(['anchor', 'a', 'b', 'd']), culled: new Set(['b']) };
		expect(linkedAssets(anchor, trip, judged, DEFAULT_SETTINGS).map((a) => a.id)).toEqual(['anchor', 'a', 'c', 'e']);
	});
});
