// 진입점: 메뉴/로비/네트워크/게임 루프 연결
import * as THREE from 'three';
import { genEntities, ITEMS, PICK, CARRY, MISSIONS } from './data.js';
import { Host, isNight, hasSave, CORE_NEED, stormOn } from './host.js';
import { Net, makeCode } from './net.js';
import { World, dayFactor } from './world.js';
import { Actors } from './actors.js';
import { Player, Input } from './player.js';
import { UI } from './ui.js';
import { Sfx } from './audio.js';
import { Q, TIER, TIER_NAME, QUALITY_PREF, saveQualityPref } from './quality.js';
import { IS_TOUCH, IS_IOS, IS_STANDALONE, CAN_FULLSCREEN, setupTouch, goFullscreen, toggleFullscreen, isFullscreen } from './touch.js';

const $ = s => document.querySelector(s);

// ───────── 렌더러/씬 ─────────
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.aa, powerPreference: 'high-performance' });
// 해상도 배율: 프레임이 떨어지면 자동으로 낮추고, 여유 있으면 다시 올린다
let dpr = Math.min(devicePixelRatio, Q.dprMax);
renderer.setPixelRatio(dpr);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = Q.shadows; // 폰(낮음·보통)에서는 그림자 맵 대신 발밑 그림자
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, Q.far);
scene.add(camera);
// 폰이 세로로 인식되면(회전 잠금·아이폰) 게임을 90° 돌려 항상 가로로 플레이
function fitView() {
  const force = IS_TOUCH && (game?.mode === 'play' || game?.mode === 'ended') && innerHeight > innerWidth;
  document.body.classList.toggle('force-land', force);
  const W = force ? innerHeight : innerWidth, H = force ? innerWidth : innerHeight;
  document.body.style.width = force ? W + 'px' : ''; document.body.style.height = force ? H + 'px' : '';
  renderer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix();
  world.viewScale = H * dpr / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}
addEventListener('resize', () => fitView());
addEventListener('orientationchange', () => setTimeout(fitView, 200));

const ents = genEntities();
const byId = Object.fromEntries(ents.map(e => [e.id, e]));
const world = new World(scene, ents, { low: IS_TOUCH });
const input = new Input(canvas, IS_TOUCH);
const player = new Player(camera, world, input, scene);
const actors = new Actors(scene);
const audio = new Sfx();
const net = new Net();

const game = {
  G: null, myId: 'solo', log: [], snap: null, snapAt: 0, mode: 'menu', room: null, host: null,
  ents, byId, player, input, audio, pending: {}, pings: [],
  role() { return this.G?.players[this.myId]?.role || 'engineer'; },
  playerCount() { return this.G ? Object.keys(this.G.players).length : 1; },
  hostNow() { return this.snap ? this.snap.now + (performance.now() - this.snapAt) / 1000 : 0; },
  time() { return this.snap ? this.snap.time : (this.G?.time ?? 0.63); },
  req(a) { if (this.host) this.host.handle(this.myId, a); else net.sendHost({ t: 'act', a }); },
  nearWorkbench() { const w = byId.workbench; return Math.hypot(player.pos.x - w.x, player.pos.z - w.z) < 5.5; },
  inviteLink() { return this.room ? location.origin + location.pathname + '?room=' + this.room : ''; },
};
const ui = new UI(game);
window.__nocturne = { game, ui, world, actors, renderer }; // 디버그용
player.onStep = sp => audio.step(sp);

// ───────── 메시지 처리 (호스트 로컬 + 네트워크 공통) ─────────
function hostOut(m) {
  onMsg(m);
  if (net.isHost) net.broadcast(m);
}

function onMsg(m) {
  switch (m.t) {
    case 'welcome':
      game.myId = m.id; game.log = m.log || [];
      applyState(m.G);
      break;
    case 'full': showErr('방이 가득 찼어요 (최대 4명).'); break;
    case 's': applyState(m.G); break;
    case 'k':
      game.snap = m; game.snapAt = performance.now();
      if (game.G && m.be !== undefined) game.G.beaconE = m.be;
      actors.syncAliens(m.a);
      for (const id in actors.aliens) {
        const u = actors.aliens[id].userData;
        if (u.st === 1 && u.prevSt !== 1 && game.mode === 'play') {
          const d = Math.hypot(actors.aliens[id].position.x - player.pos.x, actors.aliens[id].position.z - player.pos.z);
          if (d < 70) audio.screech(1 - d / 70);
        }
        u.prevSt = u.st;
      }
      break;
    case 'm':
      if (m.to && m.to !== game.myId) return;
      if (!m.to) game.log.push(m);
      if (game.mode === 'play') { ui.toast(m.from, m.text); if (m.from !== 'SYS') audio.msg(); }
      break;
    case 'fx': onFx(m); break;
  }
}

