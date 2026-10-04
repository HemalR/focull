import type { AssetResponseDto } from '@immich/sdk';
import { describe, expect, it } from 'vitest';
import { nearbyPlaces } from './places';
import { session } from './session.svelte';
import { DEFAULT_SETTINGS, type Place } from './types';

const T0 = Date.parse('2018-07-14T10:00:00Z');

/** `latitude`: a number for GPS, null for none, undefined for "not known" (sessions saved before locations were kept). */
const photo = (id: string, minutes: number, latitude?: number | null, city?: string) =>
	({
		id,
		fileCreatedAt: new Date(T0 + minutes * 60_000).toISOString(),
		exifInfo: { latitude, longitude: latitude == null ? latitude : 0, city, country: city && 'Portugal' }
	}) as AssetResponseDto;

const PORTO: Place = { latitude: 41.1, longitude: -8.6, label: 'Porto, Portugal' };
const LISBON: Place = { latitude: 38.7, longitude: -9.1, label: 'Lisbon, Portugal' };

describe('planned places', () => {
	it('fill only photos Immich says have no GPS, and a photo’s own pick wins', () => {
		const [gps, none, unknown, picked] = [photo('gps', 0, 41), photo('none', 1, null), photo('unknown', 2), photo('picked', 3, null)];
		session.start([{ id: 'g', kind: 'photo', assets: [gps, none, unknown, picked] }], { kind: 'unreviewed' }, DEFAULT_SETTINGS);
		session.setPhotoPlace('picked', LISBON);

		expect(session.setGroupPlace(PORTO)).toBe(1);
		expect(session.placeAssignments()).toEqual([
			{ place: PORTO, assetIds: ['none'] },
			{ place: LISBON, assetIds: ['picked'] }
		]);

		session.setPhotoPlace('none', null);
		expect(session.placeAssignments()).toEqual([{ place: LISBON, assetIds: ['picked'] }]);
	});
});

it('suggests where nearby photos were, nearest first, one per place, within 6 hours', () => {
	const assets = [photo('a', -30, 41, 'Porto'), photo('b', 10, 41, 'Porto'), photo('c', 60, 38, 'Lisbon'), photo('d', 400, 37, 'Faro')];
	expect(nearbyPlaces(assets, T0).map((p) => p.label)).toEqual(['Porto, Portugal', 'Lisbon, Portugal']);
});
