// 1인칭(손이 보이는 시점) 조작 + V키 3인칭 전환
import * as THREE from 'three';
import { height, WATER_Y, inLake } from './terrain.js';
import { CARRY } from './data.js';
import { makeAvatar, carryMesh } from './actors.js';

export class Input {
  constructor(dom, touch = false) {
    this.dom = dom; this.touch = touch; this.axis = { x: 0, y: 0 }; this.keys = new Set(); this.hits = new Set();
    this.mdx = 0; this.mdy = 0; this.wheel = 0; this.locked = false; this.everLocked = false;
    const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); };
    addEventListener('keydown', e => {
      // 휴대폰 검색창에 커서가 있어도 Tab/Esc는 게임으로 넘겨 창을 닫을 수 있게
      if (typing()) {
        if (e.code !== 'Tab' && e.code !== 'Escape') return;
        if (document.activeElement?.id === 'chatIn') return;
        document.activeElement.blur();
      }
      if (e.code === 'Tab') e.preventDefault();
      if (!e.repeat) this.hits.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', e => { if (this.locked) { this.mdx += e.movementX; this.mdy += e.movementY; } });
    addEventListener('mousedown', e => { if (this.locked && e.button === 0) this.hits.add('Mouse0'); if (this.locked && e.button === 2) this.hits.add('Mouse2'); });
    addEventListener('contextmenu', e => { if (this.locked) e.preventDefault(); });
    addEventListener('wheel', e => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      if (this.locked) this.everLocked = true;
      this.onLockChange?.(this.locked);
    });
  }
  lock() {
    if (this.touch) { const was = this.locked; this.locked = this.everLocked = true; if (!was) this.onLockChange?.(true); return; }
    try { const p = this.dom.requestPointerLock(); if (p?.catch) p.catch(() => {}); } catch {} }
  unlock() {
    if (this.touch) { if (this.locked) { this.locked = false; this.onLockChange?.(false); } return; }
    if (document.pointerLockElement) document.exitPointerLock();
  }
  // 터치용 가상 키
  vdown(c) { if (!this.keys.has(c)) this.hits.add(c); this.keys.add(c); }
  vup(c) { this.keys.delete(c); }
  vtap(c) { this.hits.add(c); }
  look(dx, dy) { this.mdx += dx; this.mdy += dy; }
  down(c) { return this.keys.has(c); }
  hit(c) { return this.hits.has(c); }
  endFrame() { this.hits.clear(); this.mdx = 0; this.mdy = 0; this.wheel = 0; }
}

const WAKE = 9;

export class Player {
  constructor(camera, world, input, scene) {
    this.camera = camera; this.world = world; this.input = input; this.scene = scene;
    this.pos = new THREE.Vector3(-1.5, 0.2, 0.5); this.vel = new THREE.Vector3();
    this.yaw = Math.PI; this.pitch = 0; this.roll = 0;
    this.eye = 1.62; this.stamina = 1; this.fl = false; this.cr = false; this.sp = false;
    this.onGround = true; this.view = 'fp'; this.locks = new Set(); this.down = false;
    this.wakeT = -1; this.bob = 0; this.reach = 0; this.carry = null; this.phoneUp = false; this.mv = 0;
    this.sens = +(localStorage.getItem('nocturne-sens') || 1);
    this.stepAcc = 0; this.onStep = () => {};
    this.flash = new THREE.SpotLight('#fff4dc', 0, 42, 0.5, 0.45, 1.1);
    camera.add(this.flash); this.flash.position.set(0.25, -0.2, 0);
    camera.add(this.flash.target); this.flash.target.position.set(0, -0.6, -10);
    this.buildHands();
    this.body = null;
  }

  setBody(color, name) {
    if (this.body) this.scene.remove(this.body);
    this.body = makeAvatar(color, name); this.body.userData.label.visible = false;
    this.body.visible = false; this.scene.add(this.body);
  }