function onFx(m) {
  switch (m.k) {
    case 'obj': audio.objective(); buzz(20); break;
    case 'mission': audio.mission(); buzz([30, 60, 30]); break;
    case 'pick': if (m.pid === game.myId) { audio.pick(); buzz(12); } break;
    case 'craft': audio.craft(); break;
    case 'sync': audio.lever(); break;
    case 'power': audio.power(); break;
    case 'beacon': audio.power(); break;
    case 'flare': audio.flare(); break;
    case 'hit': audio.hit(); if (m.pid === game.myId) { player.shake = 1; buzz([60, 40, 90]); } break;
    case 'launch': audio.alarm(); setTimeout(() => audio.alarm(), 700); player.shake = 0.8; buzz(200); break;
    case 'sleep': fadeBlink(2200); break;
    case 'scream': {
      const d = Math.hypot(m.x - player.pos.x, m.z - player.pos.z);
      if (game.mode === 'play' && d < 140) { audio.scream(Math.max(0.15, 1 - d / 140)); if (d < 70) { ui.banner('울보의 비명!', '주변 개체가 몰려온다 — 숨거나 뛰어요'); player.shake = 0.5; buzz(120); } }
      break;
    }
    case 'whimper': audio.whimper(); break;
    case 'stormWarn': audio.stormWarn(); ui.banner('☣ 포자 폭풍 접근', '15초 뒤 시야가 막힙니다'); break;
    case 'drop': {
      audio.stormWarn();
      const d = Math.round(Math.hypot(m.x - player.pos.x, m.z - player.pos.z));
      if (game.mode === 'play') ui.banner('📦 보급 캡슐 낙하!', `약 ${d}m 떨어진 곳 — 나침반의 📦를 따라가요`);
      break;
    }
    case 'lantern': audio.power(); break;
    case 'ping': {
      const pl = game.G?.players[m.pid]; if (!pl) break;
      game.pings = game.pings.filter(p => p.pid !== m.pid);
      game.pings.push({ pid: m.pid, x: m.x, z: m.z, color: pl.color, name: pl.name, until: performance.now() + 12000 });
      audio.tone(1500, 0.08, 'sine', 0.08); audio.tone(1900, 0.1, 'sine', 0.06, null, 0.08);
      break;
    }
  }
}

let lastResp = 0, endShown = false;
function applyState(G) {
  const prev = game.G;
  game.G = G;
  if (game.mode === 'lobby') renderLobby();
  if (G.started && (game.mode === 'lobby' || game.mode === 'joining')) enterGame();
  if (game.mode !== 'play') return;
  const me = G.players[game.myId];
  if (me) {
    if (me.down && !player.down) { player.down = true; ui.togglePhone(false); ui.closeTuner(); }
    if (!me.down) player.down = false;
    if (me.resp > lastResp) {
      lastResp = me.resp;
      fadeBlink(1500);
      const idx = Object.keys(G.players).indexOf(game.myId);
      setTimeout(() => { player.spawn(-1.2 + idx * 0.8, 0.6, Math.PI); player.wakeT = 4.5; }, 600);
    }
  }
  player.role = me?.role;
  const c = G.carry[game.myId];
  player.setCarry(c ? byId[c].kind : null);
  if (prev && prev.mission !== G.mission && MISSIONS[G.mission]) ui.banner(MISSIONS[G.mission].title, `미션 ${G.mission + 1} / ${MISSIONS.length}`);
  ui.onState(G);
  world.applyState(G);
  actors.syncPlayers(G, game.snap, game.myId);
  if (G.ended && !endShown) {
    endShown = true;
    fadeBlink(900);
    setTimeout(() => {
      game.mode = 'ended'; cutT = 0; input.unlock(); ui.togglePhone(false); ui.closeTuner(); cine(12);
      $('#hud').classList.add('hidden'); $('#danger').style.opacity = 0; document.body.classList.remove('playing');
      for (const a of Object.values(actors.players)) a.visible = false;
      if (player.body) player.body.visible = false;
    }, 700);
    setTimeout(() => { $('#fade').style.background = '#fff'; $('#fade').style.opacity = 1; }, 8200);
    setTimeout(() => { ui.showEnding(G, game.log); $('#fade').style.opacity = 0; }, 10000);
  }
}

function fadeBlink(ms) {
  const f = $('#fade'); f.style.background = '#000'; f.style.opacity = 1;
  setTimeout(() => { f.style.opacity = 0; }, ms);
}

