# focull

**focus + cull** — a culling app for [Immich](https://immich.app): keyboard-driven on desktop, swipe-driven on your phone. People take too many photos; focull makes getting down to the good ones fast, and does it without ever deleting anything by default.

## How it works

focull groups your library into scenes (photos taken within a few minutes of each other) and walks each scene as a stream of duels: the current best photo — the *champion* — faces each next shot — the *challenger* — and one keystroke (or swipe) decides every duel. Keep a decent shot and a better one turns up two frames later? It just takes the crown — no hunting back to delete the first.

Open the app and you land straight in a **random trip**, around a random photo you've never judged. If you were away from home, it's the whole trip — from your first photo away to the last one before you're back (up to 30 days; the cities show as it loads). If you were home, it's that scene and the few days after it. No picking, just culling — and a trip down memory lane.

Nothing touches your library until you review and **commit**, at which point focull writes the results back to Immich:

- Culled assets are **tagged `focull/culled`** (default; archive or trash are opt-in settings) and **stacked behind the keeper they lost to**, so your timeline instantly shows only keepers while every original survives. A group can also end with no survivors — culled shots are then tagged but left unstacked.
- Everything a committed session touched — winners included — is **tagged `focull/reviewed`**, so future sessions skip photos you've already judged. Untag an asset in Immich to send it back into the pool.
- The winner becomes the Immich **stack primary**.
- For video clusters you can mark clips for a **reel**: focull losslessly concatenates them with ffmpeg (stream copy — no re-encode, no quality loss), uploads the stitched video to Immich, and stacks the source clips beneath it. Mixed-format clips are refused rather than silently transcoded.

## Keyboard

These are the defaults, and every one can be changed. **Shift-click any key you see on screen** (or click it in the `?` cheatsheet), then press the new key. Any action can have a second key too (the arrows come with vim twins `h` `j` `k` `l`); add or remove them in the cheatsheet. If a key is already taken, the two actions swap. Esc and `?` are fixed. Custom keys are saved on the device, and the cheatsheet can reset them.

| Key | Action |
|---|---|
| `←` / `h` (or click champion) | Champion stays — challenger is culled |
| `→` / `l` (or click challenger) | Challenger wins — takes the crown, old champion is culled |
| `B` | Keep both — the challenger becomes the one to beat for the shots that follow |
| `N` | Keep neither — both are culled, and the next challenger becomes the one to beat |
| `S` | Add clip to the stitch reel (video groups) |
| `A` | Album for this group **and the ones after it**: every keeper goes in at commit, until you pick another (or "no album"). Existing albums or new ones created on the spot |
| `Shift+A` | Just the champion: add it to an album, or take it out of the group's (`Tab` switches inside the palette) |
| `P` | Location for this group's photos that have none: search a place (Immich's own place search) or take one from photos taken nearby. Set at commit |
| `Shift+P` | Location for just the champion, even if it has one |
| `G` | Skip this group — it stays unreviewed for a later session |
| `M` | Mute / unmute videos |
| `U` | Undo last decision |
| hold `↑` / `↓` (or `k` / `j`) | Full screen — hold the challenger (`↑`/`k`) or champion (`↓`/`j`) up to your face; while held, `←`/`→` flip between the two, `Space` picks the one shown as the winner, `X` culls it and `B` keeps both; release to go back |
| `Z` | Full-resolution zoom on both panes with synced panning (sharpness duel) |
| `Space` / `X` | Keep / cull (single-asset groups) |
| `Enter` | Advance (next group, review, commit; another trip when done) |
| `C` | Review & commit the groups you've finished **now**. The rest wait: Esc in review goes back to culling, and after committing you can keep culling the same trip (committed groups are never sent twice) |
| `F` | In the picker: cycle photos only → videos only → both, for every session (trips included) |
| `?` | Keyboard cheatsheet |
| `Esc` | Back to the session picker |

The current album shows in the top bar (click it to change), on each group's summary, and on the review screen, where ◇ on a keeper takes it out of its album. Culled photos never go in, and a stitched reel joins its clips' album. Each photo's footer shows where and when it was taken; a location you've set shows in amber (⌖) until commit, when Immich gets the coordinates and names the place itself. Locations are city-level, and filling a group never touches photos that already have GPS.

