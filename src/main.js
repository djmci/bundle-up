// main.js — boot, viewport, camera, picking, wave scheduler, states.

import * as THREE from '../vendor/three.module.min.js';
import { FM } from './textures.js';
import { makeWorld, R_VIS, BOUND } from './world.js';
import { makeBot } from './bot.js';
import { makeDeps } from './deps.js';
import { makeMobs } from './mobs.js';
import { makeHud } from './hud.js';
import { makeFx } from './fx.js';
import { makeDrone } from './drone.js';

// ---------- viewport (fixed logical stage, css-scaled — xmas pattern) ----------
let SCENE_W = 1200, SCENE_H = 760;
const PX = 1.9;            // internal render pixel size — the crunch dial
const stageWrap = document.getElementById('stage-wrap');
const stageEl = document.getElementById('stage');
const headerEl = document.querySelector('header');
const footerEl = document.querySelector('footer');
const canvas = document.getElementById('c');
let dpr = 1;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;

const scene = new THREE.Scene();
{
  const g = document.createElement('canvas'); g.width = 2; g.height = 128;
  const c = g.getContext('2d');
  const gr = c.createLinearGradient(0, 128, 0, 0);
  gr.addColorStop(0, '#f0dcc0'); gr.addColorStop(.45, '#b8d8ec'); gr.addColorStop(1, '#7ab8dd');
  c.fillStyle = gr; c.fillRect(0, 0, 2, 128);
  const t = new THREE.CanvasTexture(g); t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
}
scene.fog = new THREE.Fog(0xd8e4ea, 32, 54);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 120);
const camDir = new THREE.Vector3(1, .82, 1).normalize();

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const availW = document.getElementById('app').clientWidth - 28;
  let s;
  if (availW < 720) {
    // portrait phones: narrower stage, scene grows to fill between chrome
    s = availW / 920;
    const chrome = headerEl.offsetHeight + footerEl.offsetHeight + 30;
    SCENE_W = 920;
    SCENE_H = Math.min(1600, Math.max(760, Math.round((window.innerHeight - chrome) / s / 40) * 40));
  } else {
    s = Math.min(1, availW / 1200);
    SCENE_W = 1200; SCENE_H = 760;
  }
  stageEl.style.width = `${SCENE_W}px`;
  stageEl.style.height = `${SCENE_H}px`;
  stageWrap.style.transform = `scale(${s})`;
  stageWrap.style.height = `${SCENE_H * s}px`;
  stageEl.style.setProperty('--uz', Math.min(2, 1 / s).toFixed(3));
  renderer.setSize(Math.round(SCENE_W / PX), Math.round(SCENE_H / PX), false);
  // ortho frustum: fixed world width, height follows aspect
  const viewW = availW < 720 ? 11 : 23;   // ~30% tighter on phones
  const aspect = SCENE_W / SCENE_H;
  const viewH = viewW / aspect;
  camera.left = -viewW / 2; camera.right = viewW / 2;
  camera.top = viewH / 2; camera.bottom = -viewH / 2;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------- lights + ambient scene ----------
scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x8a7a68, .8));
const sun = new THREE.DirectionalLight(0xfff0d8, 1.15);
sun.position.set(8, 14, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -13; sun.shadow.camera.right = 13;
sun.shadow.camera.top = 13; sun.shadow.camera.bottom = -13;
sun.shadow.camera.far = 50;
scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight(0x8fb8dd, .2);
rim.position.set(-8, 6, -10);
scene.add(rim);

// voxel clouds
const clouds = [];
let csd = 99; const crnd = () => (csd = (csd * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 5; i++) {
  const c = new THREE.Group();
  const n = 3 + (i % 3);
  for (let k = 0; k < n; k++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.6 + crnd() * 1.4, .5, 1 + crnd() * .8), FM.cloud);
    m.position.set(k * 1.3 - n * .6, crnd() * .3, crnd() * .8);
    c.add(m);
  }
  c.position.set(-16 + i * 8 + crnd() * 3, 7 + crnd() * 3, -8 + crnd() * 14);
  clouds.push(c); scene.add(c);
}
// rising data motes
const motes = [];
for (let i = 0; i < 14; i++) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(.08, .08, .08),
    new THREE.MeshBasicMaterial({ color: i % 3 ? 0x3cf0c8 : 0xff2a00, transparent: true }));
  m.position.set((crnd() - .5) * 14, .5 + crnd() * 6, (crnd() - .5) * 14);
  motes.push({ m, v: .3 + crnd() * .5, ph: crnd() * 6 });
  scene.add(m);
}

