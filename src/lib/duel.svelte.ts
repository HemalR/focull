import { AssetTypeEnum } from '@immich/sdk';
import { localDate, plural } from './format';
import { onKey } from './keymap.svelte';
import { previewUrl } from './immich';
import { prefetchImage } from './prefetch';
import { session } from './session.svelte';
import type { PaletteScope } from './types';

/** Props shared by both battle UIs: the side-by-side panes (Battle) and the touch deck (Swipe). */
export interface DuelProps {
	/** false while the group-done overlay or cheatsheet is up, so battle input goes quiet. */
	active: boolean;
	stitchAvailable: boolean;
	notify: (msg: string, err?: boolean) => void;
	onGroupDone: () => void;
	onSingleDone: () => void;
	/** Group skipped — advance past it. */
	onSkipped: () => void;
	onHelp: () => void;
	/** Back to the session picker (Esc on keyboards; the deck has a menu entry). */
	onExit: () => void;
	/** Review & commit the finished groups now (C), leaving the rest for later. */
	onReview: () => void;
	/** An overlay (album palette, menu) opened/closed — the page gates its Escape handler on this. */
	onOverlay: (open: boolean) => void;
}

/**
 * What happens to the challenger: culled (defend), crowned with the old champion culled
 * (dethrone), kept with the crown passing to it (keepBoth), culled along with the champion
 * (neither), or added to the reel.
 */
export type DuelAction = 'defend' | 'dethrone' | 'keepBoth' | 'neither' | 'reel';

type Palette = 'album' | 'location';
export type Overlay = Palette | `${Palette}Photo` | 'menu';

/** Which scope the open `palette` is in, or null when it isn't the one open. */
const scopeOf = (overlay: Overlay | null, palette: Palette): PaletteScope | null =>
	overlay === palette ? 'group' : overlay === `${palette}Photo` ? 'photo' : null;

/**
 * Battle logic both UIs share: who's up, the decisions (with their toasts), view state
 * (zoom, pan, sound, overlays), the keys that don't depend on layout, and keeping the next
 * previews warm. Each UI binds the decision keys itself (Battle decides at once, the deck
 * flings the card first). Construct during component init with a getter for its props.
 */
export class Duel {
	readonly #props: () => DuelProps;
	/** Recently decided indices — kept warm as undo fodder. */
	#recent: number[] = [];

	group = $derived(session.group);
	state = $derived(session.current);
	isSingle = $derived(this.group?.assets.length === 1);
	champion = $derived(this.group && this.state ? this.group.assets[this.state.championIdx] : undefined);
	challengerIdx = $derived(this.state?.queue[0]);
	challenger = $derived(
		this.group && this.challengerIdx !== undefined ? this.group.assets[this.challengerIdx] : undefined
	);
	/** "Jul 14, 2018 · 27 photos" */
	label = $derived(
		this.group
			? `${localDate(this.group.assets[0].localDateTime)} · ${plural(this.group.assets.length, this.group.kind)}`
			: ''
	);

	zoomed = $state(false);
	/** Shared zoom focus (0..1 of the frame) — every pane follows it, so comparisons line up. */
	pan = $state({ x: 0.5, y: 0.5 });
	/** One sound state for every pane; default muted, sticky for the session. */
	muted = $state(true);
	overlay = $state<Overlay | null>(null);
	/** The open album palette's scope: the group's (A) or one photo's (Shift+A). Same for locations (L). */
	albumScope = $derived(scopeOf(this.overlay, 'album'));
	locationScope = $derived(scopeOf(this.overlay, 'location'));

	// Props-dependent state is assigned in the constructor, once props are in hand.
	canReel: boolean;
	/** Input should reach the battle: page says so and no overlay is up. */
	keysActive: boolean;
	/** A duel is on: two assets face off and input is live. */
	dueling: boolean;

	constructor(props: () => DuelProps) {
		this.#props = props;
		this.canReel = $derived(this.group?.kind === 'video' && props().stitchAvailable);
		this.keysActive = $derived(props().active && this.overlay === null);
		this.dueling = $derived(this.keysActive && !this.isSingle && !!this.challenger);

		// New group: reset zoom and the recently-decided prefetch list.
		$effect(() => {
			void session.gi;
			this.zoomed = false;
			this.#recent = [];
		});

		// Keep the next 6 queued previews + the last 2 decided (undo fodder) warm.
		$effect(() => {
			const { group, state } = this;
			if (!group || !state) return;
			for (const idx of [...state.queue.slice(1, 7), ...this.#recent.slice(-2)]) {
				const a = group.assets[idx];
				if (a && a.type !== AssetTypeEnum.Video) prefetchImage(previewUrl(a.id));
			}
		});

		const when = (enabled: () => boolean) => () => ({ enabled: enabled() });
		onKey('undo', this.undo, when(() => this.keysActive));
		onKey('review', () => this.#props().onReview(), when(() => this.keysActive));
		onKey('zoom', this.toggleZoom, when(() => this.keysActive));
		onKey('skip', this.skip, when(() => this.keysActive));
		onKey('album', () => this.setOverlay('album'), when(() => this.keysActive && !!this.champion));
		onKey('albumPhoto', () => this.setOverlay('albumPhoto'), when(() => this.keysActive && !!this.champion));
		onKey('location', () => this.setOverlay('location'), when(() => this.keysActive && !!this.champion));
		onKey('locationPhoto', () => this.setOverlay('locationPhoto'), when(() => this.keysActive && !!this.champion));
		onKey('mute', this.toggleMute, when(() => this.keysActive && this.group?.kind === 'video'));
	}

	toggleZoom = (): void => {
		this.zoomed = !this.zoomed;
	};

	toggleMute = (): void => {
		this.muted = !this.muted;
	};

	decide = (action: DuelAction): void => {
		const { champion, challenger, challengerIdx, state } = this;
		if (!champion || !challenger || challengerIdx === undefined || !state) return;
		const name = challenger.originalFileName;
		const crowning = action === 'dethrone' || action === 'keepBoth';
		this.#recent.push(crowning ? state.championIdx : challengerIdx);
		session[action]();
		this.#props().notify(
			{
				defend: `${name} → cull pile`,
				dethrone: `${name} takes the crown`,
				keepBoth: `both kept — ${name} is the one to beat`,
				neither: `${champion.originalFileName} and ${name} → cull pile`,
				reel: `${name} → reel`
			}[action]
		);
		if (session.current?.queue.length === 0) this.#props().onGroupDone();
	};

	decideSingle = (keep: boolean): void => {
		const asset = this.champion;
		if (!asset) return;
		this.#props().notify(keep ? `${asset.originalFileName} kept` : `${asset.originalFileName} → cull pile`);
		session.decideSingle(keep);
		this.#props().onSingleDone();
	};

	undo = (): void => {
		this.#props().notify(session.undo() ? 'undone' : 'nothing to undo');
	};

	skip = (): void => {
		session.skipCurrent();
		this.#props().notify('group skipped — stays unreviewed');
		this.#props().onSkipped();
	};

	setOverlay = (next: Overlay | null): void => {
		this.overlay = next;
		this.#props().onOverlay(next !== null);
	};
}
