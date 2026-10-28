// 3D 월드: 하늘/지형/식생/우주선 잔해/상호작용 오브젝트
import * as THREE from 'three';
import { height, P, HALF, WATER_Y, mulberry32, SEED, fbm, smooth, inLake } from './terrain.js';
import { isNight, SAFE_R } from './host.js';
import { SYNCS } from './data.js';

export const FLOOR = { x0: -4, x1: 4, z0: -3, z1: 3, y: 0.2 };
const C = h => new THREE.Color(h);
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
const glow = (color, emissive, k = 1, o = {}) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: k, roughness: 0.5, ...o });

// 낮=1, 밤=0
export function dayFactor(t) {
  let k;
  if (t < 0.04) k = 0.35 + 0.65 * (t / 0.04);
  else if (t < 0.6) k = 1;
  else if (t < 0.68) k = 1 - (t - 0.6) / 0.08;
  else if (t > 0.95) k = (t - 0.95) / 0.05 * 0.35;
  else k = 0;
  return k * k * (3 - 2 * k);
}

export class World {
  constructor(scene, ents, opt = {}) {
    this.scene = scene; this.ents = ents; this.low = !!opt.low;
    this.boxes = []; this.cells = new Map();
    this.anim = []; this.meshes = {};
    this.R = mulberry32(SEED + 9);
    this.clock = 0;
    this.buildLights(); this.buildSky(); this.buildTerrain(); this.buildWater();
    this.buildDecor(); this.buildShip(); this.buildEntities(); this.buildSpores();
  }