// ---------- game objects ----------
const hud = makeHud();
const fx = makeFx(scene);
const world = makeWorld(scene);
const bot = makeBot(scene, world);

let state = 'title';      // title | play | over
let score = 0, rubies = 0, release = 1, patches = 0, zaps = 0;
let hi = 0;
try { hi = +(localStorage.getItem('bundleup-hi') || 0); } catch (e) {}

function addScore(n) { score += n; hud.setScore(score); }

function hurtBot(reason) {
  const left = bot.hurt();
  hud.setHearts(left);
  hud.dmgFlash();
  fx.shake(.45);
  hud.commit(`revert: ${reason}`, 'warn');
  if (left <= 0) gameOver();
}

let progress = 0, fixTarget = 0;

const ev = {
  cve: () => deps.cveId(),
  commit: (m, cls) => hud.commit(m, cls),
  patched: d => { patches++; progress++; addScore(25); fx.burst(d.tile.x, 1.6, d.tile.z, 'teal', 14); fx.shake(.1); },
  zapped: z => { zaps++; progress++; addScore(15); fx.burst(z.x, 1.3, z.z, 'green', 12); fx.shake(.08); },
  infected: d => { fx.shake(.2); },
  exploded: (d, blast, primary) => {
    blast.forEach(t => {
      fx.burst(t.x, 1.1, t.z, 'amber', 6, 4);
      if (Math.random() < .5) fx.burst(t.x, 1.2, t.z, 'dark', 3, 2.5);
    });
    fx.burst(d.tile.x, 1.4, d.tile.z, 'beige', 10, 4);
    fx.shake(.65);
    hud.commit(`revert: ${d.name} detonated`, 'warn');
    // a detonation resolves the threat badly — counts toward clearing,
    // but the primary bomb costs a heart. chained pops don't re-charge.
    progress++;
    // zombies caught in the blast die — collateral patches
    for (const z of [...mobs.list])
      if (Math.hypot(z.x - d.tile.x, z.z - d.tile.z) < 2.0) mobs.zap(z);
    // bot standing in the blast falls into the crater
    const botTile = world.tileAt(Math.round(bot.x), Math.round(bot.z));
    const inBlast = blast.includes(botTile) ||
      Math.hypot(bot.x - d.tile.x, bot.z - d.tile.z) < 1.9;
    if (inBlast && !bot.dead && bot.invuln <= 0) {
      const safe = safeTileNear();
      if (safe) {
        const left = bot.fall(safe);
        hud.setHearts(left);
        hud.dmgFlash();
        hud.commit('revert: fell into the crater', 'warn');
        if (left <= 0) gameOver();
      } else hurtBot('caught in the blast');
    } else if (primary) {
      // you let it ship — −100 points even at a safe distance
      score = Math.max(0, score - 100);
      hud.setScore(score);
      hud.commit(`revert: let ${d.name} detonate — −100`, 'warn');
    }
  },
  collateral: d => hud.commit(`revert: ${d.name} lost in the blast`, 'warn'),
  bitten: z => {
    fx.burst(z.x, 1.2, z.z, 'green', 8);
    hurtBot(`bitten by ${z.cve}`);
  },
  fellOff: z => {
    progress++;   // off the deck = out of the picture
    fx.burst(z.x, .8, z.z, 'green', 6, 2);
    hud.commit(`revert: ${z.cve} fell off the deck`, 'dim');
  },
};

