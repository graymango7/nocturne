// 호스트(방장) 권한 게임 로직 — 혼자 플레이할 때도 로컬에서 그대로 돈다.
import { MISSIONS, SYNCS, RECIPES, CARRY, SEARCH, ITEMS } from './data.js';
import { P, inLake } from './terrain.js';

export const DAY_SECONDS = 960;              // 하루 16분 (낮 약 10분 / 밤 약 5분)
export const isNight = t => t >= 0.68;
export const ROOM = { x0: -3.9, x1: 3.9, z0: -2.9, z1: 2.9 };
export const SAFE_R = 24;
export const LANTERN_R = 9;
export const PANEL = { x: -8, z: 4.5 };
export const CORE_NEED = 12;                 // 핵 추출에 필요한 '인원×초'
export const ROLES = ['scout', 'engineer', 'medic'];
const COLORS = ['#ff8a3d', '#3dc6ff', '#b6ff3d', '#ff4fa3'];
const ST = { wander: 0, chase: 1, flee: 2, leave: 2, sleep: 3, scream: 4 };
export const stormOn = G => G.storm?.phase === 'on';
const r2 = v => Math.round(v * 100) / 100;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const inRoom = p => !!p && p.x > ROOM.x0 && p.x < ROOM.x1 && p.z > ROOM.z0 && p.z < ROOM.z1;
const SAVE_KEY = 'nocturne-save-v1';

export function freshState() {
  return {
    started: false, ended: false, mission: 0, od: {}, os: {}, time: 0.08, timeRun: false, day: 1,
    inv: {}, crafted: {}, search: {}, flags: {}, taken: {}, moved: {}, sync: {}, players: {}, carry: {},
    flares: [], lanterns: [], drop: null, storm: null, beaconE: 1, coreProg: 0, countdown: 0, launch: false, logs: {}, stats: { downs: 0, start: 0, end: 0 }, now: 0,
  };
}

export const hasSave = () => { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } };

export class Host {
  constructor(ents, out) {
    this.E = ents; this.byId = {};
    for (const e of ents) this.byId[e.id] = e;
    this.out = out;
    this.G = freshState();
    this.pos = {}; this.aliens = []; this.aid = 0;
    this.log = []; this.queue = []; this.dirty = true; this.lastLen = 0;
    this.acc = { s: 0, k: 0, spawn: 0, save: 0, full: 0, cd: 0 };
    this.now = 0; this.pingAt = {}; this.stormK = 0; this.nextStorm = undefined;
  }

  get pids() { return Object.keys(this.G.players); }
  name(pid) { return this.G.players[pid]?.name || '???'; }
  alive() { return this.pids.filter(id => !this.G.players[id].down && this.pos[id]); }

  addPlayer(pid, name, role) {
    const G = this.G;
    if (G.players[pid]) return true;
    if (this.pids.length >= 4) return false;
    const used = new Set(Object.values(G.players).map(p => p.color));
    const color = COLORS.find(c => !used.has(c)) || COLORS[0];
    G.players[pid] = { name: (name || '대원').slice(0, 12), role: ROLES.includes(role) ? role : 'engineer', color, down: false, downAt: 0, resp: 0, safeUntil: 0 };
    if (G.started) this.msg('SYS', `${G.players[pid].name} 대원이 합류했습니다.`);
    this.dirty = true;
    return true;
  }

  removePlayer(pid) {
    if (!this.G.players[pid]) return;
    this.drop(pid);
    const n = this.name(pid);
    delete this.G.players[pid]; delete this.pos[pid];
    this.msg('SYS', `${n} 대원의 연결이 끊겼습니다.`);
    this.dirty = true;
  }

  msg(from, text, to) {
    const m = { t: 'm', from, text };
    if (to) m.to = to; else this.log.push(m);
    this.out(m);
  }

  // 대사를 읽을 시간 간격을 두고 차례로 보낸다
  say(list) {
    let at = this.queue.length ? this.queue[this.queue.length - 1].at : this.now - 1;
    let prev = this.queue.length ? this.lastLen : 0;
    for (const [from, text] of list) {
      at = Math.max(at + Math.min(7, 1.2 + prev * 0.045), this.now + 0.4);
      this.queue.push({ at, from, text });
      prev = text.length;
    }
    this.lastLen = prev;
  }

  start() {
    const G = this.G;
    if (G.started) return;
    G.started = true; G.stats.start = Date.now();
    this.startMission(G.mission);
    this.dirty = true;
  }

  startMission(i) {
    const G = this.G;
    G.mission = i;
    const m = MISSIONS[i];
    if (!m) return;
    if (m.start) this.say(m.start);
    this.dirty = true;
    this.save();
  }

  curMission() { return MISSIONS[this.G.mission]; }
  activeObj(id) {
    const m = this.curMission(); if (!m) return null;
    const o = m.obj.find(o => o.id === id); if (!o) return null;
    const key = m.id + '.' + o.id;
    return this.G.os[key] && !this.G.od[key] ? o : null;
  }
  activeSync(group) {
    const m = this.curMission(); if (!m) return null;
    return m.obj.find(o => o.type === 'sync' && o.sync === group && this.G.os[m.id + '.' + o.id] && !this.G.od[m.id + '.' + o.id]);
  }

