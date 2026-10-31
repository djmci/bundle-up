# Bundle Up!

A Red Ant web toy. You're a little bot tending a floating data-centre deck
that is, spiritually, your Gemfile. Rubies grow on gem-core pads — bank them.
CVE zombies shamble in and infect your dependency boxes — zap them, then
`bundle update` whatever they touched before the fuse runs out and it blows
a crater in the deck. Leave the good boxes alone. Every action posts a fake
git commit to the feed.

No backend. Three.js voxels, procedural everything, no build step.

## Running it

Plain HTML and ES modules — serve the directory statically:

```
python3 -m http.server 8000
```

Deploys to Render as a static site (see `render.yaml`).

## How to play

- **Tap a tile** — the bot walks there (world streams in ahead of you).
- **Gem cores** — crystals grow over time; stand next to one and tap to bank rubies.
- **Dependency boxes** — walk up to one and its version tag appears.
  Good versions (teal tag) — leave them. Infected boxes (red tag, amber
  fault light, fuse ticking) — tap to channel a `bundle update`.
- **CVE zombies** — green, hoodie, arms out. They hunt healthy boxes and
  latch on to infect them. Zap them before they land. Touching one costs a heart.
- **CVE waves** — periodic banner, then a burst of zombies + bad boxes
  spawn at the frontier. That's a `RELEASE`.
- 3 hearts. Score = rubies + updates + CVEs patched.

## Layout

- `src/main.js` — boot, state machine (title/play/over), loop, resize, picking
- `src/textures.js` — pixel-map → CanvasTexture (same char-map style as
  xmas `sprites.js`), all materials
- `src/world.js` — chunked streaming deck, tile states, cores/crystals,
  merged-quad geometry
- `src/bot.js` — the Bundler: movement, BFS pathing, job channel, hearts
- `src/deps.js` — dependency boxes: good/infected/fuse/explode, version tags
- `src/mobs.js` — CVE zombies: spawn, hunt, latch+infect, contact damage
- `src/hud.js` — chips, commit feed, CVE banner, DOM tags, cards
- `src/fx.js` — cube-debris particles, damage flash, screen shake
- `vendor/` — vendored three.js modules (no CDN, no build)
- `mock/` — the original visual spike, kept for reference

## Tuning knobs

- `PX` in `src/main.js` — internal render pixel size (crunch factor)
- `viewW` in `src/main.js` `resize()` — world units visible across the stage
- `R_VIS` / `R_KEEP` in `src/world.js` — stream radii (16/20 keeps spawns offscreen)
- `startRelease()` in `src/main.js` — per-release difficulty: infected seed
  share, zombie budget/cap, fuse length, zombie speed
- `SPEED`, `LATCH_S`, `REACH` in `src/mobs.js` — zombie behaviour

## Notes

- Rendering is intentionally low-res + `image-rendering: pixelated`;
  labels/HUD are DOM elements projected onto the scene so text stays crisp.
- Ported from the `../xmas` toy: fixed logical stage, CSS transform scaling,
  `--uz` counter-scale for in-scene UI, portrait layout that fills between
  header and footer.
