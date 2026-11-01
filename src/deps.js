// deps.js — dependency boxes. Healthy deps are dark racks with teal LEDs;
// a zombie latch or an unlucky spawn makes them "infected": beige legacy
// tower, amber fault light, red tag, ticking fuse. Patch them in time or
// they crater the tile.

import * as THREE from '../vendor/three.module.min.js';
import { M, FM } from './textures.js';

const GEMS = [
  ['rails', '8.1.0', '3.2.22'], ['puma', '7.0.3', '4.3.12'],
  ['nokogiri', '1.18.9', '1.10.10'], ['devise', '4.9.4', '4.7.1'],
  ['sidekiq', '8.0.4', '5.2.10'], ['rack', '3.2.0', '1.6.13'],
  ['pg', '1.5.9', '0.21.0'], ['redis', '5.4.0', '3.3.5'],
  ['faraday', '2.13.0', '0.17.4'], ['zeitwerk', '2.7.2', '2.4.2'],
  ['kamal', '2.5.3', '0.16.4'], ['solid_queue', '1.2.0', '0.3.1'],
  ['propshaft', '1.1.0', '0.7.0'], ['sprockets', '4.2.1', '3.7.2'],
  ['bundler', '2.6.9', '1.17.3'], ['json', '2.9.1', '1.8.6'],
  ['minitest', '5.25.4', '5.10.3'], ['turbo-rails', '2.0.13', '0.5.9'],
];
const CVE_YEARS = [2024, 2025, 2026];
const FUSE_S = 24;

const depGeo = new THREE.BoxGeometry(.7, 1.0, .7);
const sparkGeo = new THREE.BoxGeometry(.12, .12, .12);
const ringGeo = new THREE.CylinderGeometry(.62, .62, .04, 14);

export function cveId(rnd) {
  const y = CVE_YEARS[(rnd() * CVE_YEARS.length) | 0];
  return `CVE-${y}-${10000 + (rnd() * 89999 | 0)}`;
}