  tick(dt) {
    const G = this.G;
    this.now += dt; G.now = this.now;
    while (this.queue.length && this.queue[0].at <= this.now) { const q = this.queue.shift(); this.msg(q.from, q.text); }
    if (G.started && !G.ended) {
      if (G.timeRun && !G.launch) {
        G.time += dt / DAY_SECONDS;
        if (G.time >= 1) { G.time -= 1; G.day++; this.msg('SYS', `☀ ${G.day}일차 아침`); this.dirty = true; }
      }
      this.updateDowned();
      this.updateCarry();
      this.updateCore(dt);
      this.updateBeacon(dt);
      this.updateStorm();
      this.updateDrop(dt);
      if (G.lanterns.length && G.lanterns.some(l => l.until <= this.now)) { G.lanterns = G.lanterns.filter(l => l.until > this.now); this.dirty = true; }
      this.updateLaunch(dt);
      this.updateFlares();
      this.updateAliens(dt);
      this.check();
    }
    this.acc.k += dt; this.acc.s += dt; this.acc.full += dt; this.acc.save += dt;
    if (this.acc.k >= 1 / 12) { this.acc.k = 0; this.out(this.snapshot()); }
    if ((this.dirty && this.acc.s >= 0.15) || this.acc.full >= 2) {
      this.acc.s = 0; this.acc.full = 0; this.dirty = false;
      this.out({ t: 's', G });
    }
    if (this.acc.save >= 30) { this.acc.save = 0; this.save(); }
  }

  snapshot() {
    const p = {};
    for (const id in this.pos) {
      const q = this.pos[id];
      p[id] = [r2(q.x), r2(q.y), r2(q.z), r2(q.ry), r2(q.rx), q.fl ? 1 : 0, q.cr ? 1 : 0, r2(q.mv || 0)];
    }
    return {
      t: 'k', now: r2(this.now), time: this.G.time, be: r2(this.G.beaconE), sk: r2(this.stormK), cd: r2(this.G.countdown), cp: r2(this.G.coreProg), p,
      a: this.aliens.map(a => [a.id, r2(a.x), r2(a.z), r2(a.ry), a.scr > 0 ? 4 : (ST[a.st] ?? 0), a.type === 'screamer' ? 1 : 0]),
    };
  }

  // ───────── 미션 진행 ─────────
  reqOk(m, o) {
    if (!o.req) return true;
    const reqs = Array.isArray(o.req) ? o.req : [o.req];
    return reqs.every(r => this.G.od[m.id + '.' + r]);
  }

  test(o, key) {
    const G = this.G;
    switch (o.type) {
      case 'flag': return !!G.flags[o.flag];
      case 'inv': return (G.inv[o.item] || 0) >= o.n || (o.orCraft && G.crafted[o.orCraft] > 0);
      case 'craft': return (G.crafted[o.item] || 0) >= o.n;
      case 'search': return !!G.search[o.key];
      case 'sync': return !!G.flags['sync_' + o.sync];
      case 'reach': return Object.keys(G.players).some(id => this.pos[id] && dist(this.pos[id], o) < o.r);
      case 'survive': return G.day > G.os[key].day && !isNight(G.time);
      case 'allin': {
        const ids = this.pids.filter(id => !G.players[id].down);
        return ids.length > 0 && ids.every(id => inRoom(this.pos[id]));
      }
    }
    return false;
  }

  check() {
    const G = this.G, m = this.curMission();
    if (!m) return;
    let all = true;
    for (const o of m.obj) {
      const key = m.id + '.' + o.id;
      if (G.od[key]) continue;
      all = false;
      if (!this.reqOk(m, o)) continue;
      if (!G.os[key]) {
        G.os[key] = { day: G.day, at: this.now };
        this.dirty = true;
        if (o.msg && o.msgWhen === 'activate') this.say(o.msg);
      }
      if (this.test(o, key)) {
        G.od[key] = true; this.dirty = true;
        this.out({ t: 'fx', k: 'obj', text: o.text });
        if (o.fx) this.fx(o.fx);
        if (o.msg && o.msgWhen !== 'activate') this.say(o.msg);
      }
    }
    if (all) {
      if (m.fx) this.fx(m.fx);
      if (m.done) this.say(m.done);
      this.out({ t: 'fx', k: 'mission', title: m.title });
      if (!G.ended) this.startMission(G.mission + 1);
    }
  }

  fx(n) {
    const G = this.G;
    switch (n) {
      case 'clock': G.timeRun = true; break;
      case 'power':
        G.inv.battery = Math.max(0, (G.inv.battery || 0) - 3);
        G.flags.power = true; this.out({ t: 'fx', k: 'power' }); break;
      case 'dusk': if (G.time < 0.62) G.time = 0.62; break;
      case 'comms': G.flags.comms = true; break;
      case 'launch':
        G.launch = true; G.countdown = 90;
        if (G.time < 0.7) G.time = 0.72;
        this.out({ t: 'fx', k: 'launch' }); break;
      case 'end':
        G.ended = true; G.stats.end = Date.now();
        try { localStorage.removeItem(SAVE_KEY); } catch {}
        this.out({ t: 'fx', k: 'end' }); break;
    }
    this.dirty = true;
  }