const deps = makeDeps(scene, world, hud, ev);
const mobs = makeMobs(scene, world, deps, ev);
const drone = makeDrone(scene, world, deps, bot, ev);

// dep boxes roll in on new tiles, capped at the release's server count
let depTarget = 6;
world.onTileSpawn = t => {
  if (t.kind === 'floor' && deps.list.length < depTarget &&
      Math.hypot(t.x - bot.x, t.z - bot.z) > 3 && Math.random() < .06)
    deps.spawn(t);
  drone.maybeSpawn(t);
};
world.onTileDespawn = t => {
  // an infected dep rotating out counts as resolved — otherwise a
  // despawned threat can make fixTarget unreachable and stall the level
  if (t.dep) { if (t.dep.state === 'infected') progress++; deps.remove(t.dep); }
  drone.onTileDespawn(t);
};

world.init(bot);
hud.setHearts(3); hud.setScore(0); hud.setRelease(1);

// nearest walkable non-crater tile — where the bot scrambles out to
function safeTileNear() {
  const bx = Math.round(bot.x), bz = Math.round(bot.z);
  for (let r = 1; r <= 4; r++)
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const t = world.tileAt(bx + dx, bz + dz);
      if (world.passable(t) && t.kind !== 'crater') return t;
    }
  return null;
}

// ---------- picking ----------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const v3p = new THREE.Vector3();

function standableNear(t) {
  // the tile itself if walkable, else nearest passable 4-neighbor
  let best = null, bd = 1e9;
  const opts = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dz] of opts) {
    const n = world.tileAt(t.gx + dx, t.gz + dz);
    if (!n || !world.passable(n)) continue;
    const d = Math.hypot(n.x - bot.x, n.z - bot.z);
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

function pick(e) {
  if (state !== 'play') return;
  const rect = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);

  const zh = ray.intersectObjects(mobs.hitboxes, false)[0];
  if (zh) return jobZombie(zh.object.userData.zombie);

  const dh = ray.intersectObjects(deps.list.map(d => d.mesh), false)[0];
  if (dh) return jobDep(dh.object.userData.dep);

  const th = ray.intersectObjects(world.group.children, true)[0];
  if (th) {
    const t = world.tileFromHit(th);
    if (t) return jobTile(t);
  }

  // tapped beyond the deck — walk toward it if anything's close
  const pt = new THREE.Vector3();
  if (ray.ray.intersectPlane(groundPlane, pt)) {
    let best = null, bd = 7;
    for (const t of world.tiles.values()) {
      if (!world.passable(t)) continue;
      const d = Math.hypot(t.x - pt.x, t.z - pt.z);
      if (d < bd) { bd = d; best = t; }
    }
    if (best) bot.setJob({ tile: best, channel: 0 });
  }
}
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(world.TOP_Y + .5));

function faceTo(x, z) { bot.heading = Math.atan2(x - bot.x, z - bot.z); }

function jobZombie(z) {
  const t = world.tileAt(Math.round(z.x), Math.round(z.z));
  const stand = t && standableNear(t);
  if (!stand) return;
  bot.setJob({
    tile: stand, channel: .55,
    onArrive() { faceTo(z.x, z.z); },
    onDone() {
      // zap the nearest zombie in reach, whatever it is now
      let best = null, bd = 1.5;
      for (const zz of mobs.list) {
        const d = Math.hypot(zz.x - bot.x, zz.z - bot.z);
        if (d < bd) { bd = d; best = zz; }
      }
      if (best) mobs.zap(best);
      else hud.commit('chore: patch — nothing there', 'dim');
    },
    onFail() {},
  });
}

