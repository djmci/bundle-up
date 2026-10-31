// mobs.js — CVE zombies. They shamble from the frontier toward healthy
// deps, latch on for ~1.5s to infect them, then hunt the next. If no good
// deps remain they drift toward the bot. Touching the bot costs a heart
// and pops the zombie.

import * as THREE from '../vendor/three.module.min.js';
import { FM } from './textures.js';

const SPEED = .75;
const LATCH_S = 1.5;
const REACH = 1.05;

function buildZombie() {
  const g = new THREE.Group();
  const add = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  add(.22, .42, .22, FM.pants, -.14, .21, 0);
  add(.22, .42, .22, FM.pants, .14, .21, 0);
  add(.56, .5, .3, FM.hoodie, 0, .67, 0);
  add(.15, .5, .15, FM.zombieSkin, -.22, .72, .34).rotation.x = Math.PI / 2;
  add(.15, .5, .15, FM.zombieSkin, .22, .72, .34).rotation.x = Math.PI / 2;
  const head = new THREE.Mesh(new THREE.BoxGeometry(.5, .5, .5),
    [FM.zombieSkin, FM.zombieSkin, FM.zombieSkin, FM.zombieSkin, FM.zombieFace, FM.zombieSkin]);
  head.position.set(0, 1.18, 0);
  head.castShadow = true;
  g.add(head);
  const w = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1), FM.ledRed);
  w.position.set(0, 1.5, 0);
  g.add(w);
  // invisible fat hitbox for fat fingers
  const hb = new THREE.Mesh(new THREE.CylinderGeometry(.62, .62, 1.7, 8), FM.ghost);
  hb.position.y = .85;
  g.add(hb);
  return { g, hb };
}

export function makeMobs(scene, world, deps, ev) {
  const list = [];
  const hitboxes = [];
  let sd = 555;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;

  function spawn(tile, { speedMul = 1 } = {}) {
    if (!tile) return null;
    const { g, hb } = buildZombie();
    const z = {
      g, hb,
      x: tile.x, z: tile.z,
      state: 'walk',
      target: null,       // dep object or 'bot'
      latchT: 0,
      ph: rnd() * 6,
      speed: SPEED * (0.85 + rnd() * .4) * speedMul,
      cve: ev.cve(),
      stuck: 0, wob: rnd() * 6,
    };
    hb.userData.zombie = z;
    g.position.set(z.x, world.TOP_Y + .5, z.z);
    scene.add(g);
    list.push(z);
    hitboxes.push(hb);
    return z;
  }

  function remove(z) {
    scene.remove(z.g);
    const i = list.indexOf(z); if (i >= 0) list.splice(i, 1);
    const j = hitboxes.indexOf(z.hb); if (j >= 0) hitboxes.splice(j, 1);
    if (z.target && z.target.latch === z) z.target.latch = null;
  }

  function zap(z) {
    if (z.state === 'dying') return;
    ev.commit(`fix(security): resolve ${z.cve}`);
    ev.zapped?.(z);
    remove(z);
  }

  function passableAt(x, z) {
    const t = world.tileAt(Math.round(x), Math.round(z));
    return t && t.kind !== 'crater' && !t.rack;
  }

  function retarget(z, bot) {
    z.target = deps.nearestGood(z.x, z.z) || 'bot';
  }

  function update(dt, bot, t) {
    for (let i = list.length - 1; i >= 0; i--) {
      const z = list[i];

      // the tile under it despawned — it slides off the deck and dies
      if (!world.tileAt(Math.round(z.x), Math.round(z.z))) {
        ev.fellOff?.(z);
        remove(z);
        continue;
      }

      // contact with the bot — bite and die
      const bd = Math.hypot(bot.x - z.x, bot.z - z.z);
      if (bd < .62 && bot.invuln <= 0 && !bot.dead) {
        ev.bitten?.(z);
        remove(z);
        continue;
      }

      if (z.state === 'latch') {
        const d = z.target;
        if (!d || d.state !== 'good') { z.state = 'walk'; retarget(z, bot); continue; }
        z.latchT -= dt;
        d.latch = z;
        if (z.latchT <= 0) {
          d.latch = null;
          deps.infect(d);
          ev.infected?.(d);
          z.state = 'walk';
          retarget(z, bot);
        }
        z.g.position.y = world.TOP_Y + .5 + Math.abs(Math.sin(t * 14)) * .1;
        continue;
      }

      // walk
      if (!z.target || (z.target !== 'bot' && (z.target.state !== 'good' || (z.target.latch && z.target.latch !== z)))) retarget(z, bot);
      const tp = z.target === 'bot'
        ? { x: bot.x, z: bot.z }
        : { x: z.target.tile.x, z: z.target.tile.z };
      const dx = tp.x - z.x, dz = tp.z - z.z;
      const dist = Math.hypot(dx, dz);

      // latch when close to the dep
      if (z.target !== 'bot' && dist < REACH && z.target.state === 'good' && !z.target.latch) {
        z.state = 'latch';
        z.latchT = LATCH_S;
        z.target.latch = z;
        continue;
      }
      if (dist > .01) {
        const step = z.speed * dt;
        const nx = z.x + dx / dist * step, nz = z.z + dz / dist * step;
        if (passableAt(nx, nz)) { z.x = nx; z.z = nz; z.stuck = 0; }
        else if (passableAt(nx, z.z)) { z.x = nx; z.stuck = 0; }
        else if (passableAt(z.x, nz)) { z.z = nz; z.stuck = 0; }
        else { z.stuck += dt; if (z.stuck > 1.5) { z.stuck = 0; retarget(z, bot); } }
        z.g.rotation.y = Math.atan2(dx, dz);
      }
      z.g.position.set(z.x, world.TOP_Y + .5 + Math.abs(Math.sin(t * 6 + z.ph)) * .12, z.z);
      z.g.rotation.z = Math.sin(t * 6 + z.ph) * .05;
    }
  }

  return { list, hitboxes, spawn, remove, zap, update };
}