  // ───────── 플레이어 행동 처리 ─────────
  handle(pid, a) {
    const G = this.G;
    if (!G.players[pid] || !a) return;
    if (G.players[pid].down && a.a !== 'chat') return;
    switch (a.a) {
      case 'take': this.take(pid, a.id); break;
      case 'use': this.use(pid, a.id); break;
      case 'sync': this.syncHit(pid, a.id); break;
      case 'craft': this.craft(pid, a.r); break;
      case 'search': {
        const s = SEARCH.find(s => s.key === a.key);
        if (s && !G.search[a.key]) {
          G.search[a.key] = true; this.dirty = true;
          if (Object.values(RECIPES).some(r => r.unlock === a.key)) this.msg('SYS', `🔎 ${this.name(pid)}: "${s.title}" — 제작법 해금`);
        }
        break;
      }
      case 'flare': {
        if ((G.inv.flare || 0) <= 0) return;
        G.inv.flare--; G.flares.push({ x: +a.x, z: +a.z, until: this.now + 12 });
        this.dirty = true; this.out({ t: 'fx', k: 'flare', x: a.x, z: a.z }); break;
      }
      case 'revive': {
        const t = G.players[a.pid];
        if (!t || !t.down || !this.pos[a.pid] || !this.pos[pid] || dist(this.pos[pid], this.pos[a.pid]) > 4) return;
        t.down = false; t.safeUntil = this.now + 4; this.dirty = true;
        this.msg('SYS', `${this.name(pid)} 대원이 ${t.name} 대원을 일으켰습니다.`); break;
      }
      case 'chat': this.msg(this.name(pid), String(a.text || '').slice(0, 140)); break;
      case 'lantern': {
        if ((G.inv.lantern || 0) <= 0 || !Number.isFinite(+a.x) || !Number.isFinite(+a.z)) return;
        G.inv.lantern--;
        G.lanterns = G.lanterns.filter(l => l.until > this.now).slice(-2);
        G.lanterns.push({ x: +a.x, z: +a.z, until: this.now + 60 });
        this.dirty = true; this.out({ t: 'fx', k: 'lantern' });
        this.msg('SYS', `🏮 ${this.name(pid)}: 휴대용 UV 랜턴 설치 (60초)`);
        break;
      }
      case 'ping': {
        if (this.now - (this.pingAt[pid] || 0) < 0.8 || !Number.isFinite(+a.x) || !Number.isFinite(+a.z)) return;
        this.pingAt[pid] = this.now;
        this.out({ t: 'fx', k: 'ping', pid, x: +a.x, z: +a.z });
        break;
      }
    }
  }

  entPos(e) { return this.G.moved[e.id] || e; }

  take(pid, id) {
    const G = this.G, e = this.byId[id];
    if (!e || G.taken[id]) return;
    const p = this.pos[pid];
    if (p && dist(p, this.entPos(e)) > 8) return;
    const k = e.kind;
    if (k === 'crystal' && !isNight(G.time) && !stormOn(G)) return this.msg('SYS', '결정이 햇빛에 달궈져 있다. 밤에만 채굴할 수 있다.', pid);
    if (k === 'moonflower' && !isNight(G.time)) return this.msg('SYS', '월광화가 봉오리를 닫고 있다. 밤에만 채집할 수 있다.', pid);
    if (k === 'water') { G.inv.water = (G.inv.water || 0) + 1; this.dirty = true; this.out({ t: 'fx', k: 'pick', pid }); return; }
    if (CARRY[k]) {
      if (G.carry[pid]) return this.msg('SYS', '이미 무언가를 들고 있다.', pid);
      if (k === 'core' && !G.flags.coreOut) return;
      if (k === 'antenna' && !this.activeObj('ant')) return this.msg('SYS', '안테나가 너무 무겁다. 아직은 옮길 이유가 없다.', pid);
      G.taken[id] = true; G.carry[pid] = id; delete G.moved[id];
      this.msg('SYS', `${this.name(pid)} 대원이 ${ITEMS[k].name}을(를) 들었습니다.`);
    } else if (k === 'phone') {
      G.taken[id] = true; G.flags.phone = true;
    } else if (k === 'log') {
      G.taken[id] = true; G.logs[id] = true;
      this.msg('SYS', `📼 오리온-3 데이터 로그 획득 (${Object.keys(G.logs).length}/5) — 휴대폰 [로그] 앱`);
    } else if (k === 'core') {
      return;
    } else {
      G.taken[id] = true; G.inv[k] = (G.inv[k] || 0) + 1;
    }
    this.dirty = true;
    this.out({ t: 'fx', k: 'pick', pid });
  }

  drop(pid) {
    const G = this.G, eid = G.carry[pid];
    if (!eid) return;
    const p = this.pos[pid] || this.byId[eid];
    G.moved[eid] = { x: p.x, z: p.z, y: p.y ?? 0 };
    delete G.taken[eid]; delete G.carry[pid];
    this.dirty = true;
  }

