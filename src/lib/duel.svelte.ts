import { AssetTypeEnum } from '@immich/sdk';
import { createHotkey } from '@tanstack/svelte-hotkeys';
import { localDate, plural } from './format';
import { previewUrl } from './immich';
import { prefetchImage } from './prefetch';
import { session } from './session.svelte';

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
	/** An overlay (album palette, menu) opened/closed — the page gates its Escape handler on this. */
	onOverlay: (open: boolean) => void;
}

/**
 * What happens to the challenger: culled (defend), crowned with the old champion culled
 * (dethrone), kept with the crown passing to it (keepBoth), or added to the reel.
 */
export type DuelAction = 'defend' | 'dethrone' | 'keepBoth' | 'reel';

export type Overlay = 'album' | 'menu';

/**
 * Battle logic both UIs share: who's up, the decisions (with their toasts), view state
 * (zoom, pan, sound, overlays), the keys that don't depend on layout, and keeping the next
 * previews warm. Construct during component init with a getter for the component's props.
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
		createHotkey('B', () => this.decide('keepBoth'), when(() => this.dueling));
		createHotkey('S', () => this.decide('reel'), when(() => this.dueling && this.canReel));
		createHotkey('Space', () => this.decideSingle(true), when(() => this.keysActive && this.isSingle));
		createHotkey('X', () => this.decideSingle(false), when(() => this.keysActive && this.isSingle));
		createHotkey('U', () => this.undo(), when(() => this.keysActive));
		createHotkey('Z', () => (this.zoomed = !this.zoomed), when(() => this.keysActive));
		createHotkey('G', () => this.skip(), when(() => this.keysActive));
		createHotkey('A', () => this.setOverlay('album'), when(() => this.keysActive && !!this.champion));
		createHotkey('M', () => (this.muted = !this.muted), when(() => this.keysActive && this.group?.kind === 'video'));
	}

	decide = (action: DuelAction): void => {
		const { challenger, challengerIdx, state } = this;
		if (!challenger || challengerIdx === undefined || !state) return;
		const name = challenger.originalFileName;
		const crowning = action === 'dethrone' || action === 'keepBoth';
		this.#recent.push(crowning ? state.championIdx : challengerIdx);
		session[action]();
		this.#props().notify(
			{
				defend: `${name} → cull pile`,
				dethrone: `${name} takes the crown`,
				keepBoth: `both kept — ${name} is the one to beat`,
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