function jobDep(d) {
  const stand = standableNear(d.tile);
  if (!stand) return;
  if (d.state === 'infected') {
    bot.setJob({
      tile: stand, channel: 1.0,
      onArrive() { faceTo(d.tile.x, d.tile.z); },
      onDone() {
        // partial paths can strand the job short of the target — only act adjacent
        if (d.state === 'infected' && Math.hypot(bot.x - d.tile.x, bot.z - d.tile.z) < 1.7)
          deps.patch(d);
      },
      onFail() {},
    });
  } else {
    bot.setJob({
      tile: stand, channel: 0,
      onArrive() { faceTo(d.tile.x, d.tile.z); deps.poke(d); },
    });
  }
}

function jobTile(t) {
  if (t.kind === 'core') {
    const stand = standableNear(t);
    if (!stand) return;
    bot.setJob({
      tile: stand, channel: 0,
      onArrive() {
        faceTo(t.x, t.z);
        const n = world.harvest(t);
        if (n > 0) {
          rubies += n; addScore(10 * n);
          fx.burst(t.x, 1.2, t.z, 'red', 4 + n * 3);
          hud.commit(`feat: harvest ruby ×${n}`);
          v3p.set(t.x, world.TOP_Y + 1.2, t.z).project(camera);
          hud.popPx((v3p.x * .5 + .5) * SCENE_W, (-v3p.y * .5 + .5) * SCENE_H, `+${10 * n}`);
        } else {
          hud.commit('chore: core still growing', 'dim');
        }
      },
    });
    return;
  }
  const stand = standableNear(t);
  if (!stand) return;
  bot.setJob({ tile: stand, channel: 0 });
}
canvas.addEventListener('pointerdown', pick);

// ---------- keyboard: arrows/WASD step in screen directions ----------
// screen-up on the dimetric camera is the (-1,-1) diagonal; if that tile
// is blocked, fall back to the orthogonals so every tile is reachable
const STEP = {
  arrowup: [[-1, -1], [-1, 0], [0, -1]],
  arrowdown: [[1, 1], [1, 0], [0, 1]],
  arrowleft: [[-1, 1], [-1, 0], [0, 1]],
  arrowright: [[1, -1], [1, 0], [0, -1]],
  w: [[-1, -1], [-1, 0], [0, -1]],
  s: [[1, 1], [1, 0], [0, 1]],
  a: [[-1, 1], [-1, 0], [0, 1]],
  d: [[1, -1], [1, 0], [0, -1]],
};
window.addEventListener('keydown', e => {
  if (state !== 'play' || bot.dead || bot.falling > 0) return;
  const dirs = STEP[e.key.toLowerCase()];
  if (!dirs) return;
  e.preventDefault();
  const bx = Math.round(bot.x), bz = Math.round(bot.z);
  for (const [dx, dz] of dirs) {
    const t = world.tileAt(bx + dx, bz + dz);
    if (world.passable(t)) { bot.nudge(t); return; }
  }
});

// ---------- release progression: clear the threats -> BUNDLE UP! ----------
let zombieBudget = 0;   // zombies still allowed to appear this release
let zombieCap = 0;      // alive-at-once cap
let speedMul = 1;       // zombie speed scale, grows per release
let spawnGapT = 10;     // trickle interval, shrinks per release
let trickleT = 10;

function spawnDepNear(minR = 2, maxR = 10, opts) {
  for (let i = 0; i < 24; i++) {
    const t = world.frontierTile(bot, minR, maxR);
    if (!t) return null;
    if (t.dep) continue;
    const d = deps.spawn(t, opts);
    if (d) return d;
  }
  return null;
}
function spawnZombieAt() {
  if (zombieBudget <= 0) return;
  // just off the visible edge — close enough to walk in, far enough to spawn unseen
  const t = world.frontierTile(bot, 13, 17);
  if (t && mobs.spawn(t, { speedMul })) zombieBudget--;
}