  use(pid, id) {
    const G = this.G;
    const e = this.byId[id]; if (!e) return;
    if (e.kind === 'panel') {
      if (!G.flags.panel) { G.flags.panel = true; this.dirty = true; return; }
      if (this.activeObj('install')) {
        const need = [];
        if ((G.inv.navchip || 0) < 1) need.push('항법 칩');
        if ((G.inv.hull || 0) < 3) need.push(`선체 판 (${G.inv.hull || 0}/3)`);
        if ((G.inv.fuelcell || 0) < 1) need.push('바이오 연료 셀');
        if ((G.inv.coil || 0) < 1) need.push('냉각 코일');
        if (!G.flags.antennaHome) need.push('통신 안테나');
        if (!G.flags.coreHome) need.push('둥지 핵');
        if (need.length) return this.msg('SYS', '장착 불가 — 부족: ' + need.join(', '), pid);
        for (const k of ['navchip', 'fuelcell', 'coil']) G.inv[k]--;
        G.inv.hull -= 3;
        G.flags.installed = true; this.dirty = true;
        this.msg('SYS', '🔧 모든 부품 장착 완료. 점화 준비.');
        return;
      }
      const ok = ['항법 칩 ' + ((G.inv.navchip || 0) >= 1 ? '✓' : '✗'), `선체 판 ${Math.min(3, G.inv.hull || 0)}/3`,
        '연료 셀 ' + ((G.inv.fuelcell || 0) >= 1 ? '✓' : '✗'), '냉각 코일 ' + ((G.inv.coil || 0) >= 1 ? '✓' : '✗'),
        '안테나 ' + (G.flags.antennaHome ? '✓' : '✗'), '전력 코어 ' + (G.flags.coreHome ? '✓' : '✗')];
      return this.msg('SYS', '수리 현황: ' + ok.join(' · '), pid);
    }
    if (e.kind === 'beaconSlot') {
      if (G.flags.beaconPlaced) return;
      if ((G.inv.beacon || 0) < 1) return this.msg('SYS', 'UV 방어등이 필요하다. (제작대에서 제작)', pid);
      G.inv.beacon--; G.flags.beaconPlaced = true; this.dirty = true;
      this.out({ t: 'fx', k: 'beacon' });
      return;
    }
    if (e.kind === 'bed') {
      if (isNight(G.time) || G.launch) return this.msg('SYS', '잠들 수 없다… 밖에서 무언가가 선체를 긁고 있다.', pid);
      if (G.time >= 0.6) return this.msg('SYS', '이미 해가 지고 있다.', pid);
      const ids = this.pids, inside = ids.filter(i => inRoom(this.pos[i])).length;
      if (inside < ids.length) return this.msg('SYS', `모든 대원이 조종실 안에 있어야 잠들 수 있다 (${inside}/${ids.length})`, pid);
      G.time = 0.62; this.dirty = true;
      this.out({ t: 'fx', k: 'sleep' });
      this.msg('SYS', '모두 잠이 들었다… 해질녘에 눈을 떴다.');
    }
  }

  syncHit(pid, id) {
    const G = this.G;
    const group = Object.keys(SYNCS).find(g => SYNCS[g].ids.includes(id));
    if (!group) return;
    if (!this.activeSync(group)) {
      if (!G.flags['sync_' + group]) this.msg('SYS', '아직 작동하지 않는다.', pid);
      return;
    }
    const first = !G.sync[id] || this.now - G.sync[id] > 1;
    G.sync[id] = this.now; this.dirty = true;
    if (first) this.out({ t: 'fx', k: 'sync', id });
    const s = SYNCS[group], w = this.pids.length > 1 ? s.w[1] : s.w[0];
    const ts = s.ids.map(i => G.sync[i] || -1e9);
    if (this.now - Math.min(...ts) <= w) G.flags['sync_' + group] = true;
  }

  craft(pid, r) {
    const G = this.G, rec = RECIPES[r];
    if (!rec) return;
    if (rec.unlock && !G.search[rec.unlock]) return;
    const wb = this.byId.workbench, p = this.pos[pid];
    if (p && dist(p, wb) > 6) return this.msg('SYS', '제작대 근처에서만 만들 수 있다.', pid);
    if (rec.tool && !(G.inv[rec.tool] > 0)) return this.msg('SYS', `${ITEMS[rec.tool].name}이(가) 필요하다.`, pid);
    for (const [k, n] of Object.entries(rec.cost)) if ((G.inv[k] || 0) < n) return this.msg('SYS', '재료가 부족하다.', pid);
    for (const [k, n] of Object.entries(rec.cost)) G.inv[k] -= n;
    G.inv[rec.out] = (G.inv[rec.out] || 0) + rec.n;
    G.crafted[rec.out] = (G.crafted[rec.out] || 0) + rec.n;
    this.dirty = true;
    this.out({ t: 'fx', k: 'craft', pid });
    this.msg('SYS', `🛠 ${this.name(pid)}: ${ITEMS[rec.out].name} 제작`);
  }

  // ───────── 상태 갱신 ─────────
  downPlayer(pid) {
    const G = this.G, pl = G.players[pid];
    if (!pl || pl.down || this.now < pl.safeUntil) return;
    pl.down = true; pl.downAt = this.now; G.stats.downs++;
    this.drop(pid);
    this.dirty = true;
    this.out({ t: 'fx', k: 'hit', pid });
    this.msg('SYS', `⚠ ${pl.name} 대원이 쓰러졌습니다!`);
  }

