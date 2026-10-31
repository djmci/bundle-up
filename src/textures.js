// textures.js — pixel maps -> CanvasTexture, sprites.js style.
// Each map: rows of chars; chars look up `pal`. All NearestFilter.

import * as THREE from '../vendor/three.module.min.js';

export function tex(map, pal) {
  const cv = document.createElement('canvas');
  cv.width = map[0].length; cv.height = map.length;
  const g = cv.getContext('2d');
  map.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const col = pal[row[c]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(c, r, 1, 1);
    }
  });
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function speck(base, dots, size = 16, seed = 7) {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const g = cv.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  let sd = seed;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  dots.forEach(([col, n]) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = col;
      g.fillRect(rnd() * size | 0, rnd() * size | 0, 1, 1);
    }
  });
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const T = {
  // raised DC floor tile — light slab, dark seams, bolts, one LED
  floorTop: tex([
    'SSSSSSSSSSSSSSSS',
    'SPPPPPPPPPPPPPPS',
    'SPPPPBPPPPPPPPPS',
    'SPPPPPPPPPPPBPPP',
    'SPPPPPPPPPPPPPPS',
    'SPBPPPPPPPPPPPPS',
    'SPPPPPPPLPPPPPPS',
    'SPPPPPPPPPPPPPPS',
    'SPPPPPPPPPPPPBPS',
    'SPPPPBPPPPPPPPPS',
    'SPPPPPPPPPPPPPPS',
    'SPPPPPPPPPBPPPPS',
    'SPPPPPPPPPPPPPPS',
    'SPPBPPPPPPPPPPPS',
    'SPPPPPPPPPPPPPPS',
    'SSSSSSSSSSSSSSSS',
  ], { S: '#8f96a4', P: '#b8bec9', B: '#9aa1ae', L: '#3cf0c8' }),
  floorSide: tex([
    'SSSSSSSSSSSSSSSS',
    'SVVVVVVVSSVVVVVS',
    'SVVVVVVVSSVVVVVS',
    'SSSSSSSSSSSSSSSS',
    'SSSSSSSSSSSSSSSS',
    'SSSSSSSSSSSSSSSS',
    'SSSSSSSSSSSSSSSS',
    'HHHHHHHHHHHHHHHH',
  ], { S: '#4a5160', V: '#333a48', H: '#d92a10' }),
  hull: speck('#4a5160', [['#3a4050', 14], ['#5a6170', 10]], 16, 7),
  hullDeep: speck('#333a48', [['#262c38', 12], ['#3e4654', 8]], 16, 13),

  // gem core pad — light tile ringed in red, ruby specks inside
  coreTop: tex([
    'RRRRRRRRRRRRRRRR',
    'RPPPPPPPPPPPPPPR',
    'RPPPPPPRRPPPPPPR',
    'RPPPPRRRRPPPPPPR',
    'RPPPPPPRRPPPPRPR',
    'RPPPPPPPPPPRRRPR',
    'RPPRPPPPPPPRRRPR',
    'RPRRRPPPPPPPRPPR',
    'RPRRRPPPPRPPPPPR',
    'RPPPPPPPPRRRPPPR',
    'RPPPPRPPPRRRPPPR',
    'RPPPRRRPPPPRPPPR',
    'RPPPPRRPPPPPPPPR',
    'RPPPPPPPPPPPPPPR',
    'RPPPPPPPPPPPPPPR',
    'RRRRRRRRRRRRRRRR',
  ], { R: '#ff2a30', P: '#b8bec9' }),
  coreSide: tex([
    'HHHHHHHHHHHHHHHH',
    'HHHHHHHHHHHHHHHH',
    'SPPPPPPPPPPPPPPS',
    'SPPPPPPPPPPPPPPS',
    'SPPPRPPPPPRPPPPS',
    'SSSSSSSSSSSSSSSS',
    'SSSSSSSSSSSSSSSS',
    'SSSSSSSSSSSSSSSS',
  ], { H: '#d92a10', P: '#6a7282', S: '#4a5160', R: '#ff2a30' }),

  // crater — scorched tile, ember specks
  craterTop: speck('#3a3128', [['#241d18', 18], ['#4a4038', 10], ['#ff6a2a', 3]], 16, 21),
  craterSide: tex([
    'SSSSSSSSSSSSSSSS',
    'SSSSSSSSSSSSSSSS',
    'SSSSSSSSSSSSSSSS',
    'SSSSSSSSSSSSSSSS',
    'SSSSSSSSSSSSSSSS',
    'SSSSSSSSSSSSSSSS',
    'SSSSSSSSSSSSSSSS',
    'HHHHHHHHHHHHHHHH',
  ], { S: '#241d18', H: '#cc4a1a' }),

  // legacy beige tower — floppy slot, vents, power + fault LEDs
  legacy: tex([
    'BBBBBBBBBBBBBBBB',
    'BBDDDDDDDDBBGBBB',
    'BBDDDDDDDDBBBBBB',
    'BBBBBBBBBBBBBBBB',
    'BBFFFFFFFFFFFFBB',
    'BBBBBBBBBBBBBBBB',
    'BBVVVVVVVVVVVVBB',
    'BBVVVVVVVVVVVVBB',
    'BBBBBBBBBBBBBBBB',
    'BBVVVVVVVVVVVVBB',
    'BBVVVVVVVVVVVVBB',
    'BBBBBBBBBBBBBBBB',
    'BBDDDDDDBBAAAAAB',
    'BBDDDDDDBBAAAAAB',
    'BBBBBBBBBBBBBBBB',
    'BBBBBBBBBBBBBBBB',
  ], { B: '#c8b898', D: '#8a7a5c', G: '#7ac86a', F: '#5a4f3a', V: '#a89878', A: '#ff9a2a' }),

  // fresh rack — dark, teal LEDs (updated dep, decor racks)
  fresh: tex([
    'KKKKKKKKKKKKKKKK',
    'KGGKGGKGGKGGKGKK',
    'KKKKKKKKKKKKKKKK',
    'KKGKKGGKGGKGGKKK',
    'KKKKKKKKKKKKKKKK',
    'KGGKGGKGGKGGKGKK',
    'KKKKKKKKKKKKKKKK',
    'KKKKKKKKKKKKKKKK',
  ], { K: '#232a36', G: '#3cf0c8' }),

  // zombie face (16px)
  zombieFace: tex([
    'KKKKKKKKKKKKKKKK',
    'KGGGGGGGGGGGGGGK',
    'KGGGGGGGGGGGGGGK',
    'KGGDDGGGGGGDDGGK',
    'KGGDDGGGGGGDDGGK',
    'KGGGGGGGGGGGGGGK',
    'KGGGGGDDDDGGGGGK',
    'KKKKKKKKKKKKKKKK',
  ], { K: '#3c7a30', G: '#4a8f3c', D: '#1c2418' }),

  // bundler bot face — dark visor, cyan eyes
  botFace: tex([
    'CCCCCCCCCCCCCCCC',
    'CCCCCCCCCCCCCCCC',
    'CCWWWWWWWWWWWWCC',
    'CCWWTTWWWWTTWWCC',
    'CCWWTTWWWWTTWWCC',
    'CCWWWWWWWWWWWWCC',
    'CCCCCCCCCCCCCCCC',
    'CCCCCCCCCCCCCCCC',
  ], { C: '#f4ecdd', W: '#232936', T: '#3cf0c8' }),
};

