import {
	AssetVisibility,
	addAssetsToAlbum,
	bulkTagAssets,
	createAlbum,
	createStack,
	deleteAssets,
	updateAssets,
	upsertTags
} from '@immich/sdk';
import type { CullGroup, GroupState, PlannedPlace, Settings, StagedAlbum } from './types';
import { takenAt } from './grouping';

export interface ReelPlan {
	/** Clips to stitch, chronological. */
	assetIds: string[];
	/** Assets stacked beneath the stitched result (sources + rejects). */
	stackWith: string[];
	filename: string;
}

export interface CommitPlan {
	rejectIds: string[];
	/** Each stack: winner first (Immich makes the first ID the primary). */
	stacks: string[][];
	reels: ReelPlan[];
	/** Every asset a finished group processed — tagged as reviewed so later sessions skip them. */
	reviewedIds: string[];
	/** Album assignments for finished groups, minus anything culled. */
	albums: StagedAlbum[];
	/** Location moves for finished groups, minus anything culled. */
	locations: PlannedPlace[];
}

/** Pure translation of finished battle states into Immich writes; drives both the review screen and the commit. */
export function buildPlan(
	groups: CullGroup[],
	states: GroupState[],
	_settings: Settings,
	stagedAlbums: StagedAlbum[] = [],
	places: PlannedPlace[] = []
): CommitPlan {
	const plan: CommitPlan = { rejectIds: [], stacks: [], reels: [], reviewedIds: [], albums: [], locations: [] };

	groups.forEach((group, i) => {
		const state = states[i];
		if (state.queue.length > 0) return; // group not finished — leave it untouched
		plan.reviewedIds.push(...group.assets.map((a) => a.id));

		const rejectIdxs = group.assets.map((_, ai) => ai).filter((ai) => state.fates[ai] === 'rejected');
		const rejects = rejectIdxs.map((ai) => group.assets[ai].id);
		plan.rejectIds.push(...rejects);

		// A culled champion (all-culled group, or "cull this one too") means no winner.
		const winnerRejected = state.fates[state.championIdx] === 'rejected';
		const reelSources =
			group.kind === 'video'
				? group.assets
						.filter(
							(_, ai) => state.fates[ai] === 'reel' || (ai === state.championIdx && !winnerRejected)
						)
						.map((a) => a.id)
				: [];

		if (reelSources.length >= 2) {
			// The stitched video represents the whole event; every reject stacks beneath it.
			const start = new Date(Math.min(...group.assets.map(takenAt)));
			plan.reels.push({
				assetIds: reelSources,
				stackWith: [...reelSources, ...rejects],
				filename: `focull-${start.toISOString().slice(0, 19).replaceAll(':', '-')}.mp4`
			});
		} else {
			// Per-reference stacking: each reject goes behind the keeper it actually lost to.
			const byTarget = new Map<number, string[]>();
			for (const ai of rejectIdxs) {
				const target = resolveStackTarget(ai, group, state);
				if (target !== null) {
					byTarget.set(target, [...(byTarget.get(target) ?? []), group.assets[ai].id]);
				}
				// Unresolvable (no surviving keeper) → tagged but unstacked.
			}
			for (const [target, ids] of byTarget) {
				plan.stacks.push([group.assets[target].id, ...ids]);
			}
		}
	});

	// Album and location intent holds for assets of finished groups that survived.
	const rejected = new Set(plan.rejectIds);
	const finished = new Set(plan.reviewedIds);
	const holds = (ids: string[]) => ids.filter((id) => finished.has(id) && !rejected.has(id));
	for (const staged of stagedAlbums) {
		const assetIds = holds(staged.assetIds);
		if (assetIds.length > 0) plan.albums.push({ ...staged, assetIds });
	}
	for (const { place, assetIds: ids } of places) {
		const assetIds = holds(ids);
		if (assetIds.length > 0) plan.locations.push({ place, assetIds });
	}
	return plan;
}

const survives = (ai: number, state: GroupState): boolean =>
	state.fates[ai] === 'kept' ||
	state.fates[ai] === 'reel' ||
	(ai === state.championIdx && state.fates[ai] === undefined);

/**
 * Walk a reject's lostTo chain to a surviving keeper (a dethroned champion may itself be
 * culled). Dead ends fall back to the latest surviving keeper in the group, or null when
 * nothing survived — such rejects are tagged but not stacked.
 */
function resolveStackTarget(rejectIdx: number, group: CullGroup, state: GroupState): number | null {
	const lostTo = state.lostTo ?? {};
	const seen = new Set<number>();
	let ai: number | undefined = lostTo[rejectIdx] ?? (survives(state.championIdx, state) ? state.championIdx : undefined);
	while (ai !== undefined && !seen.has(ai)) {
		if (survives(ai, state)) return ai;
		seen.add(ai);
		ai = lostTo[ai];
	}
	for (let i = group.assets.length - 1; i >= 0; i--) {
		if (i !== rejectIdx && survives(i, state)) return i;
	}
	return null;
}