  updateDowned() {
    const G = this.G, ids = this.pids;
    const allDown = ids.length > 0 && ids.every(id => G.players[id].down);
    for (const id of ids) {
      const pl = G.players[id];
      if (!pl.down) continue;
      const fast = ids.length === 1 || allDown;
      if (this.now - pl.downAt > (fast ? 3.5 : 25)) {
        pl.down = false; pl.resp++; pl.safeUntil = this.now + 6;
        this.dirty = true;
      }
    }
  }

  updateCarry() {
    const G = this.G;
    for (const pid in G.carry) {
      const p = this.pos[pid]; if (!p) continue;
      if (dist(p, PANEL) < 9 || inRoom(p)) {
        const k = this.byId[G.carry[pid]].kind;
        if (k === 'antenna') G.flags.antennaHome = true;
        if (k === 'core') G.flags.coreHome = true;
        delete G.carry[pid];
        this.dirty = true;
        this.msg('SYS', `📦 ${ITEMS[k].name} 함선 도착!`);
      }
    }
  }

  updateCore(dt) {
    const G = this.G;
    if (G.flags.coreOut || !this.activeObj('extract')) return;
    const core = this.byId.core1;
    const holders = this.alive().filter(id => this.pos[id].hold === 'core' && dist(this.pos[id], core) < 4.5);
    if (!holders.length) return;
    G.coreProg = Math.min(CORE_NEED, G.coreProg + dt * holders.length);
    if (G.coreProg > 2.5 && !G.flags.nestAwake) {
      G.flags.nestAwake = true; this.dirty = true;
      this.msg('MIRA', '진동이… 경비 개체들이 깨어나고 있어요! 서둘러요!');
    }
    if (G.coreProg >= CORE_NEED) { G.flags.coreOut = true; this.dirty = true; }
  }

  // 방어등은 밤 동안 배터리가 닳는다 — 기둥에서 E를 길게 눌러 발전기를 돌려 충전
  updateBeacon(dt) {
    const G = this.G;
    if (!G.flags.beaconPlaced || G.launch) return;
    const night = isNight(G.time), bs = this.byId.beaconSlot, before = G.beaconE;
    const holders = this.alive().filter(id => this.pos[id].hold === 'crank' && dist(this.pos[id], bs) < 4).length;
    G.beaconE = night ? Math.max(0, G.beaconE - dt / 75) : Math.min(1, G.beaconE + dt / 20);
    if (holders) G.beaconE = Math.min(1, G.beaconE + dt * holders / 5);
    if (night && before > 0.3 && G.beaconE <= 0.3) this.msg('MIRA', '방어등 배터리 30%! 방어등 기둥에서 [E]를 길게 눌러 발전기를 돌려요.');
    if (before > 0 && G.beaconE <= 0) { this.msg('MIRA', '⚠ 방어등이 꺼졌어요! 보호막이 사라졌어요 — 발전기를 돌려요!'); this.dirty = true; }
    if (before <= 0 && G.beaconE > 0) this.dirty = true;
  }

  // 포자 폭풍: 미션 4(흩어진 부품)부터 낮에 가끔 찾아온다. 경고 15초 → 70초 지속
  updateStorm() {
    const G = this.G;
    if (G.mission < 3 || G.launch) {
      if (G.storm) { G.storm = null; this.dirty = true; }
      this.stormK = 0; return;
    }
    if (this.nextStorm === undefined) this.nextStorm = this.now + 150 + Math.random() * 120;
    const s = G.storm;
    if (!s) {
      if (this.now >= this.nextStorm) {
        if (!isNight(G.time) && G.time > 0.06 && G.time < 0.48) {
          G.storm = { phase: 'warn', end: this.now + 10 }; this.dirty = true;
          this.out({ t: 'fx', k: 'stormWarn' });
          this.msg('MIRA', G.flags.stormSeen ? '☣ 포자 폭풍이 다시 다가와요. 10초!'
            : '☣ 기압이 급격히 떨어져요… 포자 폭풍이에요! 10초 뒤엔 앞이 거의 안 보이고, 그것들이 낮에도 깨어나요. 함선 쪽으로 돌아오거나 웅크려서 버텨요.');
        } else this.nextStorm = this.now + 25;
      }
    } else if (s.phase === 'warn' && this.now >= s.end) {
      G.storm = { phase: 'on', start: this.now, end: this.now + 35 }; this.dirty = true;
      if (!G.flags.stormSeen) {
        G.flags.stormSeen = true;
        this.say([['MIRA', '잠깐… 폭풍의 냉기 때문에 결정 평원의 공명 결정이 식고 있어요! 폭풍이 부는 동안엔 낮에도 결정을 캘 수 있어요.']]);
      }
    } else if (s.phase === 'on' && this.now >= s.end) {
      G.storm = null; this.dirty = true;
      this.nextStorm = this.now + 420 + Math.random() * 180;
      this.msg('SYS', '☣ 포자 폭풍이 지나갔다.');
    }
    const t = G.storm;
    this.stormK = t?.phase === 'on' ? Math.max(0, Math.min(1, (this.now - t.start) / 5, (t.end - this.now) / 5)) : 0;
  }