  // ───────── 충돌 ─────────
  addBox(x0, x1, z0, z1, top = 4) { this.boxes.push({ x0, x1, z0, z1, top }); }
  addCircle(x, z, r) {
    const k = Math.floor(x / 10) + ',' + Math.floor(z / 10);
    if (!this.cells.has(k)) this.cells.set(k, []);
    this.cells.get(k).push({ x, z, r });
  }
  groundAt(x, z) {
    let h = height(x, z);
    if (x > FLOOR.x0 && x < FLOOR.x1 && z > FLOOR.z0 && z < FLOOR.z1) h = Math.max(h, FLOOR.y);
    return h;
  }
  collide(p, r) {
    for (const b of this.boxes) {
      if (p.y > b.top) continue;
      const cx = Math.max(b.x0, Math.min(b.x1, p.x)), cz = Math.max(b.z0, Math.min(b.z1, p.z));
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x += dx / d * (r - d); p.z += dz / d * (r - d); }
      else {
        const l = p.x - b.x0, rr = b.x1 - p.x, t = p.z - b.z0, bb = b.z1 - p.z, m = Math.min(l, rr, t, bb);
        if (m === l) p.x = b.x0 - r; else if (m === rr) p.x = b.x1 + r; else if (m === t) p.z = b.z0 - r; else p.z = b.z1 + r;
      }
    }
    const gx = Math.floor(p.x / 10), gz = Math.floor(p.z / 10);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = this.cells.get((gx + i) + ',' + (gz + j)); if (!list) continue;
      for (const c of list) {
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = r + c.r;
        if (d < m && d > 1e-6) { p.x += dx / d * (m - d); p.z += dz / d * (m - d); }
      }
    }
    p.x = Math.max(-HALF + 25, Math.min(HALF - 25, p.x));
    p.z = Math.max(-HALF + 25, Math.min(HALF - 25, p.z));
  }

  // ───────── 조명/하늘 ─────────
  buildLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight('#d8c4ff', '#3a2a40', 1.1); s.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffe2c4', 2.6);
    this.sun.castShadow = !this.low;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    s.add(this.sun); s.add(this.sun.target);
    s.fog = new THREE.FogExp2('#a58bbf', 0.004);
  }

  buildSky() {
    this.skyGroup = new THREE.Group(); this.scene.add(this.skyGroup);
    this.skyU = { top: { value: C('#4a2f80') }, bot: { value: C('#e6a7c9') }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: C('#ffd9a8') }, night: { value: 0 } };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform vec3 top,bot,sunDir,sunCol; uniform float night; varying vec3 vP;
        void main(){ float h=clamp(vP.y*1.3+0.12,0.,1.); vec3 c=mix(bot,top,pow(h,0.65));
          float s=max(dot(vP,normalize(sunDir)),0.); c+=sunCol*(pow(s,700.)*3.+pow(s,10.)*0.3)*(1.-night);
          gl_FragColor=vec4(c,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    sky.renderOrder = -10; this.skyGroup.add(sky);

    // 별
    const n = 1800, pos = new Float32Array(n * 3), R = mulberry32(SEED + 3);
    for (let i = 0; i < n; i++) {
      const u = R() * 2 - 1, a = R() * Math.PI * 2, y = Math.abs(u) * 0.95 + 0.05, r = Math.sqrt(1 - y * y);
      pos[i * 3] = Math.cos(a) * r * 900; pos[i * 3 + 1] = y * 900; pos[i * 3 + 2] = Math.sin(a) * r * 900;
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.skyGroup.add(new THREE.Points(sg, this.starMat));

    // 고리를 가진 거대 가스 행성
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256;
    const cx = cv.getContext('2d');
    for (let y = 0; y < 256; y++) {
      const v = Math.sin(y * 0.11) * 0.5 + Math.sin(y * 0.37) * 0.25 + Math.sin(y * 0.05) * 0.4;
      cx.fillStyle = `hsl(${22 + v * 14}, ${45 + v * 10}%, ${52 + v * 12}%)`; cx.fillRect(0, y, 64, 1);
    }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    this.planetMat = new THREE.MeshBasicMaterial({ map: tex, fog: false, transparent: true });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(120, 48, 32), this.planetMat);
    planet.position.set(-420, 330, -620);
    planet.rotation.z = 0.35;
    this.skyGroup.add(planet);
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#ead2b0', side: THREE.DoubleSide, transparent: true, opacity: 0.45, fog: false, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(150, 240, 96), this.ringMat);
    ring.position.copy(planet.position); ring.rotation.set(1.25, 0.2, 0.35);
    this.skyGroup.add(ring);
    // 달 두 개
    this.moons = [];
    for (const [r, x, y, z, col] of [[18, 380, 420, 300, '#d8f5e6'], [8, 520, 300, -120, '#ffc9d8']]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshBasicMaterial({ color: col, fog: false, transparent: true, opacity: 0 }));
      m.position.set(x, y, z); this.skyGroup.add(m); this.moons.push(m);
    }
  }

  // ───────── 지형 ─────────
  buildTerrain() {
    const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, 230, 230);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const c = new THREE.Color(), tmp = new THREE.Color();
    const cLow = C('#3b3150'), cHigh = C('#7b6b8f'), cCry = C('#35648c'), cFor = C('#2c1c3c'), cNest = C('#3e1519'),
      cRes = C('#5a3f2c'), cSand = C('#6e6658'), cSnow = C('#b9a9cc'), cBurn = C('#1f191e');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = height(x, z);
      pos.setY(i, h);
      c.copy(cLow).lerp(cHigh, smooth(-8, 30, h));
      const mix = (cc, p, r) => c.lerp(cc, 1 - smooth(r * 0.4, r, Math.hypot(x - p.x, z - p.z)));
      mix(cCry, P.CRYSTAL, 80); mix(cFor, P.FOREST, 85); mix(cNest, P.NEST, 60); mix(cRes, P.RESIN, 60);
      if (Math.hypot(x - P.LAKE.x, z - P.LAKE.z) < 110) c.lerp(cSand, 1 - smooth(WATER_Y - 1, WATER_Y + 2.5, h));
      c.lerp(cSnow, smooth(32, 46, h));
      c.lerp(cBurn, (1 - smooth(8, 30, Math.hypot(x + 10, z))) * 0.8);
      const v = 0.82 + 0.36 * fbm(x * 0.06, z * 0.06, 2);
      tmp.copy(c).multiplyScalar(v);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  buildWater() {
    this.waterMat = new THREE.MeshStandardMaterial({ color: '#2b7f9e', transparent: true, opacity: 0.82, roughness: 0.12, metalness: 0.2, emissive: '#06303e', emissiveIntensity: 1 });
    const w = new THREE.Mesh(new THREE.CircleGeometry(115, 64), this.waterMat);
    w.rotation.x = -Math.PI / 2; w.position.set(P.LAKE.x, WATER_Y, P.LAKE.z);
    this.scene.add(w);
  }

  // ───────── 식생/장식 ─────────
  inst(geo, mat, list, shadow = true) {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
    list.forEach((it, i) => {
      o.position.set(it.x, it.y ?? height(it.x, it.z), it.z);
      o.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
      o.scale.set(it.sx ?? it.s, it.sy ?? it.s, it.sz ?? it.s);
      o.updateMatrix(); m.setMatrixAt(i, o.matrix);
    });
    m.castShadow = shadow; m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }

  scatter(n, fn, tries = 8) {
    const R = this.R, out = [];
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < tries; k++) {
        const x = (R() * 2 - 1) * (HALF - 30), z = (R() * 2 - 1) * (HALF - 30);
        const it = fn(x, z, R);
        if (it) { out.push(it); break; }
      }
    }
    return out;
  }

  buildDecor() {
    const R = this.R;
    const d = (p, x, z) => Math.hypot(x - p.x, z - p.z);
    const clearZone = (x, z) => Math.hypot(x + 10, z) < 26 || inLake(x, z) || d(P.HILL, x, z) < 6;

    // 바위
    const rocks = this.scatter(280, (x, z) => clearZone(x, z) ? null : { x, z, s: 0.5 + R() ** 2 * 3.2, rx: R() * 3, ry: R() * 3, sy: 0 });
    for (const r of rocks) { r.sy = r.s * (0.5 + R() * 0.5); r.y = height(r.x, r.z) - r.s * 0.2; if (r.s > 1.3) this.addCircle(r.x, r.z, r.s * 0.85); }
    this.inst(new THREE.DodecahedronGeometry(1, 0), std('#5d5168', { flatShading: true }), rocks);

    // 외계 나무 (가는 기둥 + 빛나는 구)
    const trees = this.scatter(230, (x, z) => {
      if (clearZone(x, z) || d(P.FOREST, x, z) < 70 || d(P.CRYSTAL, x, z) < 60 || d(P.NEST, x, z) < 45 || d(P.RESIN, x, z) < 45 || height(x, z) > 34) return null;
      return { x, z, s: 1, sx: 1, sy: 5 + R() * 9, sz: 1, ry: R() * 6, rz: (R() - 0.5) * 0.2 };
    });
    trees.forEach(t => this.addCircle(t.x, t.z, 0.45));
    const trunk = new THREE.CylinderGeometry(0.12, 0.35, 1, 6); trunk.translate(0, 0.5, 0);
    this.inst(trunk, std('#4a3a55'), trees);
    this.bulbMat = glow('#ff8ad9', '#ff3fbf', 0.5);
    this.inst(new THREE.IcosahedronGeometry(1, 1), this.bulbMat, trees.map(t => ({ x: t.x, z: t.z, y: height(t.x, t.z) + t.sy, s: 0.6 + R() * 0.7 })));

    // 거대 버섯 숲
    const shrooms = [];
    for (let i = 0; i < 80; i++) {
      const a = R() * 6.283, r = 6 + R() * 75, x = P.FOREST.x + Math.cos(a) * r, z = P.FOREST.z + Math.sin(a) * r;
      if (inLake(x, z)) continue;
      shrooms.push({ x, z, s: 1, sy: 3 + R() * 9, sx: 1 + R() * 0.6, sz: 1 + R() * 0.6, cap: 2 + R() * 4 });
      this.addCircle(x, z, 0.8);
    }
    const stem = new THREE.CylinderGeometry(0.35, 0.6, 1, 8); stem.translate(0, 0.5, 0);
    this.inst(stem, std('#d9cfe6'), shrooms);
    this.capMat = glow('#3a2a6a', '#29c6ff', 0.35);
    const cap = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    this.inst(cap, this.capMat, shrooms.map(s => ({ x: s.x, z: s.z, y: height(s.x, s.z) + s.sy - 0.2, s: s.cap, sy: s.cap * 0.45, ry: R() * 6 })));

    // 결정 평원
    const crys = [];
    for (let i = 0; i < 170; i++) {
      const a = R() * 6.283, r = R() * 70, x = P.CRYSTAL.x + Math.cos(a) * r, z = P.CRYSTAL.z + Math.sin(a) * r;
      const s = 0.4 + R() ** 2 * 1.6;
      crys.push({ x, z, s, sy: s * (2 + R() * 3), rx: (R() - 0.5) * 0.7, rz: (R() - 0.5) * 0.7, ry: R() * 6 });
      if (s > 1) this.addCircle(x, z, s * 0.5);
    }
    this.crystalMat = glow('#9fefff', '#2fc8ff', 0.6, { roughness: 0.15, metalness: 0.1, flatShading: true });
    const cg = new THREE.CylinderGeometry(0, 0.45, 1, 6); cg.translate(0, 0.45, 0);
    this.inst(cg, this.crystalMat, crys);

    // 호박나무 숲
    const resin = [];
    for (let i = 0; i < 46; i++) {
      const a = R() * 6.283, r = 4 + R() * 45, x = P.RESIN.x + Math.cos(a) * r, z = P.RESIN.z + Math.sin(a) * r;
      if (inLake(x, z)) continue;
      resin.push({ x, z, s: 1, sx: 1.2, sz: 1.2, sy: 4 + R() * 4, rz: (R() - 0.5) * 0.3, ry: R() * 6 });
      this.addCircle(x, z, 0.6);
    }
    const rt = new THREE.CylinderGeometry(0.3, 0.55, 1, 7); rt.translate(0, 0.5, 0);
    this.inst(rt, std('#6a3d1a'), resin);
    this.inst(new THREE.DodecahedronGeometry(1, 1), glow('#d9822b', '#7a3300', 0.4, { flatShading: true }),
      resin.map(t => ({ x: t.x, z: t.z, y: height(t.x, t.z) + t.sy + 0.8, s: 2 + R() * 1.4 })));

    // 둥지: 거대한 갈비뼈 가시
    const ribs = [];
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * 6.283, x = P.NEST.x + Math.cos(a) * 26, z = P.NEST.z + Math.sin(a) * 26;
      ribs.push({ x, z, s: 1, sx: 1, sz: 1, sy: 9 + R() * 5, rx: Math.sin(a) * -0.45, rz: Math.cos(a) * 0.45 });
      this.addCircle(x, z, 0.9);
    }
    const rib = new THREE.ConeGeometry(0.9, 1, 7); rib.translate(0, 0.5, 0);
    this.inst(rib, std('#2a1820', { roughness: 0.6 }), ribs);
    const pods = [];
    for (let i = 0; i < 30; i++) { const a = R() * 6.283, r = 6 + R() * 18; pods.push({ x: P.NEST.x + Math.cos(a) * r, z: P.NEST.z + Math.sin(a) * r, s: 0.5 + R() * 0.9 }); }
    this.podMat = glow('#5a1830', '#ff2d6a', 0.4);
    this.inst(new THREE.SphereGeometry(1, 10, 8), this.podMat, pods);

    // 풀
    const grass = this.scatter(this.low ? 1000 : 3200, (x, z) => (Math.hypot(x + 10, z) < 14 || inLake(x, z) || height(x, z) > 30) ? null :
      { x, z, s: 0.6 + R() * 0.8, ry: R() * 6, rz: (R() - 0.5) * 0.4 });
    this.inst(new THREE.ConeGeometry(0.07, 0.7, 3).translate(0, 0.3, 0), std('#4fae9c'), grass, false);

    // 추락 잔해 금속 조각
    const debris = [];
    for (let i = 0; i < 46; i++) {
      const a = R() * 6.283, r = 9 + R() * 40, x = -12 + Math.cos(a) * r, z = Math.sin(a) * r;
      if (x > -34 && x < 9 && z > -10 && z < 13) continue;
      debris.push({ x, z, s: 1, sx: 0.4 + R() * 1.5, sy: 0.1 + R() * 0.4, sz: 0.4 + R() * 1.4, rx: R(), ry: R() * 6, rz: R() });
    }
    this.inst(new THREE.BoxGeometry(1, 1, 1), std('#a9a4a0', { metalness: 0.5, roughness: 0.5 }), debris);
  }

  // ───────── 우주선 ─────────
  buildShip() {
    const g = new THREE.Group(); this.scene.add(g); this.ship = g;
    const hullM = std('#d9d4cc', { roughness: 0.55, metalness: 0.35 }), darkM = std('#33343d', { roughness: 0.7 }),
      orM = std('#e8742a', { roughness: 0.6 }), blackM = std('#16161b');
    const box = (x0, x1, y0, y1, z0, z1, m = hullM, col = true) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
      mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      mesh.castShadow = mesh.receiveShadow = true; g.add(mesh);
      if (col) this.addBox(x0, x1, z0, z1, y1);
      return mesh;
    };
    // 조종실 (안이 비어 있는 방)
    box(-4.3, 4.3, 0, 0.2, -3.3, 3.3, darkM, false);
    box(-4.3, 4.3, 3, 3.3, -3.3, 3.3, hullM, false);
    box(-4.3, -3.9, 0, 3.3, -3.3, 3.3);
    box(3.9, 4.3, 0, 1.3, -3.3, 3.3); box(3.9, 4.3, 2.5, 3.3, -3.3, 3.3, hullM, false);
    box(3.9, 4.3, 1.3, 2.5, -3.3, -2.2, hullM, false); box(3.9, 4.3, 1.3, 2.5, 2.2, 3.3, hullM, false);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 4.4), new THREE.MeshStandardMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.25, roughness: 0.05 }));
    glass.position.set(4.1, 1.9, 0); g.add(glass);
    box(-4.3, 4.3, 0, 3.3, -3.3, -2.9);
    box(-4.3, -1.2, 0, 3.3, 2.9, 3.3); box(1.2, 4.3, 0, 3.3, 2.9, 3.3); box(-1.2, 1.2, 2.3, 3.3, 2.9, 3.3, hullM, false);
    box(-1.2, 1.2, 0, 0.1, 3.3, 4.6, darkM, false); // 경사로
    // 노즈 콘
    const nose = new THREE.Mesh(new THREE.ConeGeometry(3, 4, 12), hullM);
    nose.rotation.z = -Math.PI / 2; nose.position.set(6.3, 1.6, 0); nose.castShadow = true; g.add(nose);
    this.addBox(4.3, 7.5, -2.4, 2.4, 3);
    // 동체
    const body = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 23.2, 18), hullM);
    body.rotation.z = Math.PI / 2; body.position.set(-15.9, 2.0, 0); body.castShadow = body.receiveShadow = true; g.add(body);
    for (const x of [-7, -18, -25]) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(3.25, 3.25, 0.7, 18), orM);
      st.rotation.z = Math.PI / 2; st.position.set(x, 2.0, 0); g.add(st);
    }
    this.addBox(-27.5, -4.3, -3.2, 3.2, 5.2);
    // 엔진
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.9, 3, 14), darkM);
    eng.rotation.z = Math.PI / 2; eng.position.set(-29, 2, 0); eng.castShadow = true; g.add(eng);
    this.engineGlow = glow('#221', '#ff5a1f', 0, {});
    const noz = new THREE.Mesh(new THREE.CircleGeometry(2.0, 16), this.engineGlow);
    noz.rotation.y = -Math.PI / 2; noz.position.set(-30.55, 2, 0); g.add(noz);
    this.addBox(-31, -27.5, -2.9, 2.9, 5);
    // 부러진 날개(바닥) + 붙어 있는 날개
    const w1 = new THREE.Mesh(new THREE.BoxGeometry(9, 0.35, 4), hullM);
    w1.position.set(-15, 0.4, 9.5); w1.rotation.set(0.08, 0.3, 0.15); w1.castShadow = true; g.add(w1);
    this.addBox(-19.3, -10.7, 7.4, 11.6, 1.4);
    const w2 = new THREE.Mesh(new THREE.BoxGeometry(7, 0.3, 6), hullM);
    w2.position.set(-21.5, 1.6, -6); w2.rotation.set(-0.25, 0, 0); w2.castShadow = true; g.add(w2);
    this.addBox(-25, -18, -9, -3.2, 2.5);
    // 내부
    box(2.1, 2.7, 0.2, 0.75, -1.6, -0.8, darkM, false); box(2.1, 2.7, 0.2, 0.75, 0.8, 1.6, darkM, false);
    box(2.55, 2.7, 0.75, 1.6, -1.6, -0.8, darkM, false); box(2.55, 2.7, 0.75, 1.6, 0.8, 1.6, darkM, false);
    box(3.1, 3.9, 0.2, 1.05, -2.2, 2.2, darkM, false);
    const scr = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 3.4), glow('#111', '#2affd5', 0.15));
    scr.position.set(3.45, 1.25, 0); scr.rotation.z = 0.5; g.add(scr); this.consoleScreen = scr;
    box(-3.9, -3.3, 0.2, 2.6, 1.2, 2.9, darkM, false); // 사물함
    // 조명: 비상등(빨강) / 실내등 / 외부 투광등
    this.alarm = new THREE.PointLight('#ff2a2a', 6, 12, 1.4); this.alarm.position.set(0, 2.7, 0); g.add(this.alarm);
    this.cabin = new THREE.PointLight('#dff4ff', 0, 12, 1.4); this.cabin.position.set(0, 2.7, 0.5); g.add(this.cabin);
    this.flood = new THREE.SpotLight('#fff1d6', 0, 45, 0.9, 0.6, 1.2);
    this.flood.position.set(1, 5.5, 3.5); this.flood.target.position.set(4, 0, 16); g.add(this.flood); g.add(this.flood.target);
    // 연기
    this.smoke = [];
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const cx = cv.getContext('2d'), gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
    this.puff = new THREE.CanvasTexture(cv);
    const smat = new THREE.SpriteMaterial({ map: this.puff, color: '#2a2530', transparent: true, opacity: 0.4, depthWrite: false });
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Sprite(smat.clone()); s.userData.t = i / 26; this.scene.add(s); this.smoke.push(s);
    }
  }

  // ───────── 상호작용 오브젝트 ─────────
  buildEntities() {
    const shared = {
      blade: new THREE.ConeGeometry(0.05, 1, 4).translate(0, 0.5, 0),
      ball: new THREE.SphereGeometry(1, 10, 8),
      box: new THREE.BoxGeometry(1, 1, 1),
      beam: new THREE.CylinderGeometry(0.06, 0.06, 40, 6, 1, true).translate(0, 20, 0),
    };
    this.shared = shared;
    this.M = {
      fiber: std('#3fbf8f'), fiberTip: glow('#bfffd9', '#5dffb0', 0.8),
      moss: glow('#1d6b4a', '#5dffb0', 1.0, { flatShading: true }),
      crystal: glow('#bff4ff', '#3fd0ff', 1.0, { roughness: 0.1, flatShading: true }),
      resin: glow('#ffae3d', '#ff7a00', 0.6, { roughness: 0.2 }), wood: std('#5a3415'),
      chitin: std('#e9e2cf', { roughness: 0.35 }),
      water: glow('#9fe8ff', '#4fc8ff', 1.2, { transparent: true, opacity: 0.8 }),
      battery: std('#f2c230', { roughness: 0.4 }), dark: std('#26262c'), metal: std('#cfd3d8', { metalness: 0.6, roughness: 0.35 }),
      green: glow('#0a2', '#2f6', 1.5), blue: glow('#024', '#3cf', 1.5), red: glow('#200', '#f33', 1.5), orange: std('#e8742a'),
      core: glow('#c14dff', '#b230ff', 2.2), moon: glow('#eaf4ff', '#9fd0ff', 0.2), screen: glow('#111', '#2affd5', 1.0),
    };
    const beamMats = {};
    const beam = color => {
      beamMats[color] ||= new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      return new THREE.Mesh(shared.beam, beamMats[color]);
    };
    for (const e of this.ents) {
      const g = this.makeEnt(e, beam);
      g.position.set(e.x, e.y, e.z);
      this.scene.add(g);
      this.meshes[e.id] = g;
    }
    // 방어등 빛 / 핵 빛 / 조명탄 풀
    this.beaconLight = new THREE.PointLight('#b06bff', 0, 34, 1.1);
    this.beaconLight.position.set(3, 4.5, 15); this.scene.add(this.beaconLight);
    this.coreLight = new THREE.PointLight('#c14dff', 8, 18, 1.4);
    this.scene.add(this.coreLight);
    const ringG = new THREE.RingGeometry(SAFE_R - 0.4, SAFE_R, 96); ringG.rotateX(-Math.PI / 2);
    this.safeRing = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: '#b06bff', transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.safeRing.position.y = 0.15; this.scene.add(this.safeRing);

    // 보급 캡슐 (밤 이벤트)
    const cap = new THREE.Group(); cap.visible = false; this.scene.add(cap); this.capsule = cap;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 1.6, 12), std('#c8ccd2', { metalness: 0.6, roughness: 0.35 })); body.position.y = 0.8; body.castShadow = true; cap.add(body);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.8, 12), std('#e8742a')); cone.position.y = 2.0; cap.add(cone);
    this.capStripe = glow('#331', '#ff9a3d', 2); const st = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.15, 12), this.capStripe); st.position.y = 0.5; cap.add(st);
    const cb = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 120, 8, 1, true).translate(0, 60, 0), new THREE.MeshBasicMaterial({ color: '#ff9a3d', transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    cap.add(cb); this.capBeam = cb;
    this.capLight = new THREE.PointLight('#ff9a3d', 0, 25, 1.2); this.scene.add(this.capLight);
    // 휴대용 UV 랜턴 (최대 3개)
    this.lanternPool = [];
    for (let i = 0; i < 3; i++) {
      const lg = new THREE.Group(); lg.visible = false; this.scene.add(lg);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.4, 6), std('#26262c')); pole.position.y = 0.7; lg.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), glow('#e6ccff', '#b06bff', 3)); head.position.y = 1.5; lg.add(head);
      const rg = new THREE.RingGeometry(8.6, 9, 64); rg.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: '#b06bff', transparent: true, opacity: 0.35, depthWrite: false, fog: false })); ring.position.y = 0.2; lg.add(ring);
      const light = new THREE.PointLight('#b06bff', 0, 16, 1.2); this.scene.add(light);
      this.lanternPool.push({ g: lg, light });
    }
  }

  updateNight(dt, now) {
    const G = this.G, d = G.drop;
    this.capsule.visible = !!d;
    if (d) {
      const fall = Math.max(0, 5 - (now - d.t0)), gy = this.groundAt(d.x, d.z);
      this.capsule.position.set(d.x, gy + fall * fall * 6, d.z);
      this.capsule.rotation.z = fall > 0 ? 0.3 : 0.12;
      this.capBeam.visible = fall <= 0;
      this.capStripe.emissiveIntensity = 1.5 + Math.sin(this.clock * (d.prog > 0 ? 12 : 3)) * 1;
      this.capLight.position.set(d.x, gy + 2 + fall * fall * 6, d.z); this.capLight.intensity = 18;
    } else this.capLight.intensity = 0;
    const ls = (G.lanterns || []).filter(l => l.until > now);
    this.lanternPool.forEach((p, i) => {
      const l = ls[i]; p.g.visible = !!l;
      if (!l) { p.light.intensity = 0; return; }
      const gy = this.groundAt(l.x, l.z), left = l.until - now;
      p.g.position.set(l.x, gy, l.z);
      p.light.position.set(l.x, gy + 1.6, l.z);
      p.light.intensity = (left < 8 && Math.random() < 0.2) ? 2 : 14;
    });
  }

  makeEnt(e, beam) {
    const g = new THREE.Group(), S = this.shared, M = this.M, R = Math.random;
    const mesh = (geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; g.add(m); return m;
    };
    switch (e.kind) {
      case 'moonflower': {
        mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.7, 5).translate(0, 0.35, 0), M.fiber, 0, 0, 0);
        const fl = new THREE.Group(); fl.position.y = 0.72; g.add(fl);
        for (let i = 0; i < 6; i++) {
          const p = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), M.moon); p.scale.set(0.5, 0.15, 1.2);
          p.position.set(Math.cos(i / 6 * 6.283) * 0.12, 0, Math.sin(i / 6 * 6.283) * 0.12); p.rotation.y = -i / 6 * 6.283; fl.add(p);
        }
        g.userData.flower = fl;
        break;
      }
      case 'fiber':
        for (let i = 0; i < 6; i++) { const b = mesh(S.blade, M.fiber, (R() - 0.5) * 0.4, 0, (R() - 0.5) * 0.4, 1, 0.8 + R() * 0.6); b.rotation.set((R() - 0.5) * 0.6, 0, (R() - 0.5) * 0.6); }
        mesh(S.ball, M.fiberTip, 0, 1.05, 0, 0.09);
        break;
      case 'moss':
        for (let i = 0; i < 5; i++) mesh(S.ball, M.moss, (R() - 0.5) * 0.7, 0.1, (R() - 0.5) * 0.7, 0.18 + R() * 0.2, 0.12, 0.18 + R() * 0.2);
        break;
      case 'crystal': {
        const cg = new THREE.CylinderGeometry(0, 0.25, 1, 6).translate(0, 0.5, 0);
        for (let i = 0; i < 4; i++) { const c = mesh(cg, M.crystal, (R() - 0.5) * 0.5, 0, (R() - 0.5) * 0.5, 1, 0.8 + R() * 1.2); c.rotation.set((R() - 0.5) * 0.8, 0, (R() - 0.5) * 0.8); }
        g.userData.crystal = true;
        break;
      }
      case 'resin':
        mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.8, 7), M.wood, 0, 0.4, 0);
        mesh(S.ball, M.resin, 0.15, 0.85, 0, 0.22); mesh(S.ball, M.resin, -0.2, 0.7, 0.1, 0.15);
        break;
      case 'chitin':
        for (let i = 0; i < 3; i++) { const c = mesh(new THREE.SphereGeometry(0.35, 8, 6, 0, Math.PI), M.chitin, (R() - 0.5) * 0.6, 0.05, (R() - 0.5) * 0.6, 1, 0.5, 1.4); c.rotation.set(-Math.PI / 2 + R() * 0.4, R() * 6, 0); }
        break;
      case 'water': {
        const t = mesh(new THREE.TorusGeometry(0.6, 0.06, 8, 24), M.water, 0, 0.05, 0); t.rotation.x = Math.PI / 2;
        mesh(S.ball, M.water, 0, 0.45, 0, 0.12);
        g.userData.spin = t;
        break;
      }
      case 'battery':
        mesh(S.box, M.battery, 0, 0.2, 0, 0.5, 0.35, 0.3); mesh(S.box, M.dark, 0, 0.2, 0, 0.52, 0.08, 0.32);
        g.add(beam('#ffd34d'));
        break;
      case 'navchip':
        mesh(S.box, M.metal, 0, 0.3, 0, 1.4, 0.6, 1); mesh(S.box, M.green, 0, 0.65, 0, 0.35, 0.05, 0.25);
        g.add(beam('#5dff8a'));
        break;
      case 'hull': {
        const m = mesh(S.box, M.metal, 0, 0.5, 0, 2.2, 0.12, 1.5); m.rotation.set(0.5, R() * 3, 0.3);
        mesh(S.box, M.orange, 0, 0.55, 0, 2.25, 0.05, 0.3).rotation.copy(m.rotation);
        g.add(beam('#ffffff'));
        break;
      }
      case 'antenna': {
        mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), M.metal, 0, 1.1, 0);
        const dish = mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, 1.0), M.metal, 0, 2.0, 0, 0.9, 0.5, 0.9);
        dish.rotation.x = 2.2;
        g.add(beam('#7fd4ff'));
        break;
      }
      case 'log':
        mesh(S.box, M.dark, 0, 0.12, 0, 0.35, 0.22, 0.25);
        g.userData.blink = mesh(S.ball, M.blue, 0.1, 0.25, 0.08, 0.04);
        g.add(beam('#5ac8ff'));
        break;
      case 'core': {
        g.position.y = 0;
        const ped = mesh(new THREE.CylinderGeometry(0.9, 1.5, 1.2, 9), std('#2a1820'), 0, -0.6, 0);
        ped.castShadow = false;
        g.userData.orb = mesh(new THREE.IcosahedronGeometry(0.55, 1), M.core, 0, 0.4, 0);
        break;
      }
      case 'phone':
        mesh(S.box, M.dark, 0, 0, 0, 0.09, 0.012, 0.17).rotation.y = 0.6;
        g.userData.blink = mesh(S.box, M.screen, 0, 0.008, 0, 0.08, 0.004, 0.15); g.userData.blink.rotation.y = 0.6;
        break;
      case 'bed':
        mesh(S.box, std('#5b6470'), 0, -0.1, 0, 2.3, 0.25, 0.9); mesh(S.box, std('#c9cdd6'), -0.85, 0.08, 0, 0.45, 0.12, 0.7);
        break;
      case 'lever': {
        const side = e.z > 0 ? 1 : -1;
        mesh(S.box, M.dark, 0, 0, side * 0.1, 0.5, 0.8, 0.2);
        mesh(S.box, M.red, 0, 0.35, side * 0.21, 0.15, 0.05, 0.02);
        const pivot = new THREE.Group(); pivot.position.set(0, 0, side * 0.25); g.add(pivot);
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), M.orange); h.position.y = 0.3; pivot.add(h);
        const k = new THREE.Mesh(S.ball, M.dark); k.scale.setScalar(0.07); k.position.y = 0.6; pivot.add(k);
        pivot.rotation.x = side * 0.5;
        g.userData.pivot = pivot; g.userData.side = side;
        break;
      }
      case 'relay': {
        mesh(new THREE.CylinderGeometry(0.08, 0.12, 2.6, 6), M.metal, 0, 1.3, 0);
        mesh(S.box, M.dark, 0, 1.0, 0.15, 0.5, 0.6, 0.15);
        g.userData.scr = mesh(S.box, glow('#111', '#ff5a3d', 1.2), 0, 1.05, 0.23, 0.4, 0.3, 0.02);
        const dish = mesh(new THREE.SphereGeometry(0.7, 14, 8, 0, Math.PI * 2, 0, 1.1), M.metal, 0, 2.7, 0, 1, 0.5, 1);
        dish.rotation.x = 2.5; g.userData.dish = dish;
        g.userData.lamp = mesh(S.ball, M.red, 0, 3.0, 0, 0.08);
        break;
      }
      case 'pump': {
        mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.6, 12), M.metal, 0, 0.8, 0);
        mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.15, 12), M.orange, 0, 1.2, 0);
        const w = mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 16), M.red, 0, 1.15, 0.7); g.userData.wheel = w;
        mesh(S.box, M.dark, 0, 1.15, 0.6, 0.1, 0.1, 0.25);
        break;
      }
      case 'navst':
        g.userData.scr = mesh(S.box, glow('#111', '#ff5a3d', 1.0), 0, 0, 0, 0.05, 0.35, 0.8);
        break;
      case 'panel':
        mesh(S.box, M.dark, 0, 0, -0.05, 1.2, 0.9, 0.1);
        g.userData.scr = mesh(S.box, M.screen, 0, 0.05, 0.02, 0.9, 0.5, 0.02);
        break;
      case 'workbench':
        mesh(S.box, std('#6f6a66', { metalness: 0.4 }), 0, 0.9, 0, 2.4, 0.12, 1.1);
        for (const [x, z] of [[-1.1, -0.45], [1.1, -0.45], [-1.1, 0.45], [1.1, 0.45]]) mesh(S.box, M.dark, x, 0.45, z, 0.1, 0.9, 0.1);
        mesh(S.box, M.orange, -0.6, 1.05, 0.1, 0.4, 0.2, 0.3); mesh(S.box, M.metal, 0.5, 1.0, -0.1, 0.6, 0.08, 0.4);
        mesh(S.ball, M.green, 1.0, 1.0, 0.3, 0.05);
        this.addBox(e.x - 1.2, e.x + 1.2, e.z - 0.55, e.z + 0.55, 1);
        break;
      case 'beaconSlot': {
        const r = mesh(new THREE.RingGeometry(0.8, 1.1, 24), glow('#b06bff', '#b06bff', 0.8, { side: THREE.DoubleSide }), 0, 0.08, 0);
        r.rotation.x = -Math.PI / 2; g.userData.ringMark = r;
        const lamp = new THREE.Group(); lamp.visible = false; g.add(lamp);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 4, 8), M.dark); pole.position.y = 2; lamp.add(pole);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), glow('#d9b3ff', '#b06bff', 3)); head.position.y = 4.3; lamp.add(head);
        g.userData.lamp = lamp;
        break;
      }
    }
    if (e.kind === 'relay' || e.kind === 'lever') this.addCircle(e.x, e.z, 0.3);
    return g;
  }

  buildSpores() {
    const n = 500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) pos[i] = (Math.random() - 0.5) * 80;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sporeMat = new THREE.PointsMaterial({ map: this.puff, color: '#9fffe0', size: 0.12, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending });
    this.spores = new THREE.Points(geo, this.sporeMat);
    this.spores.frustumCulled = false;
    this.scene.add(this.spores);
  }

  // ───────── 상태 반영 ─────────
  applyState(G, carryIds) {
    for (const e of this.ents) {
      const m = this.meshes[e.id];
      const mv = G.moved[e.id];
      if (mv) m.position.set(mv.x, mv.y, mv.z);
      let vis = !G.taken[e.id];
      if (e.kind === 'beaconSlot') m.userData.ringMark.visible = !G.flags.beaconPlaced;
      m.visible = vis;
    }
    this.meshes.beaconSlot.userData.lamp.visible = !!G.flags.beaconPlaced;
    this.G = G;
  }

  update(dt, t, cam, now, pending, storm = 0) {
    this.clock += dt;
    const k = dayFactor(t), night = 1 - k, G = this.G;
    // 해/달
    const a = Math.PI * Math.min(1, Math.max(0, t / 0.66));
    const sunDir = new THREE.Vector3(Math.cos(a), Math.max(0.08, Math.sin(a)), 0.35).normalize();
    this.skyU.sunDir.value.copy(sunDir);
    const lightDir = k > 0.05 ? sunDir : new THREE.Vector3(-0.4, 0.8, 0.45).normalize();
    this.sun.position.copy(cam).addScaledVector(lightDir, 150);
    this.sun.target.position.copy(cam);
    this.sun.intensity = 0.6 + 2.15 * k;
    this.sun.color.set(k > 0.05 ? '#ffe2c4' : '#8fa8ff').lerp(C('#ff9a6a'), k > 0.05 ? Math.max(0, 1 - Math.sin(a) * 3) * 0.6 : 0);
    this.hemi.intensity = 0.34 + 0.81 * k;
    this.hemi.color.set('#d8c4ff').lerp(C('#3a4a8a'), night);
    this.skyU.top.value.set('#4a2f80').lerp(C('#03030c'), night);
    this.skyU.bot.value.set('#e6a7c9').lerp(C('#141026'), night);
    const dusk = Math.max(0, 1 - Math.abs(t - 0.64) * 18) + Math.max(0, 1 - Math.abs(t - 0.985) * 25);
    this.skyU.bot.value.lerp(C('#ff7a4a'), Math.min(0.7, dusk * 0.7));
    this.skyU.night.value = night;
    this.starMat.opacity = night * 0.9;
    for (const m of this.moons) m.material.opacity = 0.2 + night * 0.8;
    this.planetMat.opacity = 0.75 + night * 0.25;
    this.scene.fog.color.set('#a58bbf').lerp(C('#070611'), night).lerp(C('#ff8a6a'), Math.min(0.4, dusk * 0.4));
    this.scene.fog.density = 0.0035 + night * 0.0065;
    if (storm > 0) { // 포자 폭풍: 누런 녹색 안개로 시야가 막힌다
      this.scene.fog.color.lerp(C(night > 0.5 ? '#1c2214' : '#7d8a55'), storm * 0.85);
      this.scene.fog.density += storm * 0.05;
      this.skyU.top.value.lerp(C('#4c5a38'), storm * 0.8); this.skyU.bot.value.lerp(C('#8a9a5e'), storm * 0.8);
      this.hemi.intensity *= 1 - storm * 0.3; this.sun.intensity *= 1 - storm * 0.6;
    }
    this.skyGroup.position.copy(cam);

    // 발광체: 밤엔 더 밝게
    this.bulbMat.emissiveIntensity = 0.4 + night * 1.6;
    this.capMat.emissiveIntensity = 0.3 + night * 1.4;
    this.podMat.emissiveIntensity = 0.3 + night * 1.2 + (G?.flags.nestAwake ? Math.sin(this.clock * 6) * 0.5 + 0.5 : 0);
    const hot = !isNight(t) && storm < 0.5;
    this.crystalMat.emissive.set(hot ? '#ff6a1a' : '#2fc8ff'); this.crystalMat.emissiveIntensity = hot ? 0.35 + Math.sin(this.clock * 2) * 0.1 : 0.6 + night;
    this.M.crystal.emissive.set(hot ? '#ff5a1a' : '#3fd0ff');
    this.M.moss.emissiveIntensity = 0.8 + night * 2.5;
    this.M.moon.emissiveIntensity = isNight(t) ? 2.2 + Math.sin(this.clock * 2) * 0.4 : 0.1;
    this.sporeMat.opacity = Math.max(0.1 + night * 0.6, storm * 0.85);
    this.sporeMat.size = 0.12 + storm * 0.3;
    this.sporeMat.color.set('#9fffe0').lerp(C('#e2ff9a'), storm);
    this.waterMat.emissiveIntensity = 0.5 + night * 1.5;

    // 포자 입자: 카메라 주변을 감싼다
    const sp = this.spores.geometry.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      let x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
      y += dt * (0.3 - storm * 0.2); x += Math.sin(this.clock * 0.5 + i) * dt * 0.2 + dt * storm * 16; z += dt * storm * 6;
      if (x - cam.x > 40) x -= 80; if (x - cam.x < -40) x += 80;
      if (z - cam.z > 40) z -= 80; if (z - cam.z < -40) z += 80;
      if (y - cam.y > 20) y -= 30; if (y - cam.y < -10) y += 30;
      sp.setXYZ(i, x, y, z);
    }
    sp.needsUpdate = true;

    // 연기
    for (const s of this.smoke) {
      s.userData.t = (s.userData.t + dt * 0.08) % 1;
      const u = s.userData.t;
      s.position.set(-29 + Math.sin(u * 9 + s.id) * 1.5 - u * 6, 3 + u * 26, Math.cos(u * 7 + s.id) * 1.5);
      s.scale.setScalar(2 + u * 9);
      s.material.opacity = (1 - u) * 0.35 * (G?.ended ? 0 : 1);
    }

    if (!G) return;
    const power = !!G.flags.power;
    this.alarm.intensity = power ? 0 : (Math.sin(this.clock * 5) > 0 ? 7 : 0.6);
    this.cabin.intensity = power ? 5 : 0;
    this.flood.intensity = power ? 60 * (0.3 + night) : 0;
    this.consoleScreen.material.emissiveIntensity = power ? 1.2 : 0.15 + (Math.sin(this.clock * 13) > 0.7 ? 0.4 : 0);
    this.engineGlow.emissiveIntensity = G.launch ? 1.5 + Math.sin(this.clock * 20) * 0.5 : 0;
    const be = G.beaconE ?? 1, beacon = G.flags.beaconPlaced && !G.launch && be > 0;
    const flick = be < 0.25 && Math.random() < 0.15 ? 0.2 : 1;
    this.beaconLight.intensity = beacon ? 30 * (0.35 + 0.65 * be) * flick : 0;
    this.safeRing.material.opacity = beacon ? 0.25 + night * 0.3 : 0;
    const core = this.meshes.core1;
    this.coreLight.position.copy(core.position).y += 1;
    this.coreLight.intensity = core.visible ? 8 + Math.sin(this.clock * 3) * 3 : 0;

    for (const e of this.ents) {
      const m = this.meshes[e.id];
      m.visible = !G.taken[e.id] && !(pending[e.id] > performance.now());
      const u = m.userData;
      if (u.flower) u.flower.scale.setScalar(isNight(t) ? 1 : 0.35);
      if (u.spin) u.spin.rotation.z += dt;
      if (u.blink) u.blink.visible = Math.sin(this.clock * 6) > -0.3;
      if (u.orb) { u.orb.rotation.y += dt; u.orb.scale.setScalar(1 + Math.sin(this.clock * 3) * 0.1 + (G.coreProg || 0) * 0.02); }
      if (e.kind === 'lever' || e.kind === 'relay' || e.kind === 'pump' || e.kind === 'navst') {
        const grp = Object.keys(SYNCS).find(g => SYNCS[g].ids.includes(e.id));
        const done = G.flags['sync_' + grp];
        const ts = G.sync[e.id];
        const on = done || (ts !== undefined && now - ts < 1.6);
        if (u.pivot) u.pivot.rotation.x += ((on ? -0.9 : 0.5) * u.side - u.pivot.rotation.x) * Math.min(1, dt * 10);
        if (u.scr) u.scr.material.emissive.set(on ? '#3dff8a' : (power || e.kind === 'relay' ? '#ff5a3d' : '#331'));
        if (u.lamp) u.lamp.material = on ? this.M.green : this.M.red;
        if (u.dish && on) u.dish.rotation.y += dt * 2;
        if (u.wheel && on) u.wheel.rotation.z += dt * 6;
      }
    }
    this.updateNight(dt, now);
  }
}
