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
	const plan = buildPlan([group('a', 'b'), group('c', 'd')], [done, open], {
		albums: [{ ...X, assetIds: ['a', 'b', 'c', 'd'] }]
	});
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

it('commits a photo group partway: the calls so far go in while the champion stays in play', () => {
	const video: CullGroup = { ...group('v', 'w', 'x'), kind: 'video' };
	session.start([group('a', 'b', 'c', 'd'), video], { kind: 'unreviewed' }, DEFAULT_SETTINGS);
	const plan = () => buildPlan(session.groups, session.states, session.intent(), new Set(session.committedIds));
	session.defend();
	session.defend(); // b and c lose to a; d still waits
	expect(plan()).toMatchObject({ reviewedIds: ['b', 'c'], rejectIds: ['b', 'c'], stacks: [['a', 'b', 'c']] });

	session.markCommitted();
	session.dethrone(); // d beats a — Immich folds a's stack into d's
	expect(plan()).toMatchObject({ reviewedIds: ['a', 'd'], rejectIds: ['a'], stacks: [['d', 'a']] });

	session.gotoNextPending();
	session.defend(); // a reel needs the whole event, so video groups wait for their end
	expect(session.isCommittable(1)).toBe(false);
});

it('keeps neither: both culled, and the next challenger becomes the one to beat', () => {
	session.start([group('a', 'b', 'c'), group('d', 'e')], { kind: 'unreviewed' }, DEFAULT_SETTINGS);
	session.neither();
	expect(session.current).toMatchObject({ championIdx: 2, queue: [], fates: { 0: 'rejected', 1: 'rejected' } });

	session.gotoNextPending();
	session.neither(); // the last two: nobody survives
	expect(session.current).toMatchObject({ championIdx: 0, queue: [], fates: { 0: 'rejected', 1: 'rejected' } });

	const plan = buildPlan(session.groups, session.states);
	expect(plan.rejectIds).toEqual(['a', 'b', 'd', 'e']);
	expect(plan.stacks).toEqual([['c', 'a', 'b']]);
});

it('favorites only the survivors, and unfavorites culled photos too', () => {
	const photo = (id: string, isFavorite = false) => ({ id, isFavorite }) as AssetResponseDto;
	const [a, b, c] = [photo('a'), photo('b'), photo('c', true)];
	session.start([{ id: 'g', kind: 'photo', assets: [a, b, c] }], { kind: 'unreviewed' }, DEFAULT_SETTINGS);
	expect([a, b, c].map((p) => session.toggleFavorite(p))).toEqual([true, true, false]);
	session.toggleFavorite(c); // back to how Immich has it: nothing to change
	expect(session.favorites).toEqual({ a: true, b: true });

	session.toggleFavorite(c);
	session.defend();
	session.defend(); // b and c culled
	expect(buildPlan(session.groups, session.states, session.intent()).favorites).toEqual({ on: ['a'], off: ['c'] });
});
