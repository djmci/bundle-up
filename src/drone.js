// drone.js — the dependabot. Teal tokens spawn on the deck; walk over one
// and a little drone orbits you for ~30s (or 5 patches), flying out to
// auto-patch the nearest infected dep within reach.

import * as THREE from '../vendor/three.module.min.js';
import { FM } from './textures.js';

const TTL = 30, CHARGES = 5, REACH = 6, SCAN = 3.2;

const bodyGeo = new THREE.BoxGeometry(.28, .22, .28);
const tipGeo = new THREE.BoxGeometry(.08, .1, .08);
const antGeo = new THREE.BoxGeometry(.04, .14, .04);
const tokGeo = new THREE.BoxGeometry(.22, .22, .22);

export function makeDrone(scene, world, deps, bot, ev) {
  let sd = 4242;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const pickups = [];
  const d = {
    active: false, ttl: 0, charges: 0,
    mesh: null, phase: 'follow', target: null,
    x: 0, y: 0, z: 0, scanT: 0, ph: rnd() * 6,
  };

  function build() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, FM.botBody); g.add(body);
    const tip = new THREE.Mesh(tipGeo, FM.ledTeal); tip.position.y = .18; g.add(tip);
    const ant = new THREE.Mesh(antGeo, FM.botDark); ant.position.y = .12; ant.position.x = .1; g.add(ant);
    body.castShadow = true;
    return g;
  }

  // ---- pickups ----
  function maybeSpawn(t) {
    if (t.kind !== 'floor' || t.rack || t.dep || pickups.length > 2 || rnd() > .015) return;
    const m = new THREE.Mesh(tokGeo, FM.ledTeal);
    m.position.set(t.x, world.TOP_Y + .75, t.z);
    scene.add(m);
    pickups.push({ t, m });
  }
  function onTileDespawn(t) {
    for (let i = pickups.length - 1; i >= 0; i--)
      if (pickups[i].t === t) { scene.remove(pickups[i].m); pickups.splice(i, 1); }
  }
  function collect() {
    if (!d.mesh) { d.mesh = build(); scene.add(d.mesh); }
    d.active = true;
    d.ttl = TTL; d.charges = CHARGES; d.phase = 'follow';
    d.x = bot.x; d.z = bot.z; d.y = world.TOP_Y + 2.1;
    ev.commit('chore: dependabot joined the repo');
  }
  function deactivate() {
    d.active = false; d.target = null; d.phase = 'follow';
    if (d.mesh) { scene.remove(d.mesh); d.mesh = null; }
  }

  function nearestInfected() {
    let best = null, bd = REACH;
    for (const dep of deps.list) {
      if (dep.state !== 'infected') continue;
      const dist = Math.hypot(dep.tile.x - bot.x, dep.tile.z - bot.z);
      if (dist < bd) { bd = dist; best = dep; }
    }
    return best;
  }

  function update(dt, t) {
    // tokens bob/spin; bot walks over to collect
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.m.rotation.y += dt * 2.5;
      p.m.position.y = world.TOP_Y + .75 + Math.sin(t * 3 + i) * .08;
      if (!bot.dead && Math.hypot(p.t.x - bot.x, p.t.z - bot.z) < .65) {
        scene.remove(p.m); pickups.splice(i, 1); collect();
      }
    }
    if (!d.active) return;

    d.ttl -= dt;
    if (d.ttl <= 0 || d.charges <= 0) { deactivate(); return; }

    const ox = bot.x + Math.cos(t * 2 + d.ph) * .9;
    const oz = bot.z + Math.sin(t * 2 + d.ph) * .9;
    const oy = world.TOP_Y + 2.0 + Math.sin(t * 4) * .12;

    if (d.phase === 'follow') {
      d.scanT -= dt;
      if (d.scanT <= 0) {
        d.scanT = SCAN;
        const dep = nearestInfected();
        if (dep) { d.target = dep; d.phase = 'out'; }
      }
      d.x += (ox - d.x) * Math.min(1, dt * 4);
      d.y += (oy - d.y) * Math.min(1, dt * 4);
      d.z += (oz - d.z) * Math.min(1, dt * 4);
    } else {
      const dep = d.target;
      if (!dep || dep.state !== 'infected') { d.phase = 'follow'; d.target = null; }
      else if (d.phase === 'out') {
        const tx = dep.tile.x, ty = world.TOP_Y + 1.8, tz = dep.tile.z;
        const dx = tx - d.x, dy = ty - d.y, dz = tz - d.z;
        const dist = Math.hypot(dx, dy, dz);
        const step = 7 * dt;
        if (dist < Math.max(.2, step)) {
          deps.patch(dep, 'dependabot');
          ev.dependabot?.(dep);
          d.charges--;
          d.phase = 'back';
        } else { d.x += dx / dist * step; d.y += dy / dist * step; d.z += dz / dist * step; }
      } else {
        d.x += (ox - d.x) * Math.min(1, dt * 4);
        d.y += (oy - d.y) * Math.min(1, dt * 4);
        d.z += (oz - d.z) * Math.min(1, dt * 4);
        if (Math.hypot(ox - d.x, oz - d.z) < .5) d.phase = 'follow';
      }
    }
    if (d.mesh) {
      d.mesh.position.set(d.x, d.y, d.z);
      d.mesh.rotation.y += dt * 3;
    }
  }

  return { maybeSpawn, onTileDespawn, update,
    get active() { return d.active; },
    get pos() { return d.active ? { x: d.x, z: d.z } : null; } };
}