export interface StitchResponse {
	id: string;
	filename: string;
	durationMs: number;
	clipCount: number;
}

/** Apply a plan to Immich. Logs progress lines as it goes; throws only on total failure of a phase. */
export async function commitPlan(
	plan: CommitPlan,
	settings: Settings,
	log: (line: string) => void
): Promise<void> {
	if (plan.rejectIds.length > 0) {
		const n = plan.rejectIds.length;
		if (settings.rejectAction === 'tag') {
			const [tag] = await upsertTags({ tagUpsertDto: { tags: [settings.tagName] } });
			await bulkTagAssets({ tagBulkAssetsDto: { assetIds: plan.rejectIds, tagIds: [tag.id] } });
			log(`Tagged ${n} culled asset${n === 1 ? '' : 's'} #${settings.tagName} — nothing deleted`);
		} else if (settings.rejectAction === 'archive') {
			await updateAssets({
				assetBulkUpdateDto: { ids: plan.rejectIds, visibility: AssetVisibility.Archive }
			});
			log(`Archived ${n} culled asset${n === 1 ? '' : 's'}`);
		} else {
			await deleteAssets({ assetBulkDeleteDto: { ids: plan.rejectIds, force: false } });
			log(`Moved ${n} culled asset${n === 1 ? '' : 's'} to Immich trash`);
		}
	}

	for (const assetIds of plan.stacks) {
		try {
			await createStack({ stackCreateDto: { assetIds } });
			log(`Stack written — ${assetIds.length} assets, winner is primary`);
		} catch (e) {
			log(`Could not stack ${assetIds.length} assets (already stacked?): ${message(e)}`);
		}
	}

	/** Source clip → the stitched video it became, so the reel follows its clips into albums. */
	const stitchedFrom = new Map<string, string>();
	for (const reel of plan.reels) {
		log(`Stitching ${reel.assetIds.length} clips (lossless stream copy)…`);
		const res = await fetch('/api/stitch', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ assetIds: reel.assetIds, filename: reel.filename })
		});
		if (res.ok) {
			const stitched = (await res.json()) as StitchResponse;
			log(`Uploaded ${stitched.filename} (${Math.round(stitched.durationMs / 1000)}s)`);
			for (const id of reel.assetIds) stitchedFrom.set(id, stitched.id);
			await stack([stitched.id, ...reel.stackWith], log);
		} else {
			log(`Stitch failed (${res.status}): ${await res.text()} — falling back to a plain stack`);
			if (reel.stackWith.length >= 2) await stack(reel.stackWith, log);
		}
	}

	for (const album of plan.albums) {
		const reels = album.assetIds.flatMap((id) => stitchedFrom.get(id) ?? []);
		const ids = [...new Set([...album.assetIds, ...reels])];
		try {
			if (album.albumId) {
				await addAssetsToAlbum({ id: album.albumId, bulkIdsDto: { ids } });
			} else {
				await createAlbum({ createAlbumDto: { albumName: album.name, assetIds: ids } });
			}
			log(`Album "${album.name}" — ${ids.length} asset${ids.length === 1 ? '' : 's'}`);
		} catch (e) {
			log(`Could not update album "${album.name}": ${message(e)}`);
		}
	}

	for (const { place, assetIds } of plan.locations) {
		try {
			await updateAssets({
				assetBulkUpdateDto: { ids: assetIds, latitude: place.latitude, longitude: place.longitude }
			});
			log(`Location "${place.label}" — ${assetIds.length} asset${assetIds.length === 1 ? '' : 's'}`);
		} catch (e) {
			log(`Could not set location "${place.label}": ${message(e)}`);
		}
	}

	// Last, so a failed commit never marks assets as reviewed prematurely.
	if (plan.reviewedIds.length > 0) {
		const [tag] = await upsertTags({ tagUpsertDto: { tags: [settings.reviewedTagName] } });
		await bulkTagAssets({ tagBulkAssetsDto: { assetIds: plan.reviewedIds, tagIds: [tag.id] } });
		log(`Marked ${plan.reviewedIds.length} assets #${settings.reviewedTagName} — future sessions skip them`);
	}
}

async function stack(assetIds: string[], log: (line: string) => void): Promise<void> {
	try {
		await createStack({ stackCreateDto: { assetIds } });
		log(`Stack written — ${assetIds.length} assets`);
	} catch (e) {
		log(`Could not stack: ${message(e)}`);
	}
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));
