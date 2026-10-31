// world.js — the floating data-centre deck.
// Tiles live within R_VIS of the bot and despawn beyond R_KEEP (treadmill
// world). Geometry is merged quads grouped by material per chunk — few
// draw calls even with a few hundred tiles.

import * as THREE from '../vendor/three.module.min.js';
import { M, FM } from './textures.js';

export const CHUNK = 8;
export const R_VIS = 24;   // spawn radius — well beyond the visible region
export const R_KEEP = 28;  // despawn radius
export const BOUND = 22;   // the deck is a fixed disc — no walking past this
const TOP_Y = 0;           // top-block centre; walk surface = +0.5

const key = (gx, gz) => gx + ',' + gz;
const ckey = (cx, cz) => cx + ',' + cz;

// ---- quad builders (one BufferGeometry per material per chunk) ----
function builder() { return { pos: [], nrm: [], uv: [], idx: [], n: 0 }; }
function quad(b, v, nx, ny, nz) {
  const { pos, nrm, uv, idx } = b, i = b.n;
  for (let k = 0; k < 4; k++) {
    pos.push(v[k][0], v[k][1], v[k][2]);
    nrm.push(nx, ny, nz);
  }
  uv.push(0, 0, 0, 1, 1, 1, 1, 0);
  idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  b.n += 4;
}
const qTop = (b, x, y, z) => quad(b,
  [[x - .5, y + .5, z - .5], [x - .5, y + .5, z + .5], [x + .5, y + .5, z + .5], [x + .5, y + .5, z - .5]], 0, 1, 0);
const qBot = (b, x, y, z) => quad(b,
  [[x - .5, y - .5, z + .5], [x - .5, y - .5, z - .5], [x + .5, y - .5, z - .5], [x + .5, y - .5, z + .5]], 0, -1, 0);
const qPX = (b, x, y, z) => quad(b,
  [[x + .5, y - .5, z - .5], [x + .5, y + .5, z - .5], [x + .5, y + .5, z + .5], [x + .5, y - .5, z + .5]], 1, 0, 0);
const qNX = (b, x, y, z) => quad(b,
  [[x - .5, y - .5, z + .5], [x - .5, y + .5, z + .5], [x - .5, y + .5, z - .5], [x - .5, y - .5, z - .5]], -1, 0, 0);
const qPZ = (b, x, y, z) => quad(b,
  [[x + .5, y - .5, z + .5], [x + .5, y + .5, z + .5], [x - .5, y + .5, z + .5], [x - .5, y - .5, z + .5]], 0, 0, 1);
const qNZ = (b, x, y, z) => quad(b,
  [[x - .5, y - .5, z - .5], [x - .5, y + .5, z - .5], [x + .5, y + .5, z - .5], [x + .5, y - .5, z - .5]], 0, 0, -1);
const SIDES = [[1, 0, qPX], [-1, 0, qNX], [0, 1, qPZ], [0, -1, qNZ]];

const TOP_MAT = { floor: 'floorTop', core: 'coreTop', crater: 'craterTop' };
const SIDE_MAT = { floor: 'floorSide', core: 'coreSide', crater: 'craterSide' };

const crystalGeo = new THREE.BoxGeometry(.26, .5, .26);
const ledGeo = new THREE.BoxGeometry(.1, .1, .1);
const rackGeo = new THREE.BoxGeometry(.8, 1.4, .8);

