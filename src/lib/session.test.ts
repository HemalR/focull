import type { AssetResponseDto } from '@immich/sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildPlan } from './commit';
import { session } from './session.svelte';
import { DEFAULT_SETTINGS, type CullGroup, type GroupState } from './types';

const group = (...ids: string[]): CullGroup => ({
	id: ids[0],
	kind: 'photo',
	assets: ids.map((id) => ({ id }) as AssetResponseDto)
});

const X = { albumId: 'x', name: 'Portugal' };
const Y = { albumId: 'y', name: 'Lisbon' };
const Z = { name: 'Best of' };

/** album name → asset ids bound for it */
const filed = () => Object.fromEntries(session.albumAssignments().map((a) => [a.name, a.assetIds]));

describe('group albums', () => {
	beforeEach(() => {
		session.start([group('a', 'b'), group('c'), group('d')], { kind: 'unreviewed' }, DEFAULT_SETTINGS);
	});

	it('carry forward from the group they are set on until the next one', () => {
		session.setGroupAlbum(X);
		session.gi = 2;
		session.setGroupAlbum(Y);
		expect([0, 1, 2].map((gi) => session.groupAlbum(gi)?.name)).toEqual(['Portugal', 'Portugal', 'Lisbon']);
		expect(filed()).toEqual({ Portugal: ['a', 'b', 'c'], Lisbon: ['d'] });
	});

	it('let one photo leave its group album or join another, and a new group album resets exceptions', () => {
		session.setGroupAlbum(X);
		expect(session.togglePhotoAlbum(X, 'a')).toBe(false);
		expect(session.togglePhotoAlbum(Z, 'a')).toBe(true);
		expect(filed()).toEqual({ 'Best of': ['a'], Portugal: ['b', 'c', 'd'] });

		session.setGroupAlbum(Y);
		expect(filed()).toEqual({ 'Best of': ['a'], Lisbon: ['a', 'b', 'c', 'd'] });
	});
});

it('files only the survivors of finished groups', () => {
	const done: GroupState = { championIdx: 0, queue: [], fates: { 1: 'rejected' }, lostTo: { 1: 0 } };
	const open: GroupState = { championIdx: 0, queue: [1], fates: {}, lostTo: {} };
	const plan = buildPlan([group('a', 'b'), group('c', 'd')], [done, open], DEFAULT_SETTINGS, [
		{ ...X, assetIds: ['a', 'b', 'c', 'd'] }
	]);
	expect(plan.albums).toEqual([{ ...X, assetIds: ['a'] }]);
});

it('commits each finished group once, then carries on with the rest', () => {
	session.start([group('a'), group('b'), group('c')], { kind: 'unreviewed' }, DEFAULT_SETTINGS);
	session.decideSingle(true);
	expect([0, 1, 2].map((i) => session.isCommittable(i))).toEqual([true, false, false]);
	expect(session.pendingCount).toBe(2);

	session.markCommitted();
	session.gotoNextPending();
	session.decideSingle(false);
	expect([0, 1, 2].map((i) => session.isCommittable(i))).toEqual([false, true, false]);
	expect(session.undo()).toBe(true); // undo still works within what's not committed
	expect(session.isCommittable(0)).toBe(false);
});