// ───────── 게임 진입 ─────────
function enterGame() {
  const G = game.G, me = G.players[game.myId];
  if (!me) return;
  game.mode = 'play';
  $('#menu').style.display = 'none';
  $('#hud').classList.remove('hidden');
  document.body.classList.add('playing');
  fitView();
  player.setBody(me.color, me.name);
  const idx = Object.keys(G.players).indexOf(game.myId);
  lastResp = me.resp;
  if (!G.flags.phone) {
    player.spawn(-1.2 + idx * 0.8, 0.6, Math.PI);
    player.startWake();
    cine(9);
    $('#lids').style.display = 'block';
    audio.alarm(); setTimeout(() => audio.alarm(), 1200); setTimeout(() => audio.alarm(), 2400);
  } else {
    player.spawn(1 + idx * 1.2, 7.5, Math.PI);
    fadeBlink(800);
  }
  for (const m of game.log.slice(-4)) ui.toast(m.from, m.text);
  ui.onState(G); world.applyState(G);
  input.lock();
}

// ───────── 상호작용 ─────────
const activeObj = (mid, oid) => { const G = game.G; return MISSIONS[G.mission]?.id === mid && G.os[mid + '.' + oid] && !G.od[mid + '.' + oid]; };
const take = e => {
  game.req({ a: 'take', id: e.id }); player.reach = 1;
  if (e.kind !== 'water' && !(e.kind === 'crystal' && !isNight(game.time()))) game.pending[e.id] = performance.now() + 1500;
};
const use = e => () => { game.req({ a: 'use', id: e.id }); player.reach = 1; };
const sync = e => () => { game.req({ a: 'sync', id: e.id }); player.reach = 1; };

function info(e) {
  const G = game.G, k = e.kind;
  if (k === 'player') return { text: `<kbd>E</kbd> 길게 — ${e.name} 일으키기`, hold: game.role() === 'medic' ? 0.8 : 2.5, act: () => game.req({ a: 'revive', pid: e.pid }) };
  if (k === 'core') {
    if (G.flags.coreOut) return G.carry[game.myId] ? { text: '이미 무언가를 들고 있다', dis: true } : { text: '<kbd>E</kbd> 들기 — 둥지 핵 (빛이 그것들을 끌어당긴다)', hold: 0.5, act: () => take(e) };
    if (activeObj('nest', 'extract')) return { text: `<kbd>E</kbd> 계속 누르기 — 둥지 핵 추출 ${Math.floor((game.snap?.cp ?? G.coreProg) / CORE_NEED * 100)}%`, cont: 'core' };
    return { text: '둥지 핵 — 단단히 박혀 있다', dis: true };
  }
  if (k === 'capsule') return { text: `<kbd>E</kbd> 계속 누르기 — 보급 캡슐 열기 ${Math.floor((G.drop?.prog || 0) * 100)}% (소리가 큼!)`, cont: 'capsule' };
  if (k === 'moonflower' && !isNight(game.time())) return { text: '월광화 봉오리 — 밤에만 핀다', dis: true };
  if (PICK[k]) {
    if (k === 'crystal' && !isNight(game.time()) && !stormOn(G)) return { text: '공명 결정 — 햇빛에 과열됨 (밤에만 채굴)', dis: true };
    if (CARRY[k] && G.carry[game.myId]) return { text: '이미 무언가를 들고 있다', dis: true };
    if (k === 'antenna' && !activeObj('comms', 'ant')) return { text: '통신 안테나 — 아직 옮길 때가 아니다', dis: true };
    return { text: `<kbd>E</kbd> ${PICK[k].verb} — ${ITEMS[k].name}${CARRY[k]?.heavy ? ' (무거움)' : ''}`, hold: PICK[k].t * (game.role() === 'engineer' ? 0.55 : 1), act: () => take(e) };
  }
  switch (k) {
    case 'panel': return { text: '<kbd>E</kbd> 조사 — 수리 패널', instant: true, act: use(e) };
    case 'bed': return { text: '<kbd>E</kbd> 휴식 — 해질녘까지 자기 (전원 조종실 안)', instant: true, act: use(e) };
    case 'beaconSlot':
      if (G.flags.beaconPlaced) {
        if (G.launch || (G.beaconE ?? 1) >= 0.999) return null;
        return { text: `<kbd>E</kbd> 계속 누르기 — 방어등 발전기 돌리기 ${Math.floor((G.beaconE ?? 1) * 100)}%`, cont: 'crank' };
      }
      return G.inv.beacon ? { text: '<kbd>E</kbd> 설치 — UV 방어등', instant: true, act: use(e) } : { text: 'UV 방어등 설치 지점 (제작 필요)', dis: true };
    case 'lever': return { text: '<kbd>E</kbd> 당기기 — 비상 레버', instant: true, act: sync(e) };
    case 'pump': return { text: '<kbd>E</kbd> 가동 — 연료 펌프', instant: true, act: sync(e) };
    case 'navst': return { text: '<kbd>E</kbd> 가동 — 항법 콘솔', instant: true, act: sync(e) };
    case 'relay':
      if (!activeObj('comms', 'tune')) return { text: '중계기 — 안테나 신호 없음', dis: true };
      return { text: '<kbd>E</kbd> 튜닝 — 중계기', instant: true, act: () => ui.openTuner(e.id) };
    case 'workbench': return { text: '<kbd>E</kbd> 사용 — 제작대', instant: true, act: () => ui.togglePhone(true, 'craft') };
  }
  return null;
}