export const M = {};
for (const k in T) M[k] = new THREE.MeshLambertMaterial({ map: T[k] });

// flat materials for props/particles
export const FM = {
  ruby: new THREE.MeshLambertMaterial({ color: 0xff2a30, emissive: 0x771111 }),
  ledTeal: new THREE.MeshBasicMaterial({ color: 0x3cf0c8 }),
  ledRed: new THREE.MeshBasicMaterial({ color: 0xff2a00 }),
  ledAmber: new THREE.MeshBasicMaterial({ color: 0xff9a2a }),
  zombieSkin: new THREE.MeshLambertMaterial({ color: 0x4a8f3c }),
  zombieFace: new THREE.MeshLambertMaterial({ map: T.zombieFace }),
  hoodie: new THREE.MeshLambertMaterial({ color: 0x353d4d }),
  pants: new THREE.MeshLambertMaterial({ color: 0x232936 }),
  botBody: new THREE.MeshLambertMaterial({ color: 0xf4ecdd }),
  botFace: new THREE.MeshLambertMaterial({ map: T.botFace }),
  botDark: new THREE.MeshLambertMaterial({ color: 0x232936 }),
  cloud: new THREE.MeshLambertMaterial({ color: 0xfdfbf4 }),
  ghost: new THREE.MeshBasicMaterial({ color: 0x000000, visible: false }),
};
