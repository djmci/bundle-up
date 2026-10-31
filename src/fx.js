// fx.js — cube-debris particle pool + screen shake.

import * as THREE from '../vendor/three.module.min.js';

const POOL = 160;
const COLORS = {
  red: 0xff2a30, teal: 0x3cf0c8, amber: 0xff9a2a,
  cream: 0xf4ecdd, dark: 0x2a2f3a, green: 0x4a8f3c, beige: 0xc8b898,
};

export function makeFx(scene) {
  const mats = {};
  for (const k in COLORS) mats[k] = new THREE.MeshBasicMaterial({ color: COLORS[k] });
  const geo = new THREE.BoxGeometry(.12, .12, .12);
  const pool = [];
  let shakeMag = 0;

  function burst(x, y, z, color, n = 10, spd = 3) {
    for (let i = 0; i < n; i++) {
      let p = pool.find(p => !p.alive);
      if (!p) {
        if (pool.length >= POOL) return;
        p = { m: new THREE.Mesh(geo, mats[color]), v: new THREE.Vector3(), life: 0, alive: false };
        scene.add(p.m);
        pool.push(p);
      }
      p.m.material = mats[color] || mats.dark;
      p.m.visible = true;
      p.m.position.set(x, y, z);
      p.m.scale.setScalar(.6 + Math.random() * .9);
      p.v.set((Math.random() - .5) * spd, Math.random() * spd * 1.2, (Math.random() - .5) * spd);
      p.life = .5 + Math.random() * .5;
      p.alive = true;
    }
  }

  function update(dt) {
    for (const p of pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; p.m.visible = false; continue; }
      p.v.y -= 12 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.scale.multiplyScalar(1 - dt * .8);
    }
    shakeMag = Math.max(0, shakeMag - dt * 2.2);
  }

  const shakeOff = new THREE.Vector3();
  function shake(amt) { shakeMag = Math.min(1, shakeMag + amt); }
  function applyShake(v) {
    shakeOff.set((Math.random() - .5) * shakeMag * .5,
                 (Math.random() - .5) * shakeMag * .5,
                 (Math.random() - .5) * shakeMag * .5);
    v.add(shakeOff);
  }

  return { burst, shake, applyShake, update, get shakeMag() { return shakeMag; } };
}