let target = null, holdP = 0, holdKind = null;
function findTarget() {
  const G = game.G, now = performance.now();
  const eye = new THREE.Vector3(player.pos.x, player.pos.y + player.eye, player.pos.z);
  const dir = new THREE.Vector3(-Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.yaw) * Math.cos(player.pitch));
  let best = null, bs = -1;
  const consider = (o, x, y, z, reach) => {
    const dx = x - eye.x, dy = y - eye.y, dz = z - eye.z, d = Math.hypot(dx, dy, dz);
    if (d > reach || d < 0.01) return;
    const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / d;
    const need = d < 1.2 ? 0.55 : 0.82;
    if (dot < need) return;
    const s = dot - d * 0.03;
    if (s > bs) { bs = s; best = o; }
  };
  for (const e of ents) {
    if (G.taken[e.id] || game.pending[e.id] > now) continue;
    const p = G.moved[e.id] || e;
    const big = e.kind === 'antenna' || e.kind === 'hull' || e.kind === 'core' || e.kind === 'workbench' || e.kind === 'relay' || e.kind === 'pump';
    const yo = { relay: 1.0, pump: 1.0, workbench: 0.9, antenna: 1.2, beaconSlot: 0.1 }[e.kind] ?? 0.2;
    consider(e, p.x, p.y + yo, p.z, big ? 4.5 : 3.2);
  }
  if (G.drop && game.hostNow() - G.drop.t0 >= 5) consider({ kind: 'capsule', id: 'capsule' }, G.drop.x, world.groundAt(G.drop.x, G.drop.z) + 0.8, G.drop.z, 3.6);
  const snap = game.snap?.p || {};
  for (const id in G.players) {
    if (id === game.myId || !G.players[id].down || !snap[id]) continue;
    consider({ kind: 'player', pid: id, name: G.players[id].name }, snap[id][0], snap[id][1] + 0.3, snap[id][2], 3.5);
  }
  return best;
}

function interact(dt) {
  holdKind = null;
  if (player.locked || ui.phoneOpen) { ui.setPrompt(player.down ? downText() : ''); holdP = 0; return; }
  const t = findTarget();
  const sameT = t && target && (t.id ? t.id === target.id : t.pid === target.pid);
  if (!sameT) holdP = 0;
  target = t;
  const inf = t ? info(t) : null;
  if (!inf) { ui.setPrompt(''); return; }
  if (inf.dis) { ui.setPrompt(inf.text, 0, true); return; }
  if (inf.instant) { if (input.hit('KeyE')) inf.act(); ui.setPrompt(inf.text); return; }
  if (inf.cont) {
    const on = input.down('KeyE');
    if (on) { holdKind = inf.cont; player.reach = Math.max(player.reach, 0.5); }
    const prog = inf.cont === 'core' ? (game.snap?.cp ?? 0) / CORE_NEED : inf.cont === 'capsule' ? (game.G.drop?.prog || 0) : (game.G.beaconE ?? 1);
    ui.setPrompt(inf.text, on ? prog : 0); return;
  }
  if (input.down('KeyE')) {
    holdP += dt;
    if (holdP >= inf.hold) { inf.act(); holdP = 0; }
  } else holdP = 0;
  ui.setPrompt(inf.text, holdP / inf.hold);
}

function downText() {
  const G = game.G, me = G.players[game.myId];
  const solo = Object.keys(G.players).length === 1;
  if (solo) return '정신이 아득해진다…';
  const left = Math.max(0, Math.ceil(25 - (game.hostNow() - me.downAt)));
  return `쓰러짐 — 동료가 일으켜 주길 기다리는 중 (${left}초 후 함선에서 깨어남)`;
}

// ───────── 채팅 ─────────
const chatIn = $('#chatIn');
let chatOpen = false;
function openChat() { chatOpen = true; chatIn.style.display = 'block'; chatIn.value = ''; chatIn.focus(); player.locks.add('chat'); }
function closeChat() { chatOpen = false; chatIn.style.display = 'none'; chatIn.blur(); player.locks.delete('chat'); }
chatIn.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') { const t = chatIn.value.trim(); if (t) game.req({ a: 'chat', text: t }); closeChat(); }
  if (e.key === 'Escape') closeChat();
});