  // 밤의 보급 캡슐: 첫 밤부터 밤마다 최대 2번 떨어진다. 여는 동안 주변 개체가 몰려온다
  updateDrop(dt) {
    const G = this.G;
    if (!isNight(G.time) || G.launch || G.mission < 5) {
      if (G.drop) { if (!isNight(G.time)) this.msg('SYS', '📦 날이 밝자 보급 캡슐 신호가 끊겼다.'); G.drop = null; this.dirty = true; }
      this.dropsTonight = 0; this.nextDrop = undefined; return;
    }
    if (this.nextDrop === undefined) this.nextDrop = this.now + 25 + Math.random() * 35;
    if (!G.drop && (this.dropsTonight || 0) < 2 && this.now >= this.nextDrop) {
      let x = 0, z = 0;
      for (let k = 0; k < 30; k++) {
        const ang = Math.random() * Math.PI * 2, d = 70 + Math.random() * 80;
        x = Math.cos(ang) * d; z = Math.sin(ang) * d;
        if (!inLake(x, z) && Math.abs(x) < 260 && Math.abs(z) < 260) break;
      }
      G.drop = { x, z, t0: this.now, prog: 0, loud: false };
      this.dropsTonight = (this.dropsTonight || 0) + 1; this.nextDrop = this.now + 110 + Math.random() * 60;
      this.dirty = true; this.out({ t: 'fx', k: 'drop', x, z });
      this.msg('MIRA', G.flags.dropSeen ? '📦 보급 캡슐이 또 떨어져요! 나침반의 📦 표시를 따라가요.'
        : '📦 하늘에서 뭔가 떨어져요… 함대가 남긴 보급 캡슐이에요! 열면 쓸 만한 게 있을 거예요. 단, 여는 소리가 커서 그것들이 몰려와요.');
      G.flags.dropSeen = true;
    }
    const d = G.drop;
    if (!d || this.now - d.t0 < 5) return;
    const holders = this.alive().filter(id => this.pos[id].hold === 'capsule' && Math.hypot(this.pos[id].x - d.x, this.pos[id].z - d.z) < 3.5);
    if (!holders.length) return;
    if (!d.loud) {
      d.loud = true;
      for (const b of this.aliens) if (b.type !== 'screamer' && Math.hypot(b.x - d.x, b.z - d.z) < 75) { b.alert = this.now + 12; b.tg = holders[0]; if (b.st === 'sleep') b.st = 'wander'; }
      this.msg('MIRA', '캡슐 잠금장치 소리가 울려요! 주변 개체들이 다가와요 — 빨리!');
    }
    d.prog = Math.min(1, d.prog + dt * holders.length / 5);
    this.dirty = true;
    if (d.prog >= 1) {
      const pool = [['battery', 1], ['fiber', 3], ['resin', 2], ['moss', 2], ['chitin', 2], ['moonflower', 2], ['purewater', 1]];
      const got = [['flare', 2]];
      for (let i = 0; i < 2; i++) got.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      for (const [k, n] of got) G.inv[k] = (G.inv[k] || 0) + n;
      G.drop = null;
      this.out({ t: 'fx', k: 'craft', pid: holders[0] });
      this.msg('SYS', '📦 보급 캡슐 획득: ' + got.map(([k, n]) => `${ITEMS[k].icon}${ITEMS[k].name} ×${n}`).join(', '));
    }
  }

  updateLaunch(dt) {
    const G = this.G;
    if (!G.launch || G.flags.countdown) return;
    G.countdown -= dt;
    if (G.countdown <= 0) { G.countdown = 0; G.flags.countdown = true; this.dirty = true; }
  }

  updateFlares() {
    const G = this.G, n = G.flares.length;
    G.flares = G.flares.filter(f => f.until > this.now);
    if (G.flares.length !== n) this.dirty = true;
  }

  inLantern(p) { return this.G.lanterns.some(l => l.until > this.now && Math.hypot(p.x - l.x, p.z - l.z) < LANTERN_R); }

  spawnAlien(x, z, guard = false, type = 'stalker') {
    this.aliens.push({ id: ++this.aid, type, x, z, ry: 0, st: guard ? 'sleep' : 'wander', tx: x, tz: z, tg: null, cd: type === 'screamer' ? 3 : 0, guard, hx: x, hz: z, fl: 0, leave: 0, fx: 0, fz: 0, scr: 0, alert: 0 });
  }

