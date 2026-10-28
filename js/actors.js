// 다른 대원 아바타, 외계 생물, 조명탄 렌더링 (호스트 스냅샷을 보간)
import * as THREE from 'three';
import { height } from './terrain.js';
import { Q, mat, blobShadow, glowSprite } from './quality.js';

const lerpAng = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

function nameSprite(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 30px "Noto Sans KR", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(128 - x.measureText(text).width / 2 - 12, 10, x.measureText(text).width + 24, 44);
  x.fillStyle = color; x.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false }));
  s.scale.set(1.6, 0.4, 1); s.renderOrder = 10;
  return s;
}

export function makeAvatar(color, name) {
  const g = new THREE.Group();
  const suit = mat({ color, roughness: 0.7 });
  const white = mat({ color: '#e8e8ec', roughness: 0.5 });
  const dark = mat({ color: '#202028', roughness: 0.3, metalness: 0.4 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(new THREE.CapsuleGeometry(0.3, 0.55, 4, 8), suit, 0, 1.05, 0);
  add(new THREE.SphereGeometry(0.26, 16, 12), white, 0, 1.68, 0);
  add(new THREE.BoxGeometry(0.32, 0.15, 0.1), mat({ color: '#141420', emissive: '#ff9a3d', emissiveIntensity: 0.22, roughness: 0.15, metalness: 0.7 }), 0, 1.7, -0.2);
  const teamLight = mat({ color, emissive: color, emissiveIntensity: 1.6 });
  add(new THREE.BoxGeometry(0.44, 0.06, 0.02), teamLight, 0, 1.32, 0.385);
  add(new THREE.SphereGeometry(0.045, 8, 6), mat({ color: '#fff', emissive: '#fff4dc', emissiveIntensity: 2 }), 0.2, 1.78, -0.12);
  const beamCone = new THREE.Mesh(new THREE.ConeGeometry(1.6, 9, 14, 1, true).translate(0, -4.5, 0), new THREE.MeshBasicMaterial({ color: '#fff4dc', transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beamCone.rotation.x = Math.PI / 2; beamCone.position.set(0.2, 1.45, -0.3); beamCone.visible = false; g.add(beamCone);
  if (!Q.shadows) g.add(blobShadow(1.3));
  add(new THREE.BoxGeometry(0.42, 0.5, 0.22), white, 0, 1.15, 0.27);
  const limb = new THREE.CapsuleGeometry(0.1, 0.5, 4, 6); limb.translate(0, -0.3, 0);
  const mk = (x, y, mat) => { const p = new THREE.Group(); p.position.set(x, y, 0); const m = new THREE.Mesh(limb, mat); m.castShadow = true; p.add(m); g.add(p); return p; };
  const legs = [mk(-0.14, 0.62, suit), mk(0.14, 0.62, suit)];
  const arms = [mk(-0.4, 1.38, suit), mk(0.4, 1.38, suit)];
  const label = nameSprite(name, color); label.position.y = 2.25; g.add(label);
  const carry = new THREE.Group(); carry.position.set(0, 1.2, -0.5); g.add(carry);
  g.userData = { legs, arms, label, carry, phase: 0, beamCone };
  return g;
}

export function carryMesh(kind) {
  const g = new THREE.Group();
  if (kind === 'antenna') {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.8, 14, 8, 0, Math.PI * 2, 0, 1.0), mat({ color: '#cfd3d8', metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide }));
    m.rotation.x = -1.2; g.add(m);
  } else if (kind === 'core') {
    g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), mat({ color: '#c14dff', emissive: '#b230ff', emissiveIntensity: 2.5 })));
  }
  return g;
}

function makeAlien() {
  const g = new THREE.Group();
  const skin = mat({ color: '#0e0a14', roughness: 0.9, metalness: 0 });
  const stripe = mat({ color: '#2a0f3a', emissive: '#a33cff', emissiveIntensity: 1.2 });
  const eye = mat({ color: '#300', emissive: '#ff2030', emissiveIntensity: 3 });
  const body = new THREE.Group(); g.add(body);
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 10), skin); torso.scale.set(0.85, 0.7, 1.9); torso.position.y = 1.7; torso.castShadow = true; body.add(torso);
  for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.35), stripe); s.position.set(0, 2.15, -0.7 + i * 0.45); body.add(s); }
  for (let i = 0; i < 8; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), stripe); d.position.set((i % 2 ? 1 : -1) * 0.45, 1.75 + (i % 3) * 0.08, -0.8 + Math.floor(i / 2) * 0.5); body.add(d); }
  if (!Q.shadows) g.add(blobShadow(2.6));
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.1, 6), skin); neck.position.set(0, 2.1, -1.2); neck.rotation.x = -0.9; body.add(neck);
  const head = new THREE.Group(); head.position.set(0, 2.4, -1.6); body.add(head);
  const skull = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.1, 6), skin); skull.rotation.x = -Math.PI / 2; skull.position.z = -0.3; skull.castShadow = true; head.add(skull);
  for (const [x, y] of [[-0.12, 0.08], [0.12, 0.08], [0, 0.17]]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), eye); e.position.set(x, y, -0.25); head.add(e); }
  const legGeo = new THREE.CylinderGeometry(0.06, 0.03, 2.0, 5); legGeo.translate(0, -1.0, 0);
  const legs = [];
  for (const [x, z] of [[-0.45, -0.7], [0.45, -0.7], [-0.45, 0.8], [0.45, 0.8]]) {
    const p = new THREE.Group(); p.position.set(x, 1.7, z); body.add(p);
    const l = new THREE.Mesh(legGeo, skin); l.rotation.z = x > 0 ? 0.35 : -0.35; l.castShadow = true; p.add(l);
    legs.push(p);
  }
  g.userData = { body, legs, head, eye, phase: Math.random() * 6, st: 0 };
  return g;
}

