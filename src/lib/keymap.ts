/**
 * The single source of truth for the `?` cheatsheet. Keep in lockstep with the
 * createHotkey registrations in Battle/Picker/Review/+page — anything added there
 * gets a row here.
 */
export interface KeyEntry {
	keys: string;
	label: string;
}

export interface KeyGroup {
	title: string;
	entries: KeyEntry[];
}

export const KEYMAP: KeyGroup[] = [
	{
		title: 'battle',
		entries: [
			{ keys: '←', label: 'champion stays — challenger culled (or click champion)' },
			{ keys: '→', label: 'challenger wins — champion culled (or click challenger)' },
			{ keys: 'B', label: 'keep both — challenger becomes the one to beat' },
			{ keys: 'A', label: 'album palette — stage the champion, applied at commit' },
			{ keys: 'G', label: 'skip group — stays unreviewed' },
			{ keys: 'U', label: 'undo last decision' },
			{ keys: 'hold ↑ / ↓', label: 'full screen the challenger / champion · ←/→ flip sides while held' },
			{ keys: 'Z', label: 'full-res zoom · mouse pans both panes' },
			{ keys: 'shift + hover', label: '2× magnifier loupe under the cursor' },
			{ keys: 'click thumb', label: 'battle an undecided asset next' }
		]
	},
	{
		title: 'swipe deck (touch / narrow screens)',
		entries: [
			{ keys: '← swipe', label: 'cull the photo' },
			{ keys: '→ swipe', label: 'keep it — it becomes the one to beat' },
			{ keys: '↑ swipe', label: 'crown it — the old one to beat is culled' },
			{ keys: '↓ swipe', label: 'add to reel (video groups)' },
			{ keys: 'hold', label: 'see the one to beat in its place (tap the inset to pin)' },
			{ keys: 'double-tap', label: 'zoom · drag pans · hold still compares' }
		]
	},
	{
		title: 'singles',
		entries: [
			{ keys: 'space', label: 'keep' },
			{ keys: 'X', label: 'cull' }
		]
	},
	{
		title: 'video groups',
		entries: [
			{ keys: 'S', label: 'add challenger to reel (stitched on commit)' },
			{ keys: 'M', label: 'mute / unmute both panes' }
		]
	},
	{
		title: 'group summary',
		entries: [
			{ keys: 'X', label: 'cull the last one standing too — no survivors' },
			{ keys: 'U', label: 'undo (restores the crown, or the last duel)' },
			{ keys: '↵', label: 'next group / review' }
		]
	},
	{
		title: 'review',
		entries: [
			{ keys: 'click thumb', label: 'cycle fate — culled → kept (→ reel for video)' },
			{ keys: '↵', label: 'commit to Immich' }
		]
	},
	{
		title: 'global',
		entries: [
			{ keys: 'T', label: 'picker: random trip (also what the app opens on)' },
			{ keys: '1–5', label: 'picker: choose session source' },
			{ keys: ',', label: 'picker: settings' },
			{ keys: '↵', label: 'confirm / next group' },
			{ keys: 'esc', label: 'back to picker · close overlays' },
			{ keys: '?', label: 'this cheatsheet' },
			{ keys: '↵ / R', label: 'done screen: another trip / pick a session' }
		]
	}
];