// ───────── 루프 ─────────
let posAcc = 0, menuT = 0, last = performance.now();
const tmpV = new THREE.Vector3();
function playFrame(dt) {
  const G = game.G;
  if (!chatOpen) {
    if (input.hit('Tab') && !ui.tuner && !player.down) ui.togglePhone();
    else if (input.hit('Escape') && ui.phoneOpen) ui.togglePhone(false);
    if (input.hit('Enter') && !ui.tuner) openChat();
    if ((input.hit('KeyQ') || input.hit('Mouse2')) && !player.locked) ping();
    if (input.hit('KeyG') && !player.locked && (G.inv.lantern || 0) > 0) { game.req({ a: 'lantern', x: player.pos.x, z: player.pos.z }); player.reach = 1; }
    if (input.hit('KeyF') && !player.locked && (G.inv.flare || 0) > 0) {
      const f = player.forward();
      game.req({ a: 'flare', x: player.pos.x + f.x * 7, z: player.pos.z + f.z * 7 });
      player.reach = 1;
    }
  }
  player.update(dt);
  interact(dt);

  const pm = { t: 'p', x: player.pos.x, y: player.pos.y, z: player.pos.z, ry: player.yaw, rx: player.pitch, fl: player.fl, sp: player.sp, cr: player.cr, mv: player.mv, hold: holdKind };
  if (game.host) game.host.pos[game.myId] = pm;
  posAcc += dt;
  if (posAcc > 1 / 15) { posAcc = 0; if (!game.host) net.sendHost(pm); }

  const t = game.time();
  const storm = game.snap?.sk || 0;
  world.update(dt, t, tmpV.copy(player.pos), game.hostNow(), game.pending, storm);
  actors.syncPlayers(G, game.snap, game.myId);
  actors.update(dt, G, player.pos, game.hostNow());
  player.syncHandLight(world.hemi);
  updatePings();
  ui.frame(dt);

  const night = 1 - dayFactor(t);
  const danger = actors.chasing > 0 ? Math.max(0, 1 - actors.alienNear / 40) : 0;
  audio.ambient(dt, night, danger, storm);
  $('#danger').style.opacity = player.down ? 0.9 : danger * 0.55;
  // 깨어나는 연출: 눈꺼풀 + 흐림
  if (player.wakeT >= 0) {
    const w = player.wakeT;
    const open = w < 1 ? 0 : w < 1.6 ? (w - 1) / 0.6 * 0.4 : w < 2.2 ? 0.4 - (w - 1.6) / 0.6 * 0.4 : w < 3.4 ? (w - 2.2) / 1.2 * 0.7 : w < 3.8 ? 0.7 - (w - 3.4) * 0.5 : Math.min(1, 0.5 + (w - 3.8) * 0.4);
    $('#lids').style.display = 'block';
    $('#lids .top').style.transform = `translateY(${-open * 100}%)`;
    $('#lids .bot').style.transform = `translateY(${open * 100}%)`;
    canvas.style.filter = `blur(${Math.max(0, 6 - w * 0.8)}px)`;
  } else if ($('#lids').style.display !== 'none') { $('#lids').style.display = 'none'; canvas.style.filter = ''; }
  $('#clickHint').style.display = !IS_TOUCH && !input.locked && !input.everLocked && !ui.phoneOpen ? 'block' : 'none';
}

// 핑: 바라보는 지형 지점을 팀에게 표시
function ping() {
  const o = camera.position, d = new THREE.Vector3(); camera.getWorldDirection(d);
  let x = o.x + d.x * 60, z = o.z + d.z * 60;
  for (let t = 2; t < 150; t += 1) {
    const px = o.x + d.x * t, py = o.y + d.y * t, pz = o.z + d.z * t;
    if (py <= world.groundAt(px, pz)) { x = px; z = pz; break; }
  }
  game.req({ a: 'ping', x, z });
}
const pingBeams = Array.from({ length: 4 }, () => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 60, 8, 1, true).translate(0, 30, 0),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  m.visible = false; scene.add(m); return m;
});
function updatePings() {
  const now = performance.now();
  game.pings = game.pings.filter(p => p.until > now);
  pingBeams.forEach((b, i) => {
    const p = game.pings[i];
    b.visible = !!p;
    if (!p) return;
    b.position.set(p.x, world.groundAt(p.x, p.z), p.z);
    b.material.color.set(p.color);
    b.material.opacity = 0.25 + 0.25 * Math.abs(Math.sin(now / 250));
  });
}