export function makeDeps(scene, world, hud, ev) {
  const list = [];
  let sd = 777;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const usedNames = new Map(); // name -> dep, keep deps distinct
  let fuseS = FUSE_S;          // shrinks as releases climb

  function tagText(d) {
    return d.state === 'infected'
      ? `${d.name} ${d.verBad} ⚠`
      : `${d.name} ${d.verGood}`;
  }

  function spawn(tile, { infected = false } = {}) {
    if (!tile || tile.dep || tile.rack || tile.kind !== 'floor') return null;
    const free = GEMS.filter(g => !usedNames.has(g[0]) || usedNames.get(g[0]).tile !== tile);
    if (!free.length) return null;
    const g = free[(rnd() * free.length) | 0];
    const d = {
      tile, name: g[0], verGood: g[1], verBad: g[2],
      cve: cveId(rnd),
      state: 'good', fuse: 0,
      latch: null, appear: .45,
    };
    const m = new THREE.Mesh(depGeo, M.fresh);
    m.position.set(tile.x, world.TOP_Y + 1.0, tile.z);
    m.castShadow = true;
    m.userData.dep = d;
    scene.add(m);
    d.mesh = m;
    const spark = new THREE.Mesh(sparkGeo, FM.ledAmber);
    spark.position.set(tile.x, world.TOP_Y + 1.62, tile.z);
    spark.visible = false;
    scene.add(spark);
    d.spark = spark;
    // pulsing "needs attention" ring — only shown while infected
    const ring = new THREE.Mesh(ringGeo, FM.ledRed);
    ring.position.set(tile.x, world.TOP_Y + .56, tile.z);
    ring.visible = false;
    scene.add(ring);
    d.ring = ring;
    d.tag = hud.tag(tile.x, world.TOP_Y + 2.1, tile.z);
    d.tag.el.classList.add('dep');
    tile.dep = d;
    usedNames.set(g[0], d);
    list.push(d);
    if (infected) infect(d, true);
    else { d.tag.el.textContent = tagText(d); }
    return d;
  }

  function infect(d, silent = false) {
    if (d.state === 'infected') return;
    d.state = 'infected';
    d.fuse = fuseS;
    d.mesh.material = M.legacy;
    d.tag.el.textContent = tagText(d);
    d.tag.el.classList.add('bad');
    if (!silent) ev.commit(`!! ${d.name} compromised by ${d.cve}`, 'warn');
  }

  function patch(d, via) {
    if (d.state !== 'infected') return false;
    d.state = 'good';
    d.mesh.material = M.fresh;
    d.tag.el.textContent = tagText(d);
    d.tag.el.classList.remove('bad');
    ev.commit(`${via || 'fix(deps)'}: bump ${d.name} ${d.verBad} → ${d.verGood}`);
    ev.patched?.(d);
    return true;
  }

  function poke(d) {
    // tapped a healthy dep — nothing to do, tiny commit
    ev.commit(`chore: ${d.name} already on ${d.verGood}`, 'dim');
  }

  function remove(d) {
    scene.remove(d.mesh); scene.remove(d.spark); scene.remove(d.ring);
    d.tag.remove();
    if (d.tile) d.tile.dep = null;
    usedNames.delete(d.name);
    const i = list.indexOf(d); if (i >= 0) list.splice(i, 1);
  }

  // blast tiles: ragged 3x3 — always the 4 orthogonals, ~70% of diagonals
  const BLAST_DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  function blastTiles(c) {
    const out = [c];
    for (const [dx, dz] of BLAST_DIRS) {
      const t = world.tileAt(c.gx + dx, c.gz + dz);
      if (t && (Math.abs(dx) + Math.abs(dz) === 1 || rnd() < .7)) out.push(t);
    }
    return out;
  }

  function explode(d) {
    // chain detonation: infected deps caught in a blast go off too
    const queue = [d];
    const seen = new Set();
    let depth = 0;
    while (queue.length && depth++ < 6) {
      const cur = queue.shift();
      if (seen.has(cur)) continue;
      seen.add(cur);
      const c = cur.tile;
      const blast = c ? blastTiles(c) : [];
      // queue up infected deps sitting in the blast; remove the rest
      for (const t of blast) {
        const od = t.dep;
        if (!od || od === cur || seen.has(od)) continue;
        if (od.state === 'infected') queue.push(od);
        else { ev.collateral?.(od); remove(od); }
      }
      ev.exploded?.(cur, blast, depth === 1);
      remove(cur);
      blast.forEach(t => world.setCrater(t));
    }
  }

  function nearestGood(x, z) {
    let best = null, bd = 1e9;
    for (const d of list) {
      if (d.state !== 'good' || d.latch) continue;
      const dist = Math.hypot(d.tile.x - x, d.tile.z - z);
      if (dist < bd) { bd = dist; best = d; }
    }
    return best;
  }

  function depNear(x, z) {
    for (const d of list) {
      if (Math.hypot(d.tile.x - x, d.tile.z - z) < 0.9) return d;
    }
    return null;
  }

  function update(dt, botPos, t) {
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i];
      // grow-out-of-the-floor entrance
      if (d.appear > 0) {
        d.appear -= dt;
        const k = 1 - Math.max(0, d.appear) / .45;
        const e = 1 - Math.pow(1 - k, 3);
        d.mesh.scale.y = Math.max(.05, e);
        d.mesh.position.y = world.TOP_Y + .5 + .5 * e;
      }
      // proximity tag
      const dist = Math.hypot(d.tile.x - botPos.x, d.tile.z - botPos.z);
      const near = dist < 4.5;
      d.tag.visible(near);
      if (d.state === 'infected') {
        d.fuse -= dt;
        const urg = d.fuse < 8 ? 14 : 9;
        d.spark.visible = Math.sin(t * urg + i) > .1;
        // pulsing attention ring
        d.ring.visible = true;
        const pulse = 1 + Math.sin(t * urg * .6 + i) * .12;
        d.ring.scale.set(pulse, 1, pulse);
        d.ring.material = d.fuse < 8 ? FM.ledRed : FM.ledAmber;
        // fuse countdown + action inside the tag when close
        if (near) d.tag.el.innerHTML =
          `${d.name} ${d.verBad} <span class="hot">${Math.ceil(d.fuse)}s</span><br><span class="act">TAP TO UPDATE</span>`;
        if (d.fuse <= 0) explode(d);
      } else {
        d.spark.visible = false;
        d.ring.visible = false;
        if (near && !d.tag.el.dataset.ok) {
          d.tag.el.textContent = tagText(d);
          d.tag.el.dataset.ok = 1;
        }
      }
      // latch shake
      if (d.latch) d.mesh.rotation.y = Math.sin(t * 30) * .1;
      else if (d.mesh.rotation.y) d.mesh.rotation.y = 0;
    }
  }

  return {
    list, spawn, infect, patch, poke, remove, explode, nearestGood, depNear, update,
    cveId: () => cveId(rnd), FUSE_S,
    set fuseS(v) { fuseS = v; },
    get infected() { return list.filter(d => d.state === 'infected').length; },
  };
}