// "울보": 창백하고 키 큰 네발 개체. 목의 울음주머니가 부풀며 비명을 지른다
function makeScreamer() {
  const g = new THREE.Group();
  const skin = mat({ color: '#b8ad9c', roughness: 0.85, emissive: '#3a352c', emissiveIntensity: 0.8 });
  const eye = mat({ color: '#330', emissive: '#e8ff3a', emissiveIntensity: 3 });
  const sacMat = mat({ color: '#4a5a10', emissive: '#c8ff4d', emissiveIntensity: 1.2, transparent: true, opacity: 0.85 });
  const body = new THREE.Group(); g.add(body);
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), skin); torso.scale.set(0.8, 0.8, 1.3); torso.position.y = 2.5; torso.castShadow = true; body.add(torso);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 1.5, 6), skin); neck.position.set(0, 3.3, -0.35); neck.rotation.x = -0.35; body.add(neck);
  const head = new THREE.Group(); head.position.set(0, 4.0, -0.6); body.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), skin); skull.scale.set(1, 0.85, 1.25); skull.castShadow = true; head.add(skull);
  const e = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), eye); e.position.set(0, 0.06, -0.36); head.add(e);
  const sac = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), sacMat); sac.position.set(0, 3.0, -0.55); body.add(sac);
  const legGeo = new THREE.CylinderGeometry(0.045, 0.025, 2.7, 5); legGeo.translate(0, -1.35, 0);
  const legs = [];
  for (const [x, z] of [[-0.35, -0.4], [0.35, -0.4], [-0.35, 0.5], [0.35, 0.5]]) {
    const p = new THREE.Group(); p.position.set(x, 2.5, z); body.add(p);
    const l = new THREE.Mesh(legGeo, skin); l.rotation.z = x > 0 ? 0.2 : -0.2; l.castShadow = true; p.add(l);
    legs.push(p);
  }
  if (!Q.shadows) g.add(blobShadow(2));
  g.userData = { body, legs, head, eye, sac, sacMat, phase: Math.random() * 6, st: 0, screamer: true };
  return g;
}