// 이륙 컷신: 함선 밖에서 아르카디아 7호가 떠오르는 장면
let cutT = -1;
function cutFrame(dt) {
  cutT += dt;
  const ship = world.ship, k = Math.max(0, cutT - 1.2);
  ship.position.y = k * k * 1.6;
  ship.position.x = k * k * 0.8;
  ship.rotation.z = Math.min(0.5, k * 0.08);
  world.engineGlow.emissiveIntensity = 2 + Math.random();
  camera.position.set(28 - cutT * 0.8, 3 + cutT * 0.6, 34);
  camera.lookAt(ship.position.x - 10, ship.position.y + 3, 0);
  if (cutT < 8 && Math.random() < dt * 3) audio.noise(0.6, 0.35, 120, 0.8, 'lowpass', false);
  world.update(dt, 0.8, camera.position, game.hostNow(), game.pending);
  world.engineGlow.emissiveIntensity = 3;
  actors.update(dt, game.G, null, game.hostNow());
}

function menuFrame(dt) {
  menuT += dt;
  camera.position.set(-10 + Math.cos(menuT * 0.04) * 42, 12 + Math.sin(menuT * 0.07) * 3, Math.sin(menuT * 0.04) * 42);
  camera.lookAt(-10, 3, 0);
  world.update(dt, 0.635, camera.position, 0, {});
}

let fpsN = 0, fpsT = 0, fps = 60, dprCool = 0, slowSec = 0;
function adaptResolution(rawDt) {
  fpsN++; fpsT += rawDt; dprCool -= rawDt;
  if (fpsT < 1) return;
  fps = fpsN / fpsT; fpsN = 0; fpsT = 0;
  if (game.mode !== 'play' || dprCool > 0) return;
  let next = dpr;
  if (fps < 40 && dpr > Q.dprMin) next = Math.max(Q.dprMin, dpr - 0.1);
  else if (fps > 57 && dpr < Math.min(devicePixelRatio, Q.dprMax)) next = Math.min(devicePixelRatio, Q.dprMax, dpr + 0.05);
  if (next !== dpr) { dpr = next; renderer.setPixelRatio(dpr); fitView(); dprCool = 2.5; }
  // 해상도를 최저로 낮춰도 버벅이면 품질 단계를 낮추라고 한 번 안내
  slowSec = dpr <= Q.dprMin && fps < 32 ? slowSec + 1 : 0;
  if (slowSec >= 6 && TIER !== 'low' && !adaptResolution.told) {
    adaptResolution.told = true;
    ui.toast('SYS', `화면이 버벅여요. 일시정지(${IS_TOUCH ? '☰' : 'Esc'}) → 그래픽 품질을 한 단계 낮추면 부드러워져요.`);
  }
}
function buzz(p) { if (IS_TOUCH && settings.vibe) try { navigator.vibrate?.(p); } catch {} }
function cine(sec) { document.body.classList.add('cine'); clearTimeout(cine.t); cine.t = setTimeout(() => document.body.classList.remove('cine'), sec * 1000); }

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now(), raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now;
  adaptResolution(raw);
  step(dt);
}
window.__nocturne.step = step;
function step(dt) {
  if (game.mode === 'ended' && cutT >= 0) cutFrame(dt);
  if (game.mode === 'play') playFrame(dt);
  else if (game.mode !== 'ended') menuFrame(dt);
  renderer.render(scene, camera);
  if (game.mode === 'play') player.renderHands(renderer);
  input.endFrame();
}
requestAnimationFrame(frame);

// 호스트 시뮬레이션은 탭이 가려져도 돌도록 setInterval
let hostLast = performance.now();
setInterval(() => { const n = performance.now(), dt = Math.min(1, (n - hostLast) / 1000); hostLast = n; game.host?.tick(dt); }, 50);

