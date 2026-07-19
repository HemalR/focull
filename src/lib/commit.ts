import {
	AssetVisibility,
	bulkTagAssets,
	createStack,
	deleteAssets,
	updateAssets,
	upsertTags
} from '@immich/sdk';
import type { CullGroup, GroupState, Settings } from './types';
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
}

/** Pure translation of finished battle states into Immich writes; drives both the review screen and the commit. */
export function buildPlan(groups: CullGroup[], states: GroupState[], _settings: Settings): CommitPlan {
	const plan: CommitPlan = { rejectIds: [], stacks: [], reels: [] };

	groups.forEach((group, i) => {
		const state = states[i];
		if (state.queue.length > 0) return; // group not finished — leave it untouched

		const byFate = (fate: string) =>
			group.assets.filter((_, ai) => state.fates[ai] === fate).map((a) => a.id);
		const rejects = byFate('rejected');
		plan.rejectIds.push(...rejects);

		const winner = group.assets[state.championIdx].id;
		const reelSources =
			group.kind === 'video'
				? group.assets
						.filter((_, ai) => state.fates[ai] === 'reel' || ai === state.championIdx)
						.map((a) => a.id)
				: [];

		if (reelSources.length >= 2) {
			const start = new Date(Math.min(...group.assets.map(takenAt)));
			plan.reels.push({
				assetIds: reelSources,
				stackWith: [...reelSources, ...rejects],
				filename: `focull-${start.toISOString().slice(0, 19).replaceAll(':', '-')}.mp4`
			});
		} else if (rejects.length > 0) {
			plan.stacks.push([winner, ...rejects]);
		}
	});
	return plan;
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
			await stack([stitched.id, ...reel.stackWith], log);
		} else {
			log(`Stitch failed (${res.status}): ${await res.text()} — falling back to a plain stack`);
			if (reel.stackWith.length >= 2) await stack(reel.stackWith, log);
		}
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