export class Actors {
  constructor(scene) {
    this.scene = scene;
    this.players = {}; this.aliens = {};
    this.spots = [];
    for (let i = 0; i < 3; i++) {
      const s = new THREE.SpotLight('#fff4dc', 0, 35, 0.45, 0.5, 1.2);
      if (Q.lights) { scene.add(s); scene.add(s.target); }
      this.spots.push(s);
    }
    this.flareLights = []; this.flareSprites = [];
    const fm = new THREE.SpriteMaterial({ color: '#d6a3ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight('#b066ff', 0, 30, 1.2); if (Q.lights) scene.add(l); this.flareLights.push(l);
      const s = new THREE.Sprite(fm); s.visible = false; s.scale.setScalar(1.6); scene.add(s); this.flareSprites.push(s);
    }
    this.alienNear = 1e9; this.chasing = 0;
  }

  syncPlayers(G, snap, myId) {
    if (!G) return;
    for (const id in this.players) if (!G.players[id] || id === myId) { this.scene.remove(this.players[id]); delete this.players[id]; }
    for (const id in G.players) {
      if (id === myId) continue;
      const pl = G.players[id];
      let a = this.players[id];
      if (!a) { a = makeAvatar(pl.color, pl.name); a.visible = false; this.scene.add(a); this.players[id] = a; }
      const s = snap?.p?.[id];
      if (s) { a.userData.target = s; if (!a.visible) { a.position.set(s[0], s[1], s[2]); a.visible = true; } }
      a.userData.down = pl.down;
      const carryId = Object.keys(G.carry).find(k => k === id) ? G.carry[id] : null;
      const kind = carryId ? carryId.replace(/\d+$/, '') : null;
      if (a.userData.carryKind !== kind) {
        a.userData.carry.clear(); if (kind) a.userData.carry.add(carryMesh(kind));
        a.userData.carryKind = kind;
      }
    }
  }

  syncAliens(list) {
    const seen = new Set();
    for (const [id, x, z, ry, st, type] of list) {
      seen.add(id);
      let a = this.aliens[id];
      if (!a) { a = type === 1 ? makeScreamer() : makeAlien(); a.position.set(x, height(x, z), z); a.rotation.y = ry; this.scene.add(a); this.aliens[id] = a; a.userData.fade = 0; }
      a.userData.tx = x; a.userData.tz = z; a.userData.try = ry; a.userData.prevSt = a.userData.st; a.userData.st = st;
    }
    for (const id in this.aliens) if (!seen.has(+id)) { this.scene.remove(this.aliens[id]); delete this.aliens[id]; }
  }

  update(dt, G, me, now) {
    let si = 0;
    for (const id in this.players) {
      const a = this.players[id], s = a.userData.target;
      if (!s) continue;
      const k = Math.min(1, dt * 12);
      a.position.x += (s[0] - a.position.x) * k; a.position.y += (s[1] - a.position.y) * k; a.position.z += (s[2] - a.position.z) * k;
      a.rotation.y = lerpAng(a.rotation.y, s[3], k);
      const u = a.userData, mv = s[7];
      u.phase += dt * mv * 2.2;
      const sw = Math.sin(u.phase) * Math.min(1, mv / 4) * 0.7;
      u.legs[0].rotation.x = sw; u.legs[1].rotation.x = -sw; u.arms[0].rotation.x = -sw * 0.8; u.arms[1].rotation.x = sw * 0.8;
      if (u.carryKind) { u.arms[0].rotation.x = u.arms[1].rotation.x = -1.3; }
      a.rotation.x = u.down ? -Math.PI / 2 * 0.95 : 0;
      if (u.down) a.position.y = s[1] + 0.3;
      a.scale.y = s[6] ? 0.7 : 1;
      u.beamCone.visible = !!s[5] && !u.down;
      if (u.beamCone.visible) u.beamCone.rotation.x = Math.PI / 2 + s[4];
      if (s[5] && !u.down && si < this.spots.length) {
        const sp = this.spots[si++];
        sp.intensity = 40;
        sp.position.set(a.position.x, a.position.y + 1.5, a.position.z);
        const ry = s[3], rx = s[4];
        sp.target.position.set(a.position.x - Math.sin(ry) * Math.cos(rx) * 10, a.position.y + 1.5 + Math.sin(rx) * 10, a.position.z - Math.cos(ry) * Math.cos(rx) * 10);
      }
    }
    for (; si < this.spots.length; si++) this.spots[si].intensity = 0;

    // 외계 생물
    let near = 1e9, chasing = 0;
    for (const id in this.aliens) {
      const a = this.aliens[id], u = a.userData;
      const k = Math.min(1, dt * 8);
      const ox = a.position.x, oz = a.position.z;
      a.position.x += (u.tx - a.position.x) * k; a.position.z += (u.tz - a.position.z) * k;
      a.rotation.y = lerpAng(a.rotation.y, u.try, Math.min(1, dt * 6));
      const sleep = u.st === 3;
      const gy = height(a.position.x, a.position.z);
      a.position.y = gy + (sleep ? -0.9 : 0);
      const spd = Math.hypot(a.position.x - ox, a.position.z - oz) / Math.max(dt, 1e-3);
      u.phase += dt * (1.5 + spd * 1.6);
      u.legs.forEach((l, i) => { l.rotation.x = Math.sin(u.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * Math.min(0.7, spd * 0.12); });
      u.body.position.y = Math.sin(u.phase * 2) * 0.05;
      u.head.rotation.y = Math.sin(u.phase * 0.3) * (u.st === 1 ? 0.1 : 0.5);
      u.eye.emissiveIntensity = u.st === 1 || u.st === 4 ? 6 : sleep ? 0.6 : 3;
      if (u.screamer) {
        const sc = u.st === 4;
        u.sac.scale.setScalar(sc ? 1.6 + Math.sin(u.phase * 14) * 0.35 : 1);
        u.sacMat.emissiveIntensity = sc ? 4 : 1.2;
        u.head.rotation.x = sc ? 0.7 : 0;
      }
      if (u.fade < 1) { u.fade = Math.min(1, u.fade + dt); a.scale.setScalar(0.3 + u.fade * 0.7); }
      if (me) {
        const d = Math.hypot(a.position.x - me.x, a.position.z - me.z);
        if (d < near) near = d;
        if (u.st === 1 && d < 45) chasing++;
      }
    }
    this.alienNear = near; this.chasing = chasing;

    // 조명탄
    const fl = (G?.flares || []).filter(f => f.until > now).slice(-3);
    this.flareLights.forEach((l, i) => {
      const f = fl[i], s = this.flareSprites[i];
      if (!f) { l.intensity = 0; s.visible = false; return; }
      const y = height(f.x, f.z) + 0.6;
      l.position.set(f.x, y + 1, f.z); l.intensity = 40 + Math.random() * 15;
      s.position.set(f.x, y, f.z); s.visible = true; s.scale.setScalar((Q.lights ? 1.3 : 6) + Math.random() * 0.6);
    });
  }
}