// ───────── 포인터 잠금/일시정지 ─────────
if (IS_TOUCH) setupTouch(input, {
  phone: () => { if (game.mode === 'play' && !ui.tuner && !player.down) ui.togglePhone(); },
  chat: () => { if (game.mode === 'play' && !chatOpen) openChat(); },
  pause: () => { if (game.mode === 'play') { input.unlock(); showPause(); } },
  fs: () => toggleFullscreen(),
});
for (const id of ['#soloBtn', '#hostBtn', '#startBtn']) $(id).addEventListener('click', goFullscreen);
document.addEventListener('click', e => { if (e.target.id === 'joinBtn') goFullscreen(); });
canvas.addEventListener('click', () => { audio.init(); if (game.mode === 'play' && !input.locked && !ui.phoneOpen) input.lock(); });
input.onLockChange = locked => {
  if (locked) { $('#pause').classList.remove('show'); return; }
  if (ui.tuner) ui.closeTuner();
  if (game.mode === 'play' && !ui.phoneOpen && !chatOpen && input.everLocked) showPause();
};
const settings = { vibe: true, btn: 1 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('nocturne-settings') || '{}')); } catch {}
const saveSettings = () => { try { localStorage.setItem('nocturne-settings', JSON.stringify(settings)); } catch {} };
const applyBtnSize = () => document.documentElement.style.setProperty('--tb', settings.btn);
applyBtnSize();
$('#qSel').value = QUALITY_PREF;
$('#qSel').addEventListener('change', e => { saveQualityPref(e.target.value); $('#qNote').textContent = '새로고침하면 적용돼요 (진행 상황은 자동 저장)'; });
$('#bSize').value = String(settings.btn);
$('#bSize').addEventListener('change', e => { settings.btn = +e.target.value; applyBtnSize(); saveSettings(); });
$('#vibe').checked = settings.vibe;
$('#vibe').addEventListener('change', e => { settings.vibe = e.target.checked; saveSettings(); if (settings.vibe) buzz(30); });
function showPause() {
  $('#qInfo').textContent = `현재 그래픽: ${TIER_NAME[TIER]}${QUALITY_PREF === 'auto' ? ' (자동)' : ''} · 해상도 ${dpr.toFixed(2)}x · ${Math.round(fps)} FPS`;
  const link = game.inviteLink();
  $('#inviteBox').innerHTML = link ? `<div class="hint">초대 링크 — 친구가 열면 바로 합류해요 (최대 4명) · 방 코드 <b>${game.room}</b></div><div class="link"><input readonly value="${link}"><button id="copyLink2">복사</button></div>` : '<div class="hint">혼자 플레이 중 · 저장은 30초마다 자동</div>';
  $('#copyLink2')?.addEventListener('click', () => copy(link, '#copyLink2'));
  $('#pause').classList.add('show');
}
// 전체화면: 안드로이드/PC는 버튼, 아이폰은 "홈 화면에 추가" 안내
if (CAN_FULLSCREEN && !IS_STANDALONE) document.body.classList.add('can-fs');
if (IS_IOS && !IS_STANDALONE && !CAN_FULLSCREEN) document.body.classList.add('ios-tip');
const fsLabel = () => { const on = isFullscreen(); $('#fsBtn').textContent = on ? '⛶ 전체화면 끄기' : '⛶ 전체화면으로 하기'; $('#fsBtn2').textContent = on ? '⛶ 전체화면 끄기' : '⛶ 전체화면'; };
$('#fsBtn').addEventListener('click', () => toggleFullscreen());
$('#fsBtn2').addEventListener('click', () => toggleFullscreen());
document.addEventListener('fullscreenchange', fsLabel); document.addEventListener('webkitfullscreenchange', fsLabel);
fsLabel();
$('#resume').addEventListener('click', () => { $('#pause').classList.remove('show'); input.lock(); });
$('#quit').addEventListener('click', () => { game.host?.save(); location.href = location.pathname; });
$('#sens').value = player.sens;
$('#sens').addEventListener('input', e => { player.sens = +e.target.value; localStorage.setItem('nocturne-sens', player.sens); });
$('#vol').value = audio.vol;
$('#vol').addEventListener('input', e => { audio.vol = +e.target.value; if (audio.master) audio.master.gain.value = audio.vol; });
addEventListener('beforeunload', () => game.host?.save());

function copy(text, btn) {
  navigator.clipboard?.writeText(text).then(() => { const b = $(btn); if (b) { b.textContent = '복사됨!'; setTimeout(() => b.textContent = '복사', 1500); } }).catch(() => {});
}