export function makeWorld(scene) {
  const tiles = new Map();          // key -> tile
  const chunks = new Map();         // ckey -> {group, dirty}
  const group = new THREE.Group();  // chunk meshes (raycast targets)
  const props = new THREE.Group();  // racks, crystals, LEDs
  scene.add(group, props);

  let sd = 1234;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;

  let onTileSpawn = () => {}, onTileDespawn = () => {};
  const leds = [];
  const crystalAll = [];

  // soft red hover-glow under the bounded platform
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(BOUND + 1, BOUND - 3, .4, 28),
    new THREE.MeshBasicMaterial({ color: 0xff2a00, transparent: true, opacity: .14 }));
  glow.position.y = -2.6;
  scene.add(glow);

  function tileAt(gx, gz) { return tiles.get(key(gx, gz)); }

  function chunkFor(gx, gz) {
    const cx = Math.floor(gx / CHUNK), cz = Math.floor(gz / CHUNK);
    const c = ckey(cx, cz);
    let ch = chunks.get(c);
    if (!ch) {
      const g = new THREE.Group();
      group.add(g);
      ch = { cx, cz, group: g, dirty: false, tiles: new Set() };
      chunks.set(c, ch);
    }
    return ch;
  }
  function dirtyAround(gx, gz) {
    chunkFor(gx, gz).dirty = true;
    for (const [dx, dz] of SIDES) {
      const n = tileAt(gx + dx, gz + dz);
      if (n) chunkFor(n.gx, n.gz).dirty = true;
    }
  }

  function spawnTile(gx, gz, botPos) {
    const x = gx, z = gz;
    const r = Math.hypot(x - botPos.x, z - botPos.z);
    // deeper hull toward the platform centre, thin at the rim
    const rc = Math.hypot(x, z);
    const depth = 2 + (rc < BOUND * .5 ? 2 : rc < BOUND * .8 ? 1 : 0) + (rnd() < .4 ? 1 : 0);
    const t = { gx, gz, x, z, kind: 'floor', depth, dep: null, crystals: [], grow: 0, healT: 0, rack: null, led: null };
    if (r > 2.5) {
      const roll = rnd();
      if (roll < .055) { t.kind = 'core'; t.grow = 4 + rnd() * 6; }
      else if (roll < .10) {
        t.kind = 'rack';
        const m = new THREE.Mesh(rackGeo, M.fresh);
        m.position.set(x, TOP_Y + .5 + .7, z);
        m.castShadow = true;
        props.add(m);
        t.rack = m;
      } else if (roll < .20) {
        const led = new THREE.Mesh(ledGeo, rnd() < .7 ? FM.ledTeal : FM.ledRed);
        led.position.set(x + .42, TOP_Y + .5, z + .42);
        props.add(led);
        t.led = led;
        leds.push({ led, ph: rnd() * 6 });
      }
    }
    tiles.set(key(gx, gz), t);
    chunkFor(gx, gz).tiles.add(t);
    onTileSpawn(t);
    dirtyAround(gx, gz);
    return t;
  }

  function removeTile(t) {
    onTileDespawn(t);
    if (t.rack) { props.remove(t.rack); t.rack = null; }
    if (t.led) { props.remove(t.led); t.led = null; }
    t.crystals.forEach(c => dropCrystal(c));
    t.crystals.length = 0;
    tiles.delete(key(t.gx, t.gz));
    const ch = chunkFor(t.gx, t.gz);
    ch.tiles.delete(t);
    dirtyAround(t.gx, t.gz);
  }

  // ---- chunk rebuild ----
  const BUCKET_MAT = {
    floorTop: M.floorTop, floorSide: M.floorSide,
    coreTop: M.coreTop, coreSide: M.coreSide,
    craterTop: M.craterTop, craterSide: M.craterSide,
    hull: M.hull, hullDeep: M.hullDeep,
  };
  function rebuildChunk(ch) {
    while (ch.group.children.length) {
      const m = ch.group.children.pop();
      m.geometry.dispose();
      ch.group.remove(m);
    }
    const buckets = {};
    ch.tiles.forEach(t => {
      const nbr = SIDES.map(([dx, dz]) => tileAt(t.gx + dx, t.gz + dz));
      const edge = nbr.some(n => !n);
      // top face (+ pit walls skipped; craters sink slightly)
      const ty = t.kind === 'crater' ? TOP_Y - .25 : TOP_Y;
      const topB = buckets[TOP_MAT[t.kind]] || (buckets[TOP_MAT[t.kind]] = builder());
      qTop(topB, t.x, ty, t.z);
      // top-block side faces at the deck edge
      if (edge) {
        const sb = buckets[SIDE_MAT[t.kind]] || (buckets[SIDE_MAT[t.kind]] = builder());
        nbr.forEach((n, i) => { if (!n) SIDES[i][2](sb, t.x, ty, t.z); });
      }
      // hull column
      for (let y = -1; y >= -t.depth; y--) {
        const matKey = (y === -t.depth) ? 'hullDeep' : 'hull';
        nbr.forEach((n, i) => {
          if (!n || n.depth < -y) {
            const hb = buckets[matKey] || (buckets[matKey] = builder());
            SIDES[i][2](hb, t.x, y, t.z);
          }
        });
        if (y === -t.depth && (edge || nbr.some(n => n && n.depth < t.depth))) {
          const bb = buckets.hullDeep || (buckets.hullDeep = builder());
          qBot(bb, t.x, y, t.z);
        }
      }
    });
    for (const k in buckets) {
      const b = buckets[k];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setIndex(b.idx);
      const m = new THREE.Mesh(g, BUCKET_MAT[k]);
      m.receiveShadow = true;
      m.castShadow = k !== 'floorTop' && k !== 'coreTop';
      m.userData.chunkMesh = true;
      ch.group.add(m);
    }
  }

  function rebuildDirty() {
    chunks.forEach(ch => { if (ch.dirty) { rebuildChunk(ch); ch.dirty = false; } });
  }

  // ---- spawn / despawn around the bot ----
  let lastGx = 1e9, lastGz = 1e9;
  function ensure(botPos) {
    const bx = Math.round(botPos.x), bz = Math.round(botPos.z);
    if (bx === lastGx && bz === lastGz) return;
    lastGx = bx; lastGz = bz;
    for (let gx = bx - R_VIS; gx <= bx + R_VIS; gx++)
      for (let gz = bz - R_VIS; gz <= bz + R_VIS; gz++) {
        if (Math.hypot(gx - botPos.x, gz - botPos.z) > R_VIS) continue;
        if (Math.hypot(gx, gz) > BOUND) continue;   // fixed platform edge
        if (!tileAt(gx, gz)) spawnTile(gx, gz, botPos);
      }
    const dead = [];
    tiles.forEach(t => {
      if (Math.hypot(t.x - botPos.x, t.z - botPos.z) > R_KEEP) dead.push(t);
    });
    dead.forEach(removeTile);
    rebuildDirty();
  }
  // force full rebuild on first call
  function init(botPos) { lastGx = 1e9; ensure(botPos); }

  // ---- per-frame: growth, crater healing, LEDs ----
  function update(dt) {
    tiles.forEach(t => {
      if (t.kind === 'core' && t.crystals.length < 3) {
        t.grow -= dt;
        if (t.grow <= 0) {
          const c = new THREE.Mesh(crystalGeo, FM.ruby);
          c.position.set(t.x + (rnd() - .5) * .55, TOP_Y + .5 + .25, t.z + (rnd() - .5) * .55);
          c.rotation.y = rnd() * 3;
          c.castShadow = true;
          props.add(c);
          t.crystals.push(c);
          crystalAll.push(c);
          t.grow = 7 + rnd() * 8;
        }
      }
      if (t.kind === 'crater' && t.healT > 0) {
        t.healT -= dt;
        if (t.healT <= 0) { t.kind = 'floor'; t.blocked = false; dirtyAround(t.gx, t.gz); rebuildDirty(); }
      }
    });
  }
  function blinkLeds(t) {
    leds.forEach(l => { l.led.visible = Math.sin(t * 3 + l.ph) > -.4; });
    crystalAll.forEach((c, i) => {
      c.rotation.y += .01;
      c.scale.setScalar(1 + Math.sin(t * 4 + i) * .1);   // ripe pulse
    });
  }

  // ---- gameplay helpers ----
  function dropCrystal(c) {
    props.remove(c);
    const i = crystalAll.indexOf(c);
    if (i >= 0) crystalAll.splice(i, 1);
  }
  function setCrater(t) {
    if (t.kind === 'crater') return;
    t.kind = 'crater'; t.healT = 15; t.blocked = true;
    if (t.rack) { props.remove(t.rack); t.rack = null; }
    if (t.led) { props.remove(t.led); t.led = null; }
    t.crystals.forEach(c => dropCrystal(c));
    t.crystals.length = 0;
    dirtyAround(t.gx, t.gz); rebuildDirty();
  }
  function harvest(t) {
    const n = t.crystals.length;
    t.crystals.forEach(c => dropCrystal(c));
    t.crystals.length = 0;
    t.grow = 6 + rnd() * 6;
    return n;
  }
  function passable(t) { return t && !t.blocked && t.kind !== 'crater' && !t.dep && !t.rack; }
  function frontierTile(botPos, minR = R_VIS * .65, maxR = R_VIS * .95) {
    for (let i = 0; i < 30; i++) {
      const a = rnd() * Math.PI * 2, r = minR + rnd() * (maxR - minR);
      const t = tileAt(Math.round(botPos.x + Math.cos(a) * r), Math.round(botPos.z + Math.sin(a) * r));
      if (t && t.kind === 'floor' && !t.dep && !t.rack) return t;
    }
    return null;
  }
  function tileFromHit(hit) {
    // only top faces resolve to a tile
    if (Math.abs(hit.face.normal.y) < .5) return null;
    return tileAt(Math.floor(hit.point.x + .5), Math.floor(hit.point.z + .5));
  }

  return {
    tiles, group, tileAt, ensure, init, update, blinkLeds, rebuildDirty, dirtyAround,
    setCrater, harvest, passable, frontierTile, tileFromHit,
    TOP_Y,
    set onTileSpawn(f) { onTileSpawn = f; },
    set onTileDespawn(f) { onTileDespawn = f; },
  };
}