  updateAliens(dt) {
    const G = this.G;
    const storm = stormOn(G), night = isNight(G.time) || G.launch || storm;
    const safe = G.flags.beaconPlaced && !G.launch && G.beaconE > 0;
    const players = this.alive().map(id => ({ id, p: this.pos[id], carry: G.carry[id] }));
    const n = Math.max(1, this.pids.length);

    // 생성/정리
    this.acc.spawn += dt;
    if (this.acc.spawn > 1.5) {
      this.acc.spawn = 0;
      const guardsNeeded = G.mission >= 2 && !G.flags.coreHome;
      const guards = this.aliens.filter(a => a.guard).length;
      if (guardsNeeded && guards < 3) {
        const a = guards / 3 * Math.PI * 2;
        this.spawnAlien(P.NEST.x + Math.cos(a) * 9, P.NEST.z + Math.sin(a) * 9, true);
      }
      if (G.flags.coreHome) for (const a of this.aliens) a.guard = false;
      const target = storm && !isNight(G.time) ? 1 + n : Math.min(12, 2 + 2 * n + (G.launch ? 5 : 0));
      const wild = this.aliens.filter(a => !a.guard).length;
      if (night && wild < target && players.length) {
        const c = G.launch ? { x: 0, z: 0 } : players[Math.floor(Math.random() * players.length)].p;
        const ang = Math.random() * Math.PI * 2, d = G.launch ? 55 + Math.random() * 20 : 60 + Math.random() * 30;
        const x = c.x + Math.cos(ang) * d, z = c.z + Math.sin(ang) * d;
        if (Math.abs(x) < 280 && Math.abs(z) < 280 && !(safe && Math.hypot(x, z) < SAFE_R + 15)) {
          const screamers = this.aliens.filter(a => a.type === 'screamer').length;
          const scream = G.mission >= 6 && screamers < (n > 1 ? 2 : 1) && Math.random() < 0.3;
          this.spawnAlien(x, z, false, scream ? 'screamer' : 'stalker');
          if (scream && !G.flags.screamerSeen) {
            G.flags.screamerSeen = true;
            this.say([['MIRA', '새로운 개체 반응이에요. 직접 덤비진 않지만… 울음소리로 주변 개체를 전부 불러 모아요. 저는 "울보"라고 부를게요.'],
              ['MIRA', '다행히 약점이 있어요. 다른 개체와 반대로, 울보는 손전등 빛을 정면으로 비추면 겁먹고 달아나요!']]);
          }
        }
      }
    }

    for (const a of this.aliens) {
      a.cd -= dt; a.fl -= dt;
      // 조명탄 → 도망
      for (const f of G.flares) if (Math.hypot(a.x - f.x, a.z - f.z) < 16) { a.fl = 4; a.fx = f.x; a.fz = f.z; }
      if (!night && !a.guard) { a.st = 'leave'; a.leave += dt; }
      if (a.guard && a.st === 'sleep') {
        if (G.flags.nestAwake || night) a.st = 'wander'; else continue;
      }
      if (a.guard && !night && !G.flags.nestAwake) { a.st = 'sleep'; continue; }

      let speed = 2.2, tx = a.tx, tz = a.tz;
      if (a.type === 'screamer' && a.st !== 'leave') {
        // 손전등 정면으로 비추면 겁먹고 달아난다
        for (const q of players) {
          if (!q.p.fl) continue;
          const dx = a.x - q.p.x, dz = a.z - q.p.z, d = Math.hypot(dx, dz);
          if (d > 24 || d < 0.1) continue;
          const dot = (dx * -Math.sin(q.p.ry) + dz * -Math.cos(q.p.ry)) / d;
          if (dot > 0.88) { if (a.fl <= 0) this.out({ t: 'fx', k: 'whimper', x: a.x, z: a.z }); a.fl = 5; a.fx = q.p.x; a.fz = q.p.z; a.scr = 0; }
        }
      }
      if (a.type === 'screamer' && a.fl <= 0 && a.st !== 'leave') {
        if (a.scr > 0) {
          a.scr -= dt; a.st = 'scream'; tx = a.x; tz = a.z;
        } else {
          let best = null, bd = 1e9;
          for (const q of players) {
            if ((safe && Math.hypot(q.p.x, q.p.z) < SAFE_R) || this.inLantern(q.p)) continue;
            const d = dist(a, q.p), R = 30 + (q.p.sp ? 8 : 0) - (q.p.cr ? 8 : 0) - (G.players[q.id]?.role === 'scout' ? 5 : 0);
            if (d < R && d < bd) { bd = d; best = q; }
          }
          if (best && a.cd <= 0) {
            a.scr = 1.8; a.cd = 14; a.st = 'scream'; a.tg = best.id; tx = a.x; tz = a.z;
            a.ry = Math.atan2(-(best.p.x - a.x), -(best.p.z - a.z));
            this.out({ t: 'fx', k: 'scream', x: a.x, z: a.z });
            for (const b of this.aliens) {
              if (b === a || b.type === 'screamer' || Math.hypot(b.x - a.x, b.z - a.z) > 70) continue;
              b.alert = this.now + 12; b.tg = best.id; if (b.st === 'sleep') b.st = 'wander';
            }
          } else if (best) {
            // 거리를 16m로 유지하며 맴돈다
            a.st = 'wander';
            const dx = a.x - best.p.x, dz = a.z - best.p.z, d = Math.hypot(dx, dz) || 1;
            const ang = Math.atan2(dz, dx) + 0.4;
            tx = best.p.x + Math.cos(ang) * 16; tz = best.p.z + Math.sin(ang) * 16; speed = d < 12 ? 6 : 3.5;
          } else {
            a.st = 'wander';
            if (Math.hypot(a.tx - a.x, a.tz - a.z) < 2) { a.tx = a.x + (Math.random() - 0.5) * 70; a.tz = a.z + (Math.random() - 0.5) * 70; }
            tx = a.tx; tz = a.tz;
          }
        }
      } else if (a.fl > 0 || a.st === 'leave') {
        let fx = a.fx, fz = a.fz;
        if (a.st === 'leave' && a.fl <= 0) {
          let nd = 1e9; for (const q of players) { const d = dist(a, q.p); if (d < nd) { nd = d; fx = q.p.x; fz = q.p.z; } }
          if (nd === 1e9) { fx = 0; fz = 0; }
        }
        const dx = a.x - fx, dz = a.z - fz, d = Math.hypot(dx, dz) || 1;
        tx = a.x + dx / d * 10; tz = a.z + dz / d * 10; speed = 7;
        if (a.st !== 'leave') a.st = 'flee';
      } else {
        // 표적 찾기
        let best = null, bd = 1e9;
        for (const q of players) {
          if ((safe && Math.hypot(q.p.x, q.p.z) < SAFE_R) || this.inLantern(q.p)) continue;
          const d = dist(a, q.p);
          let R = 13 + (q.p.fl ? 16 : 0) + (q.p.sp ? 9 : 0) - (q.p.cr ? 6 : 0) - (G.players[q.id]?.role === 'scout' ? 4 : 0);
          if (q.carry === 'core1') R += 22;
          if (a.guard && G.flags.nestAwake) R += 25;
          if (G.launch) R += 30;
          if (a.st === 'chase' && a.tg === q.id) R += 20;
          if (a.alert > this.now && a.tg === q.id) R += 70;
          if (d < R && d < bd) { bd = d; best = q; }
        }
        if (a.guard && Math.hypot(a.x - a.hx, a.z - a.hz) > 85) best = null;
        if (best) {
          a.st = 'chase'; a.tg = best.id; tx = best.p.x; tz = best.p.z;
          speed = G.launch ? 6.8 : 6.3;
          if (bd < 1.7 && a.cd <= 0) {
            this.downPlayer(best.id); a.cd = 4; a.fl = 2.5; a.fx = best.p.x; a.fz = best.p.z;
          }
        } else {
          if (a.st === 'chase') { a.st = 'wander'; a.tx = a.x; a.tz = a.z; }
          a.st = 'wander';
          if (Math.hypot(a.tx - a.x, a.tz - a.z) < 2) {
            const cx = a.guard ? a.hx : a.x, cz = a.guard ? a.hz : a.z, r = a.guard ? 25 : 35;
            a.tx = cx + (Math.random() - 0.5) * 2 * r; a.tz = cz + (Math.random() - 0.5) * 2 * r;
            if (G.launch) { a.tx = (Math.random() - 0.5) * 20; a.tz = (Math.random() - 0.5) * 20; }
          }
          tx = a.tx; tz = a.tz;
        }
      }
      const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
      if (d > 0.05) {
        const s = Math.min(d, speed * dt);
        a.x += dx / d * s; a.z += dz / d * s;
        a.ry = Math.atan2(-dx, -dz);
      }
      a.x = Math.max(-285, Math.min(285, a.x)); a.z = Math.max(-285, Math.min(285, a.z));
      for (const l of G.lanterns) {
        const lx = a.x - l.x, lz = a.z - l.z, r = Math.hypot(lx, lz);
        if (r < LANTERN_R && l.until > this.now) { a.x = l.x + lx / (r || 1) * LANTERN_R; a.z = l.z + lz / (r || 1) * LANTERN_R; if (a.st === 'chase') a.st = 'wander'; }
      }
      if (safe) {
        const r = Math.hypot(a.x, a.z);
        if (r < SAFE_R) { const k = SAFE_R / (r || 1); a.x *= k; a.z *= k; if (a.st === 'chase') { a.st = 'wander'; a.tx = a.x * 2; a.tz = a.z * 2; } }
      }
    }
    this.aliens = this.aliens.filter(a => !(a.st === 'leave' && a.leave > 7));
  }

  // ───────── 저장 ─────────
  save() {
    const G = this.G;
    if (!G.started || G.ended) return;
    try {
      const S = JSON.parse(JSON.stringify(G));
      for (const pid in S.carry) { const e = this.byId[S.carry[pid]]; S.moved[e.id] = { x: PANEL.x, z: PANEL.z + 2, y: 0 }; delete S.taken[e.id]; }
      S.carry = {}; S.players = {}; S.flares = []; S.sync = {}; S.storm = null; S.drop = null; S.lanterns = [];
      if (S.launch) { // 발사 시퀀스 도중 저장 → 점화 직전으로 되돌림
        S.launch = false; S.countdown = 0;
        for (const k of ['launch.ignite', 'launch.hold', 'launch.board']) { delete S.od[k]; delete S.os[k]; }
        delete S.flags.sync_ignite; delete S.flags.countdown;
      }
      localStorage.setItem(SAVE_KEY, JSON.stringify({ G: S, log: this.log.slice(-60) }));
    } catch {}
  }

  load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!d) return false;
      const players = this.G.players;
      this.G = Object.assign(freshState(), d.G, { players, started: false });
      this.log = d.log || [];
      this.dirty = true;
      return true;
    } catch { return false; }
  }
}
