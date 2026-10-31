// bot.js — the Bundler. Cream bot, cyan visor, red antenna.
// Moves on the tile grid (BFS), executes jobs once standing on the job tile.

import * as THREE from '../vendor/three.module.min.js';
import { FM } from './textures.js';

const SPEED = 3.4;

function build() {
  const g = new THREE.Group();
  const add = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  add(.18, .3, .18, FM.botDark, -.12, .15, 0);   // legs
  add(.18, .3, .18, FM.botDark, .12, .15, 0);
  add(.5, .45, .34, FM.botBody, 0, .55, 0);      // torso
  const armL = add(.12, .4, .12, FM.botBody, -.32, .6, .1);
  const armR = add(.12, .4, .12, FM.botBody, .32, .6, .1);
  const head = new THREE.Mesh(new THREE.BoxGeometry(.46, .46, .46),
    [FM.botBody, FM.botBody, FM.botBody, FM.botBody, FM.botFace, FM.botBody]);
  head.position.set(0, 1.05, 0);
  head.castShadow = true;
  g.add(head);
  add(.05, .22, .05, FM.botDark, 0, 1.38, 0);    // antenna
  const tip = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1), FM.ledRed);
  tip.position.set(0, 1.55, 0);
  g.add(tip);
  return { g, tip, armL, armR };
}

export function makeBot(scene, world) {
  const { g, tip, armL, armR } = build();
  scene.add(g);

  const bot = {
    g, tip,
    x: 0, z: 0,
    path: [],          // [{x,z}] tile-centre waypoints
    job: null,         // {tile, channel, onArrive, onDone}
    hearts: 3,
    invuln: 0,
    channel: 0,
    heading: Math.PI,
    moving: false,
    dead: false,
    falling: 0,
    safe: null,
  };
  g.position.set(0, world.TOP_Y + .5, 0);

  // BFS over passable tiles; returns waypoint list ending at `to`.
  // If `to` is unreachable, returns a partial path to the closest
  // reachable tile — walking anywhere beats standing still.
  function findPath(to) {
    const sx = Math.round(bot.x), sz = Math.round(bot.z);
    if (sx === to.gx && sz === to.gz) return [];
    const q = [[sx, sz]];
    const prev = new Map([[sx + ',' + sz, null]]);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let found = null;
    let bestK = null, bestD = 1e9;
    for (let qi = 0; qi < q.length && qi < 3000; qi++) {
      const [cx, cz] = q[qi];
      const dd = Math.hypot(cx - to.gx, cz - to.gz);
      if (dd < bestD) { bestD = dd; bestK = cx + ',' + cz; }
      if (cx === to.gx && cz === to.gz) { found = cx + ',' + cz; break; }
      for (const [dx, dz] of dirs) {
        const nx = cx + dx, nz = cz + dz, k = nx + ',' + nz;
        if (prev.has(k)) continue;
        const t = world.tileAt(nx, nz);
        if (!t) continue;
        if (!world.passable(t) && !(nx === to.gx && nz === to.gz)) continue;
        prev.set(k, [cx, cz]);
        q.push([nx, nz]);
      }
    }
    const end = found || bestK;
    if (!end) return null;
    const path = [];
    let cur = end;
    while (cur) {
      const [px, pz] = cur.split(',').map(Number);
      path.unshift({ x: px, z: pz });
      const p = prev.get(cur);
      cur = p ? p.join(',') : null;
    }
    path.shift(); // drop current tile
    return path;
  }

  function setJob(job) {
    // job.tile = tile to stand on. path may be null (unreachable).
    const path = findPath(job.tile);
    if (path === null) { job.onFail?.(); return false; }
    bot.job = job;
    bot.job.channelLeft = undefined;
    bot.path = path;
    return true;
  }

  function hurt() {
    if (bot.invuln > 0 || bot.dead) return bot.hearts;
    bot.hearts--;
    bot.invuln = 1.6;
    bot.job = null;
    bot.path = [];
    return bot.hearts;
  }

  // one-tile keyboard step — no pathing, just an adjacent waypoint
  function nudge(t) {
    bot.job = null;
    bot.path = [{ x: t.x, z: t.z }];
  }

  // crater opened underfoot — sink into the hole, scramble back out
  function fall(safeTile) {
    if (bot.falling > 0 || bot.dead) return bot.hearts;
    bot.hearts--;
    bot.falling = .9;
    bot.safe = safeTile;
    bot.invuln = 1.8;
    bot.job = null;
    bot.path = [];
    return bot.hearts;
  }

  function reset() {
    bot.hearts = 3; bot.invuln = 0; bot.dead = false;
    bot.job = null; bot.path = []; bot.falling = 0;
    bot.x = 0; bot.z = 0;
  }

  function update(dt, t) {
    if (bot.dead) return;
    // falling into a crater — sink, spin, pop out on the safe tile
    if (bot.falling > 0) {
      bot.falling -= dt;
      const k = 1 - Math.max(0, bot.falling) / .9;
      g.position.set(bot.x, world.TOP_Y + .5 - k * 2.6, bot.z);
      g.rotation.y += dt * 14;
      if (bot.falling <= 0 && bot.safe) {
        bot.x = bot.safe.x; bot.z = bot.safe.z;
        g.rotation.y = bot.heading;
      }
      return;
    }
    if (bot.invuln > 0) {
      bot.invuln -= dt;
      g.visible = Math.sin(t * 30) > -.3;   // hurt flicker
    } else g.visible = true;
    tip.visible = Math.sin(t * 3) > -.4;

    bot.moving = false;
    if (bot.path.length) {
      const wp = bot.path[0];
      const dx = wp.x - bot.x, dz = wp.z - bot.z;
      const d = Math.hypot(dx, dz);
      const step = SPEED * dt;
      if (d <= step) {
        bot.x = wp.x; bot.z = wp.z;
        bot.path.shift();
      } else {
        bot.x += dx / d * step;
        bot.z += dz / d * step;
      }
      bot.moving = true;
      const want = Math.atan2(dx, dz);
      let diff = want - bot.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      bot.heading += diff * Math.min(1, dt * 10);
      g.rotation.y = bot.heading;
    }

    if (!bot.path.length && bot.job) {
      const j = bot.job;
      if (j.channelLeft === undefined) { j.channelLeft = j.channel || 0; j.onArrive?.(); }
      if (j.channelLeft > 0) {
        j.channelLeft -= dt;
        // typing frantically — arms pump alternately while channeling
        armL.rotation.x = -1.15 + Math.max(0, Math.sin(t * 24)) * .55;
        armR.rotation.x = -1.15 + Math.max(0, Math.sin(t * 24 + Math.PI)) * .55;
        g.rotation.y = bot.heading;
      } else {
        bot.job = null;
        j.onDone?.();
      }
    }
    // relax arms back down when not channeling
    if (!(bot.job && bot.job.channelLeft > 0)) {
      armL.rotation.x *= Math.max(0, 1 - dt * 8);
      armR.rotation.x *= Math.max(0, 1 - dt * 8);
    }

    const hop = bot.moving ? Math.abs(Math.sin(t * 10)) * .16 : Math.abs(Math.sin(t * 3)) * .04;
    g.position.set(bot.x, world.TOP_Y + .5 + hop, bot.z);
  }

  return Object.assign(bot, { findPath, setJob, nudge, hurt, fall, reset, update });
}
