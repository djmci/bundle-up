# Bundle Up! — plan & decisions

Living document. Update it as we build so a fresh session can resume.

## Concept

Endless-wave farming toy on a procedurally-streamed voxel data-centre deck.
Theme: Ruby/Rails dependency health. Score-attack, 3 hearts, no backend.

- **Player**: the "Bundler" — small cream bot w/ cyan visor, red antenna tip.
  Tap a tile → BFS path there. Actions are proximity-based (adjacent tile).
- **Gem cores**: pads grow chunky ruby crystals; walk onto or next to a
  ripe core and it auto-banks (+10 each, pop text). No tap needed.
- **Dependency boxes**: spawn on the deck. Look identical from afar; version
  tag reveals within ~4 tiles (DOM label, not in-world sprite). Good = teal
  tag, leave alone (tapping one is a no-op commit). Infected = red tag +
  amber fault LED + fuse → tap to channel `bundle update` (~1s) → becomes
  fresh rack. Fuse expires → explodes → crater tile (blocks bot ~15s).
- **CVE zombies**: spawn at frontier, hunt nearest *good* dep, latch ~1.5s
  to infect it, then move to the next. Zap when adjacent. Contact = −1 ♥.
  Zombie whose tile despawns falls off the deck and dies.
- **Release progression (replaces timed waves)**: each release has a
  fixTarget = infectedSeed + zombieBudget. Patches + zaps count progress;
  hitting the target → `★ BUNDLE UP! ★` banner, +1♥, +100 score, world
  re-seeds harder. R1: 6 deps/3 infected, no zombies. R2: 8 deps, 2
  zombies. R3+: trickle spawns, fuses shrink (24s→11s), zombies speed up.
- **Detonation counts progress** (threat resolved badly) but the primary
  bomb costs −1♥ unless you're caught in the blast (that's already the
  price). Chained pops don't re-charge. Replaced the earlier
  migrate-on-detonate rule.
- **Blast radius**: ragged ~3×3 crater; kills zombies (counts as patches);
  chain-detonates infected deps; destroys collateral good deps; strips
  racks/LEDs/crystals; bot caught in blast falls in (−1♥, scrambles out).
- **Commit feed**: every action → pseudo git commit toast (bottom-left).
- **Game over**: 0 hearts → card with score + releases, Farm Again + Share.

## Aesthetic

Retro pixel: 16×16 char-map textures, `NearestFilter`, BasicShadowMap,
renderer at ~1/1.9 internal res upscaled `image-rendering: pixelated`.
World text (version tags, commits) is DOM — always crisp.
Day sky (cream→blue), light concrete raised-floor tiles, dark hull,
red underglow, teal LEDs. Palette: --red #ff2a00, --teal #3cf0c8,
--cream #f4ecdd. Montserrat + Press Start 2P. ant-trail.svg page bg.

## Decisions log

- Three.js ortho voxel over 2D canvas (Minecraft-y depth, free raycasting).
- Vendored `three.module.min.js` + `three.core.min.js` — no build step,
  no CDN (xmas precedent; Render static deploy).
- Zombie infection mechanic: zombies turn good deps bad (user's design —
  "CVEs create the vulnerabilities"). Zombie latches to infect so there's
  a kill window.
- World is now BOUNDED (user decision after trying treadmill): fixed
  disc radius BOUND=22 centred on origin; spawns stream within R_VIS=24
  of bot but never outside the disc. Rim is reachable and visible —
  hull tapers thinner toward it; red underglow centred on origin.
- Camera follows bot (keeps bot on screen), slight look-ahead.
- Sound: deferred (user said "add later" — wired hooks only).
- Graphics quality knob: PX const + char-map size — easy to bump later.

## Build phases

- [x] Visual mock (`mock/`) — v1 farm → v2 data-centre → v3 light +
  hi-res textures + DOM tags + bot. Approved by user.
- [x] Scaffold: html/css/yaml, assets, vendor, README, PLAN
- [x] textures.js — pixel maps + materials
- [x] world.js — streaming chunks, merged quads, cores
- [x] bot.js — movement/pathing/jobs
- [x] deps.js — dep lifecycle + tags
- [x] mobs.js — zombies
- [x] hud.js + fx.js — feed/banner/tags, particles
- [x] main.js — wiring, release progression, states, resize, picking
- [~] Browser test + polish — playable on :8124. Feedback rounds done:
  vignette edge fade + rim blur; action hints in infected tags + pulsing
  rings; contextual hint chip + tutorial commits; darkened side/hull
  textures (was washed-out white); offscreen spawn radius (R_VIS=16,
  R_KEEP=20); spawn rise-caps REMOVED (user: janky white gaps — plain
  pop-in, masked by fog 32-54 + vignette); arrow keys/WASD; walk-anywhere
  taps + partial-path fallback; bigger blasts + chain detonation +
  falling in; release progression; harvest pop text + ripe crystal pulse.

## Open / later

- Audio: WebAudio blips (pop/zap/boom) + mute toggle.
- Spawn-in animation — tried rise-caps, user disliked the white gaps it
  exposed (holes in merged mesh during rise). Currently plain pop-in
  offscreen; if still visible, option: stagger spawns or fade-in material.
- Better graphics pass (user asked): 32px textures, PX bump, more light
  texture variants.
- Themed page-bg SVG (circuit-trail instead of ant-trail).
- Shareable world seed in URL hash (xmas trick).
- More mobs: fast CVE "worm", boss "log4shell".
- Touch joystick fallback if tap-move feels bad on phones.
- Difficulty tune: fuse length (FUSE_S=24), zombie speed (.75), wave gap.
