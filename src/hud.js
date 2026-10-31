// hud.js — all DOM chrome over the canvas: chips, commit feed, CVE banner,
// world-anchored version tags (projected per-frame, always crisp),
// overlay card, damage vignette, toast.

import * as THREE from '../vendor/three.module.min.js';

export function makeHud() {
  const el = {
    hearts: document.getElementById('hearts'),
    score: document.getElementById('score'),
    release: document.getElementById('release'),
    hint: document.getElementById('hint'),
    cve: document.getElementById('cve'),
    feed: document.getElementById('feed'),
    tags: document.getElementById('tags'),
    dmg: document.getElementById('dmg'),
    overlay: document.getElementById('overlay'),
    ovTitle: document.getElementById('ov-title'),
    ovSub: document.getElementById('ov-sub'),
    ovBtn: document.getElementById('ov-btn'),
    ovBtn2: document.getElementById('ov-btn2'),
    toast: document.getElementById('toast'),
  };

  // ---- chips ----
  const setHearts = n => { el.hearts.textContent = n > 0 ? '♥ '.repeat(n).trim() : '× × ×'; };
  const setScore = n => { el.score.textContent = `SCORE ${String(n).padStart(4, '0')}`; };
  const setRelease = n => { el.release.textContent = `RELEASE ${n}`; };

  // ---- commit feed (bottom-left, max 3) ----
  function commit(text, cls = '') {
    const c = document.createElement('div');
    c.className = 'commit ' + cls;
    c.textContent = text;
    el.feed.prepend(c);
    requestAnimationFrame(() => c.classList.add('on'));
    while (el.feed.children.length > 3) el.feed.lastChild.remove();
    setTimeout(() => { c.classList.remove('on'); setTimeout(() => c.remove(), 300); }, 4600);
  }

  // ---- CVE banner ----
  let bannerT = null;
  function banner(text, durS = 3, cls = '') {
    el.cve.textContent = text;
    el.cve.className = cls;
    el.cve.classList.remove('hidden');
    clearTimeout(bannerT);
    bannerT = setTimeout(() => el.cve.classList.add('hidden'), durS * 1000);
  }

  // ---- world tags (proximity-gated DOM labels) ----
  const tags = [];
  function tag(x, y, z) {
    const e = document.createElement('div');
    e.className = 'tag';
    el.tags.appendChild(e);
    const t = {
      el: e,
      pos: new THREE.Vector3(x, y, z),
      on: false,
      visible(b) { t.on = b; e.style.display = b ? 'block' : 'none'; },
      remove() { e.remove(); const i = tags.indexOf(t); if (i >= 0) tags.splice(i, 1); },
    };
    tags.push(t);
    return t;
  }
  const v3 = new THREE.Vector3();
  function placeTags(camera, W, H) {
    for (const t of tags) {
      if (!t.on) continue;
      v3.copy(t.pos).project(camera);
      if (v3.z > 1) { t.el.style.display = 'none'; continue; }
      t.el.style.display = 'block';
      t.el.style.left = `${(v3.x * .5 + .5) * W}px`;
      t.el.style.top = `${(-v3.y * .5 + .5) * H}px`;
    }
  }

  // ---- overlay card ----
  function showCard({ title, sub, btn, btn2 }) {
    el.ovTitle.innerHTML = title;
    el.ovSub.innerHTML = sub;
    el.ovBtn.textContent = btn;
    if (btn2) { el.ovBtn2.textContent = btn2; el.ovBtn2.classList.remove('hidden'); }
    else el.ovBtn2.classList.add('hidden');
    el.overlay.classList.remove('hidden');
  }
  const hideCard = () => el.overlay.classList.add('hidden');
  const onCardBtn = f => { el.ovBtn.onclick = f; };
  const onCardBtn2 = f => { el.ovBtn2.onclick = f; };

  // ---- floating pickup text ----
  function popPx(x, y, text, cls = '') {
    const e = document.createElement('div');
    e.className = 'pop ' + cls;
    e.textContent = text;
    e.style.left = `${x}px`;
    e.style.top = `${y}px`;
    el.tags.appendChild(e);
    setTimeout(() => e.remove(), 1000);
  }

  // ---- feedback ----
  function dmgFlash() {
    el.dmg.classList.add('on');
    setTimeout(() => el.dmg.classList.remove('on'), 250);
  }
  let toastT = null;
  function toast(text, durS = 2.4) {
    el.toast.textContent = text;
    el.toast.classList.remove('hidden');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.toast.classList.add('hidden'), durS * 1000);
  }

  return { el, setHearts, setScore, setRelease, commit, banner, tag, placeTags, popPx, showCard, hideCard, onCardBtn, onCardBtn2, dmgFlash, toast };
}