function startRelease(n) {
  release = n;
  progress = 0;
  hud.setRelease(n);
  zombieBudget = n === 1 ? 0 : n === 2 ? 2 : 2 + n;
  zombieCap = Math.min(1 + n, 7);
  speedMul = 1 + (n - 1) * .07;
  spawnGapT = Math.max(6, 14 - n);
  deps.fuseS = Math.max(11, 24 - (n - 1) * 1.5);
  depTarget = Math.min(4 + n * 2, 14);
  const infectedSeed = Math.ceil(depTarget * .4);
  fixTarget = infectedSeed + zombieBudget;
  // seed infected boxes + fill the rest with healthy ones — they grow
  // up out of the floor like the tiles do
  for (let i = 0; i < infectedSeed; i++) spawnDepNear(2, 10, { infected: true });
  while (deps.list.length < depTarget) { if (!spawnDepNear(2, 10)) break; }
  const immediate = n >= 3 ? 1 : zombieBudget;
  for (let i = 0; i < immediate; i++) spawnZombieAt();
  trickleT = spawnGapT;
}

function releaseTick(dt) {
  trickleT -= dt;
  if (trickleT <= 0) {
    trickleT = spawnGapT * (.7 + Math.random() * .6);
    if (zombieBudget > 0 && mobs.list.length < zombieCap) spawnZombieAt();
  }
  if (progress >= fixTarget && fixTarget > 0) bundleUp();
}

function bundleUp() {
  addScore(100);
  if (bot.hearts < 3) { bot.hearts++; hud.setHearts(bot.hearts); }
  hud.banner('★ BUNDLE UP! ★', 2.5, 'good');
  hud.commit(`chore: bundle update — release ${release + 1} deployed`);
  startRelease(release + 1);
}

// ---------- states ----------
function gameOver() {
  state = 'over';
  bot.dead = true;
  const isHi = score > hi;
  if (isHi) { hi = score; try { localStorage.setItem('bundleup-hi', score); } catch (e) {} }
  hud.showCard({
    title: 'SYSTEM<br>BREACHED',
    sub: `SCORE ${score}${isHi ? ' — NEW BEST' : ''} · RELEASE ${release}<br>` +
         `${rubies} rubies banked · ${patches} deps updated · ${zaps} CVEs patched`,
    btn: 'Patch Again',
    btn2: 'Share Score',
  });
  hud.onCardBtn(() => location.reload());
  hud.onCardBtn2(() => {
    const txt = `I scored ${score} on Bundle Up! (${rubies} rubies, ${zaps} CVEs patched, reached release ${release})`;
    navigator.clipboard?.writeText(txt).then(
      () => hud.toast('Score copied — paste it anywhere'),
      () => hud.toast(txt));
  });
}

// ---------- auto-collect: walk onto/beside a ripe core and it banks ----------
let collectT = 0;
function autoCollect(dt) {
  collectT -= dt;
  if (collectT > 0 || bot.dead || bot.falling > 0) return;
  collectT = .25;
  for (const t of world.tiles.values()) {
    if (t.kind !== 'core' || !t.crystals.length) continue;
    if (Math.hypot(t.x - bot.x, t.z - bot.z) > 1.6) continue;
    const n = world.harvest(t);
    rubies += n; addScore(10 * n);
    fx.burst(t.x, 1.2, t.z, 'red', 4 + n * 3);
    hud.commit(`feat: harvest ruby ×${n}`);
    v3p.set(t.x, world.TOP_Y + 1.2, t.z).project(camera);
    hud.popPx((v3p.x * .5 + .5) * SCENE_W, (-v3p.y * .5 + .5) * SCENE_H, `+${10 * n}`);
  }
}