Click any undecided thumbnail in the carousel to make it the next challenger, and hold `Shift` while hovering a photo pane for a magnifier loupe. On the review screen, click any judged thumbnail to change its fate before committing.

## Phone (swipe deck)

On touch screens and narrow windows the battle becomes a card deck: the challenger fills the screen and the one to beat sits in an inset.

| Gesture | Action |
|---|---|
| Swipe `←` | Cull the challenger |
| Swipe `→` | Keep it — it becomes the one to beat (nothing is culled) |
| Swipe `↑` | Crown it — the old one to beat is culled |
| Swipe `↓` | Keep neither — both culled (in video groups: add to the reel; neither is in the `⋯` menu) |
| Hold | See the one to beat in the card's place — a blink comparison (tap the inset to pin it) |
| Double-tap | Full-resolution zoom; drag pans, holding still compares at the same zoom |

Every swipe also has a button, plus undo; the `⋯` menu has albums, zoom, skip and the way back to sessions. Add focull to your home screen for a full-screen app.

## Running it

### Docker (recommended)

```yaml
services:
  focull:
    image: focull # build from this repo: docker build -t focull .
    ports:
      - '3000:3000'
    environment:
      IMMICH_URL: http://immich-server:2283
      # IMMICH_API_KEY: xxxx   # optional — skips the login screen
```

Open `http://localhost:3000`, paste an Immich API key (Immich → Account Settings → API Keys), and start culling. The key is validated against Immich and stored in an httpOnly cookie; all Immich traffic flows through focull's same-origin proxy, so no CORS configuration is needed.

### Development

```sh
npm install
IMMICH_URL=http://your-immich:2283 npm run dev
```

`ffmpeg`/`ffprobe` on the PATH enable video stitching (`FFMPEG_PATH`/`FFPROBE_PATH` to override); without them, focull hides the reel feature and everything else works.

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `IMMICH_URL` | yes | Base URL of your Immich server |
| `IMMICH_API_KEY` | no | Zero-login mode for single-user setups |
| `FFMPEG_PATH` / `FFPROBE_PATH` | no | Override ffmpeg binaries |

## Sessions

The app opens on a **random trip** (`T` in the picker for another). Or start from **unreviewed** (everything you've never judged — the reviewed tag is the source of truth, so this works across browsers and devices), **new since your last cull** (a faster date-based path), an **album**, a **date range**, or **duplicates** (Immich's visual duplicate groups, with the suggested keeper opening as champion). Photos chain into a scene while consecutive shots are within 5 minutes of each other; scenes longer than 40 photos split at their widest gaps. Videos cluster separately (10-minute gap between clips), so a clip never breaks up a run of photos. Both gaps are configurable in settings (`,`). `F` in the picker narrows any session to photos only or videos only; it sticks on the device, so trips follow it too. The grouping is generous on purpose: an unrelated photo in a scene costs one `B`, while a missed pairing costs the comparison. Progress is saved on the device as you go; reopening the app picks up where you left off, with a notice saying what it resumed (and a way to start a fresh trip instead).

## Safety model

focull is deliberately chicken-hearted with your memories:

- Default reject action is a **tag** — fully reversible, nothing leaves your library.
- **Archive** and **trash** are available in settings; trash still goes through Immich's trash with its retention window.
- Every change is staged locally and applied only at commit, after a review screen that spells out exactly what will happen.
- Stitching is lossless stream copy only; source clips are stacked, never removed.

## Updates

focull is versioned with semver; tagged releases publish multi-arch images to GHCR via CI. The app quietly checks GitHub releases (cached 6h) and shows a dismissible banner when a newer version exists — disable with `FOCULL_DISABLE_UPDATE_CHECK=1`. Watchtower/Renovate-style auto-updaters work as usual against the image tags. focull warns (without blocking) when your Immich server's major version differs from the one it was built against.

## Roadmap

- Visual similarity to pick the most relevant earlier keeper as the one to beat (a scene that returns to an earlier subject)
- Shuttle and frame stepping for video duels
- Rating (`1–5`) passthrough to Immich's rating field
- Commit receipts with one-click undo of a whole commit

## License

TBD before publishing. Note that focull depends on `@immich/sdk`, which is AGPL-3.0 — an AGPL-3.0 license for this project is the path of least resistance.