// ───────── 메뉴/로비 ─────────
const params = new URLSearchParams(location.search);
const joinCode = (params.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
$('#nameIn').value = localStorage.getItem('nocturne-name') || '';
if (hasSave()) $('#contWrap').style.display = 'flex';
if (joinCode) {
  $('#joinBox').innerHTML = `초대받은 방 <b>${joinCode}</b><button class="primary" id="joinBtn">참가하기</button>`;
  $('#joinBtn').addEventListener('click', () => startJoin(joinCode));
  $('#contWrap').style.display = 'none';
}
$('#codeBtn').addEventListener('click', () => {
  const code = $('#codeIn').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 5) return showErr('방 코드 5자리를 입력해 주세요.');
  goFullscreen(); startJoin(code);
});
$('#codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('#codeBtn').click(); });
const myName = () => { const n = $('#nameIn').value.trim() || '대원' + Math.floor(Math.random() * 90 + 10); localStorage.setItem('nocturne-name', n); return n; };
const myRole = () => document.querySelector('#roles .on')?.dataset.role || 'engineer';
for (const b of document.querySelectorAll('#roles button')) {
  if (b.dataset.role === (localStorage.getItem('nocturne-role') || 'engineer')) b.classList.add('on');
  b.addEventListener('click', () => {
    for (const o of document.querySelectorAll('#roles button')) o.classList.remove('on');
    b.classList.add('on'); localStorage.setItem('nocturne-role', b.dataset.role);
  });
}
function showErr(t) { $('#mErr').textContent = t; }
function busy(on) { for (const b of document.querySelectorAll('#mMain button')) b.disabled = on; }

function makeHost(id) {
  game.host = new Host(ents, hostOut);
  if ($('#contChk').checked && game.host.load()) game.log = [...game.host.log];
  game.myId = id;
  game.host.addPlayer(id, myName(), myRole());
}

$('#soloBtn').addEventListener('click', () => {
  audio.init();
  makeHost('solo');
  game.mode = 'joining';
  game.host.start();
});

$('#hostBtn').addEventListener('click', async () => {
  audio.init(); busy(true); showErr('');
  for (let i = 0; i < 3; i++) {
    const code = makeCode();
    try {
      const id = await net.host(code);
      game.room = code;
      makeHost(id);
      net.onData = (pid, d) => {
        const h = game.host; if (!h || !d) return;
        if (d.t === 'hello') {
          if (!h.addPlayer(pid, String(d.name || '대원'), d.role)) { net.sendTo(pid, { t: 'full' }); net.kick(pid); return; }
          net.sendTo(pid, { t: 'welcome', id: pid, G: h.G, log: h.log.slice(-60) });
          h.dirty = true;
        } else if (d.t === 'p') {
          if (h.G.players[pid] && Number.isFinite(d.x) && Number.isFinite(d.z)) h.pos[pid] = d;
        } else if (d.t === 'act') h.handle(pid, d.a);
      };
      net.onLeave = pid => game.host?.removePlayer(pid);
      showLobby(true);
      return;
    } catch (e) {
      net.destroy();
      if (e?.type !== 'unavailable-id') { showErr('방 만들기 실패: ' + (e?.message || e) + ' — 네트워크를 확인해 주세요.'); busy(false); return; }
    }
  }
  busy(false); showErr('방 코드를 만들지 못했어요. 다시 시도해 주세요.');
});

async function startJoin(code) {
  audio.init(); busy(true); showErr('연결 중…');
  if ($('#joinBtn')) $('#joinBtn').disabled = true;
  try {
    net.onData = (_, d) => onMsg(d);
    net.onClose = () => {
      if (game.mode === 'ended') return;
      game.mode = 'menu'; input.unlock();
      $('#hud').classList.add('hidden'); $('#menu').style.display = 'grid';
      $('#lobby').style.display = 'none'; $('#mMain').style.display = 'flex';
      showErr('호스트와의 연결이 끊겼습니다. 방장이 다시 방을 열면 새 링크로 참가해 주세요.');
    };
    await net.join(code);
    game.room = code;
    game.mode = 'lobby';
    net.sendHost({ t: 'hello', name: myName(), role: myRole() });
    showErr('');
    showLobby(false);
  } catch (e) {
    net.destroy(); busy(false); if ($('#joinBtn')) $('#joinBtn').disabled = false;
    showErr(e?.type === 'peer-unavailable' ? '방을 찾을 수 없어요. 방장이 아직 대기실에 있는지 확인해 주세요.' : '연결 실패: ' + (e?.message || e));
  }
}

function showLobby(isHost) {
  game.mode = 'lobby';
  $('#mMain').style.display = 'none'; $('#lobby').style.display = 'flex';
  const link = game.inviteLink();
  $('#lobbyLink').innerHTML = `<div class="hint">이 링크를 친구에게 보내세요 (방 코드 <b>${game.room}</b>)</div><div class="link"><input readonly value="${link}"><button id="copyLink">복사</button></div>`;
  $('#copyLink').addEventListener('click', () => copy(link, '#copyLink'));
  $('#startBtn').style.display = isHost ? 'block' : 'none';
  $('#lobbyWait').textContent = isHost ? '모두 모이면 출발하세요. 시작한 뒤에도 링크로 중간 합류할 수 있어요.' : '방장이 출발하기를 기다리는 중…';
  if (location.protocol === 'file:') $('#lobbyWait').textContent += ' (⚠ 파일로 열면 친구가 링크를 쓸 수 없어요 — GitHub Pages에 올려서 사용하세요)';
  renderLobby();
}
function renderLobby() {
  const G = game.G; if (!G) return;
  $('#lobbyList').innerHTML = Object.entries(G.players).map(([id, p]) => `<li><i style="background:${p.color}"></i>${p.name}${id === game.myId ? ' (나)' : ''}</li>`).join('');
}
$('#startBtn').addEventListener('click', () => { audio.init(); game.host?.start(); });