// ---------- contextual hint ----------
let hintT = 0;
function updateHint(dt) {
  hintT -= dt;
  if (hintT > 0) return;
  hintT = .4;
  let msg = 'tap a tile to walk there';
  let latched = false, bd = 1e9, kind = '';
  for (const d of deps.list) {
    if (d.latch) latched = true;
    if (d.state !== 'infected') continue;
    const dist = Math.hypot(d.tile.x - bot.x, d.tile.z - bot.z);
    if (dist < bd) { bd = dist; kind = 'dep'; }
  }
  for (const z of mobs.list) {
    const dist = Math.hypot(z.x - bot.x, z.z - bot.z);
    if (dist < bd) { bd = dist; kind = 'zombie'; }
  }
  for (const t of world.tiles.values()) {
    if (t.kind !== 'core' || !t.crystals.length) continue;
    const dist = Math.hypot(t.x - bot.x, t.z - bot.z);
    if (dist < bd) { bd = dist; kind = 'core'; }
  }
  const remaining = fixTarget - progress;
  if (latched) msg = 'a zombie is infecting a box — tap it!';
  else if (kind === 'dep') msg = 'tap the flashing box to bundle update it';
  else if (kind === 'zombie') msg = 'tap the zombie to patch it';
  else if (remaining > 0) msg = `BUNDLE UP! — ${remaining} threat${remaining > 1 ? 's' : ''} left`;
  hud.el.hint.textContent = msg;
}

hud.onCardBtn(() => {
  hud.hideCard();
  state = 'play';
  startRelease(1);
  hud.commit('chore: bundle install — environment ready', 'dim');
  setTimeout(() => hud.commit('docs: tap anywhere — the bot walks there', 'dim'), 1200);
  setTimeout(() => hud.commit('docs: red tags need a bundle update', 'dim'), 3600);
  setTimeout(() => hud.commit('docs: zombies latch onto good boxes — zap them', 'dim'), 6000);
});
hud.showCard({
  title: 'BUNDLE<br>UP!',
  sub: 'Walk the deck. Bank rubies from the gem cores. ' +
       'Patch what the CVE zombies infect — before it blows. ' +
       'Leave the good boxes. They\'re fine.',
  btn: 'Start Patching',
});

// ---------- loop ----------
const follow = new THREE.Vector3(0, .5, 0);
const botV = new THREE.Vector3();
const camPos = new THREE.Vector3();
let last = 0, mmT = 0;

renderer.setAnimationLoop((ms) => {
  const t = ms / 1000;
  const dt = Math.min(.05, t - last || 0);
  last = t;

  if (state !== 'over') {
    bot.update(dt, t);
    botV.set(bot.x, .5, bot.z);
    world.ensure(bot);
    world.update(dt);
    if (state === 'play') autoCollect(dt);
    deps.update(dt, bot, t);
    if (state === 'play') {
      mobs.update(dt, bot, t);
      drone.update(dt, t);
      releaseTick(dt);
      updateHint(dt);
    }
  } else {
    deps.update(dt, bot, t);
  }
  world.blinkLeds(t);

  // ambient
  clouds.forEach(c => { c.position.x += .005; if (c.position.x > 20) c.position.x = -20; });
  motes.forEach(p => {
    p.m.position.y += p.v * .008;
    p.m.material.opacity = .35 + .4 * Math.sin(t * 2 + p.ph);
    if (p.m.position.y > 8) p.m.position.y = .5;
  });

  // camera: dimetric, follows the bot with a soft lead
  follow.lerp(botV, 1 - Math.pow(.002, dt));
  camPos.copy(camDir).multiplyScalar(30).add(follow);
  fx.applyShake(camPos);
  camera.position.copy(camPos);
  camera.lookAt(follow.x, follow.y + .4, follow.z);
  sun.position.set(follow.x + 8, 14, follow.z + 5);
  sun.target.position.copy(follow);
  // keep the light rig glued to the camera direction so shadows stay put

  fx.update(dt);
  mmT -= dt;
  if (mmT <= 0) { mmT = .15; hud.minimap(bot, mobs.list, deps.list, BOUND, drone.pos); }
  hud.placeTags(camera, SCENE_W, SCENE_H);
  renderer.render(scene, camera);
});

resize();