  buildHands() {
    this.hScene = new THREE.Scene();
    this.hCam = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.01, 10);
    this.hAmb = new THREE.HemisphereLight('#ffffff', '#443355', 1.2); this.hScene.add(this.hAmb);
    this.hDir = new THREE.DirectionalLight('#ffffff', 1.2); this.hDir.position.set(0.5, 1, 0.6); this.hScene.add(this.hDir);
    this.hRed = new THREE.PointLight('#ff3030', 0, 3, 1); this.hRed.position.set(0, 0.5, 0); this.hScene.add(this.hRed);
    const suit = new THREE.MeshStandardMaterial({ color: '#e8742a', roughness: 0.8 });
    const glove = new THREE.MeshStandardMaterial({ color: '#d8d8dc', roughness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: '#2a2a30', roughness: 0.5 });
    const mkHand = side => {
      const g = new THREE.Group();
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 0.42, 12), suit); sleeve.rotation.x = Math.PI / 2; sleeve.position.z = 0.14; g.add(sleeve);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.05, 12), dark); cuff.rotation.x = Math.PI / 2; cuff.position.z = -0.08; g.add(cuff);
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.045, 0.11), glove); palm.position.z = -0.16; g.add(palm);
      const fing = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.035, 0.08), glove); fing.position.set(0, -0.012, -0.245); fing.rotation.x = 0.35; g.add(fing);
      const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, 0.07), glove); thumb.position.set(-side * 0.058, 0.005, -0.175); thumb.rotation.y = side * 0.5; g.add(thumb);
      this.hScene.add(g); return g;
    };
    this.rHand = mkHand(1); this.lHand = mkHand(-1);
    const torch = new THREE.Group();
    const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.2, 12), dark); tb.rotation.x = Math.PI / 2; torch.add(tb);
    this.lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), new THREE.MeshStandardMaterial({ color: '#555', emissive: '#fff6cc', emissiveIntensity: 0 }));
    this.lens.position.z = -0.101; this.lens.rotation.y = Math.PI; torch.add(this.lens);
    torch.position.set(0, 0.045, -0.2); this.rHand.add(torch); this.torch = torch;
    const phone = new THREE.Group();
    phone.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.01), dark));
    this.phoneScr = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.135), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#29e0ff', emissiveIntensity: 1.2 }));
    this.phoneScr.position.z = 0.006; phone.add(this.phoneScr);
    phone.position.set(0, 0.06, -0.2); phone.rotation.x = -1.1; this.lHand.add(phone); this.phoneMesh = phone;
    this.carryHolder = new THREE.Group(); this.carryHolder.position.set(0, -0.35, -0.75); this.hScene.add(this.carryHolder);
  }

  setCarry(kind) {
    if (this.carryKind === kind) return;
    this.carryKind = kind; this.carryHolder.clear();
    if (kind) { const m = carryMesh(kind); if (kind === 'antenna') m.scale.setScalar(0.6); this.carryHolder.add(m); }
    if (this.body) { this.body.userData.carry.clear(); if (kind) this.body.userData.carry.add(carryMesh(kind)); }
  }

  get locked() { return this.locks.size > 0 || this.down || this.wakeT >= 0; }

  spawn(x, z, yaw = Math.PI) { this.pos.set(x, this.world.groundAt(x, z), z); this.vel.set(0, 0, 0); this.yaw = yaw; this.pitch = 0; }
  startWake() { this.wakeT = 0; this.pitch = 1.2; this.roll = 0.5; }

  forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  update(dt) {
    const I = this.input;
    if (I.hit('KeyV')) { this.view = this.view === 'fp' ? 'tp' : 'fp'; }
    // 시선
    if (!this.down && this.wakeT < 0) {
      this.yaw -= I.mdx * 0.0022 * this.sens;
      this.pitch -= I.mdy * 0.0022 * this.sens;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    }
    // 이동 입력
    let ix = 0, iz = 0;
    const canMove = !this.locked;
    if (canMove) {
      if (I.down('KeyW')) iz += 1; if (I.down('KeyS')) iz -= 1;
      if (I.down('KeyD')) ix += 1; if (I.down('KeyA')) ix -= 1;
      this.cr = I.down('KeyC') || I.down('ControlLeft');
    }
    const heavy = this.carryKind && CARRY[this.carryKind]?.heavy;
    const wet = inLake(this.pos.x, this.pos.z) && this.pos.y < WATER_Y - 0.3;
    const am = Math.min(1, Math.hypot(I.axis.x, I.axis.y));
    if (canMove && am > 0.12) { ix = I.axis.x; iz = I.axis.y; }
    const moving = ix || iz;
    const sprintKey = I.down('ShiftLeft') || (am > 0.93 && I.axis.y > 0.6);
    this.sp = canMove && moving && sprintKey && !heavy && !this.cr && this.stamina > 0.05 && iz > 0;
    let speed = this.cr ? 2.4 : this.sp ? (this.role === 'scout' ? 8.4 : 7.8) : 4.6;
    if (heavy) speed *= 0.65;
    if (wet) speed *= 0.55;
    this.stamina = Math.max(0, Math.min(1, this.stamina + (this.sp ? -dt / (this.role === 'scout' ? 10 : 6) : dt / 9)));
    const f = this.forward(), r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3().addScaledVector(f, iz).addScaledVector(r, ix);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed * (am > 0.12 ? Math.max(0.35, am) : 1));
    const acc = this.onGround ? 12 : 3;
    this.vel.x += (wish.x - this.vel.x) * Math.min(1, acc * dt);
    this.vel.z += (wish.z - this.vel.z) * Math.min(1, acc * dt);
    if (canMove && this.onGround && I.hit('Space') && !this.cr) { this.vel.y = 6.2; this.onGround = false; }
    this.vel.y -= 20 * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.world.collide(this.pos, 0.38);
    let g = this.world.groundAt(this.pos.x, this.pos.z);
    if (wet) g = Math.max(g, WATER_Y - 1.25);
    if (this.pos.y <= g + 0.02 || (this.onGround && this.pos.y - g < 0.5 && this.vel.y <= 0)) { this.pos.y = g; this.vel.y = 0; this.onGround = true; }
    else this.onGround = false;
    this.mv = Math.hypot(this.vel.x, this.vel.z);

    // 발소리
    if (this.onGround && this.mv > 1) { this.stepAcc += this.mv * dt; if (this.stepAcc > (this.sp ? 2.6 : 2.0)) { this.stepAcc = 0; this.onStep(this.sp, this.cr); } }

    // 손전등
    if (!this.down && I.hit('KeyL')) this.fl = !this.fl;
    if (this.down) this.fl = false;
    this.flash.intensity = this.fl ? 70 : 0;
    this.lens.material.emissiveIntensity = this.fl ? 3 : 0;

    // 카메라
    let eyeT = this.cr ? 1.05 : 1.62, pitch = this.pitch, roll = 0;
    if (this.wakeT >= 0) {
      this.wakeT += dt;
      const u = Math.min(1, Math.max(0, (this.wakeT - 5) / 3.5)), s = u * u * (3 - 2 * u);
      eyeT = 0.35 + 1.27 * s;
      pitch = 1.2 * (1 - s) + Math.sin(this.wakeT * 0.7) * 0.15 * (1 - s);
      roll = 0.5 * (1 - s);
      this.yaw += Math.sin(this.wakeT * 0.5) * 0.002 * (1 - s);
      if (this.wakeT >= WAKE) { this.wakeT = -1; this.pitch = 0; }
      this.eye = eyeT;
    } else if (this.down) { eyeT = 0.4; roll = 0.6; pitch = 0.3; }
    this.eye += (eyeT - this.eye) * Math.min(1, dt * 8);
    this.bob += this.mv * dt * 1.9;
    const bobY = this.onGround ? Math.sin(this.bob * 2) * 0.035 * Math.min(1, this.mv / 4) : 0;
    const cam = this.camera;
    cam.rotation.order = 'YXZ';
    if (this.view === 'tp' && this.wakeT < 0) {
      const head = this.pos.clone(); head.y += 1.7;
      const back = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(this.yaw) * Math.cos(pitch));
      const side = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      cam.position.copy(head).addScaledVector(back, 3.6).addScaledVector(side, 0.55);
      const gy = this.world.groundAt(cam.position.x, cam.position.z) + 0.4;
      if (cam.position.y < gy) cam.position.y = gy;
      cam.rotation.set(pitch, this.yaw, 0);
    } else {
      cam.position.set(this.pos.x, this.pos.y + this.eye + bobY, this.pos.z);
      cam.rotation.set(pitch, this.yaw, roll);
    }
    if (this.body) {
      this.body.visible = this.view === 'tp';
      this.body.position.copy(this.pos); this.body.rotation.y = this.yaw;
      this.body.rotation.x = this.down ? -Math.PI / 2 * 0.95 : 0;
      const u = this.body.userData; u.phase += dt * this.mv * 2.2;
      const sw = Math.sin(u.phase) * Math.min(1, this.mv / 4) * 0.7;
      u.legs[0].rotation.x = sw; u.legs[1].rotation.x = -sw; u.arms[0].rotation.x = -sw * 0.8; u.arms[1].rotation.x = sw * 0.8;
      if (this.carryKind) u.arms[0].rotation.x = u.arms[1].rotation.x = -1.3;
    }

    // 손 애니메이션
    this.reach = Math.max(0, this.reach - dt * 4);
    const t = performance.now() / 1000, sway = Math.sin(this.bob) * 0.012 * Math.min(1, this.mv / 4);
    const idle = Math.sin(t * 1.3) * 0.004;
    const r1 = this.reach > 0 ? Math.sin(Math.min(1, this.reach) * Math.PI) : 0;
    const hide = this.wakeT >= 0 && this.wakeT < 6 ? 1 : 0;
    this.rHand.position.set(0.27 + sway, -0.33 + idle - bobY * 0.4 - hide + (this.fl ? 0.03 : 0) - (this.carryKind ? 0.08 : 0), -0.62 - r1 * 0.15);
    this.rHand.rotation.set(this.fl ? 0.08 : 0.15 + r1 * 0.2, 0.06, 0);
    this.torch.visible = this.fl;
    const phoneY = this.phoneUp ? -0.17 : -0.35;
    this.lHand.position.set(-0.27 + sway, phoneY + idle - bobY * 0.4 - hide - (this.carryKind ? 0.08 : 0), this.phoneUp ? -0.55 : -0.64);
    this.lHand.rotation.set(this.phoneUp ? 0.5 : 0.15, -0.06, this.phoneUp ? -0.2 : 0);
    this.phoneMesh.visible = this.phoneUp;
    this.hRed.intensity = this.down ? 2 : 0;
  }

  syncHandLight(hemi) {
    this.hAmb.intensity = Math.max(0.35, hemi.intensity * 1.1) + (this.fl ? 0.4 : 0);
    this.hAmb.color.copy(hemi.color);
    this.hDir.intensity = Math.max(0.2, hemi.intensity);
  }

  renderHands(renderer) {
    if (this.view !== 'fp') return;
    this.hCam.aspect = this.camera.aspect; this.hCam.updateProjectionMatrix();
    renderer.autoClear = false; renderer.clearDepth();
    renderer.render(this.hScene, this.hCam);
    renderer.autoClear = true;
  }
}
