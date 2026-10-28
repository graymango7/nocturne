// HUD, 휴대폰(미션/스캐너/검색/제작/가방/통신/로그), 주파수 튜너, 토스트
import { ITEMS, RECIPES, RECIPE_ORDER, MISSIONS, SYNCS, LOGS, REGIONS, ROLE_INFO, searchDB } from './data.js';
import { isNight, CORE_NEED } from './host.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTime = t => { const h = (6 + t * 24) % 24; return String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0'); };
const wrap = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

const APPS = [
  { id: 'mission', icon: '🎯', name: '미션' }, { id: 'scanner', icon: '📡', name: '스캐너' },
  { id: 'search', icon: '🔎', name: '검색' }, { id: 'craft', icon: '🛠️', name: '제작' },
  { id: 'bag', icon: '🎒', name: '가방' }, { id: 'comms', icon: '💬', name: '통신' },
  { id: 'logs', icon: '📼', name: '로그' }, { id: 'help', icon: '❔', name: '조작법' },
];

export class UI {
  constructor(g) {
    this.g = g;
    this.phoneOpen = false; this.app = 'home';
    this.tuner = null; this.lastMission = -1; this.searchQ = ''; this.searchRes = null;
    this.compass = $('#compass'); this.cctx = this.compass.getContext('2d');
    this.toasts = $('#toasts');
    $('#phHome').innerHTML = APPS.map(a => `<button data-app="${a.id}"><span>${a.icon}</span>${a.name}</button>`).join('');
    $('#phHome').addEventListener('click', e => { const b = e.target.closest('button'); if (b) this.openApp(b.dataset.app); });
    $('#phBack').addEventListener('click', () => this.openApp('home'));
    $('#phClose').addEventListener('click', () => this.togglePhone(false));
    $('#phScreen').addEventListener('click', e => this.onPhoneClick(e));
    $('#phScreen').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'srchIn') this.doSearch(e.target.value); e.stopPropagation(); });
  }

  // ───────── 상태 변경 시 ─────────
  onState(G) {
    const m = MISSIONS[G.mission];
    if (m) {
      $('#mTitle').textContent = `${G.mission + 1}. ${m.title}`;
      $('#mObjs').innerHTML = this.objList(G, m, true);
    } else {
      $('#mTitle').textContent = '탈출 성공'; $('#mObjs').innerHTML = '';
    }
    // 팀
    const ids = Object.keys(G.players);
    $('#team').innerHTML = ids.length > 1 ? ids.map(id => {
      const p = G.players[id], c = G.carry[id];
      return `<div class="tm ${p.down ? 'down' : ''}"><i style="background:${p.color}"></i>${ROLE_INFO[p.role]?.icon || ''} ${esc(p.name)}${id === this.g.myId ? ' (나)' : ''}${p.down ? ' <b>쓰러짐</b>' : ''}${c ? ' ' + ITEMS[c.replace(/\d+$/, '')].icon : ''}</div>`;
    }).join('') : '';
    $('#flareCnt').textContent = G.inv.flare ? `🧨 ×${G.inv.flare} [F]` : '';
    $('#phSig').textContent = G.flags.comms ? '📶 KX-RELAY' : 'NO SERVICE';
    if (this.phoneOpen && this.app !== 'search' && this.app !== 'scanner') this.renderApp();
  }

  objText(o, G) { return Object.keys(G.players).length > 1 || !o.textSolo ? o.text : o.textSolo; }

  objList(G, m, compact) {
    return m.obj.map(o => {
      const key = m.id + '.' + o.id, done = G.od[key], act = G.os[key] && !done;
      if (compact && !done && !act) return '';
      let extra = '';
      if (act && o.type === 'inv') extra = ` <em>${Math.min(o.n, G.inv[o.item] || 0)}/${o.n}</em>`;
      if (act && o.type === 'craft' && o.n > 1) extra = ` <em>${Math.min(o.n, G.crafted[o.item] || 0)}/${o.n}</em>`;
      if (act && o.id === 'extract') extra = ` <em>${Math.floor((G.coreProg || 0) / CORE_NEED * 100)}%</em>`;
      return `<li class="${done ? 'done' : act ? 'act' : 'lock'}">${done ? '✔' : act ? '▸' : '·'} ${esc(this.objText(o, G))}${extra}</li>`;
    }).join('');
  }

  // ───────── 매 프레임 ─────────
  frame(dt) {
    const g = this.g, G = g.G; if (!G) return;
    const t = g.time();
    $('#clock').innerHTML = `${isNight(t) ? '🌙' : t > 0.6 ? '🌇' : '☀️'} <b>${fmtTime(t)}</b> <span>${G.day}일차</span>`;
    $('#stam').style.width = (g.player.stamina * 100) + '%';
    $('#stamWrap').style.opacity = g.player.stamina < 0.99 ? 1 : 0;
    const cd = g.snap?.cd ?? G.countdown;
    $('#countdown').style.display = G.launch && !G.flags.countdown ? 'block' : 'none';
    if (G.launch) $('#countdown').innerHTML = `엔진 예열 <b>${Math.ceil(cd)}</b>`;
    $('#flTag').textContent = g.player.fl ? '🔦 켜짐 [L]' : '🔦 꺼짐 [L]';
    const st = G.storm, stEl = $('#stormTag');
    stEl.style.display = st ? 'block' : 'none';
    if (st) {
      const left = Math.max(0, Math.ceil(st.end - g.hostNow()));
      stEl.textContent = st.phase === 'warn' ? `☣ 포자 폭풍 접근 중 — ${left}초` : `☣ 포자 폭풍 ${left}초 · 지금은 결정 채굴 가능`;
    }
    const be = G.beaconE ?? 1, showBe = G.flags.beaconPlaced && !G.launch && (isNight(t) || be < 0.999);
    $('#beaconBar').style.display = showBe ? 'flex' : 'none';
    if (showBe) {
      $('#beaconFill').style.width = (be * 100) + '%';
      $('#beaconBar').className = be <= 0 ? 'off' : be < 0.3 ? 'low' : '';
      $('#beaconTxt').textContent = be <= 0 ? '방어등 꺼짐!' : `방어등 ${Math.round(be * 100)}%`;
    }
    $('#flTag').className = g.player.fl ? 'on' : '';
    const c = G.carry[g.myId];
    $('#carryTag').textContent = c ? `${ITEMS[c.replace(/\d+$/, '')].icon} ${ITEMS[c.replace(/\d+$/, '')].name} 운반 중 → 함선으로` : '';
    this.drawCompass();
    if (this.tuner) this.updateTuner(dt);
    if (this.phoneOpen && this.app === 'scanner') this.drawScanner();
    // 동기화 장치 상태
    const m = MISSIONS[G.mission];
    const so = m?.obj.find(o => o.type === 'sync' && G.os[m.id + '.' + o.id] && !G.od[m.id + '.' + o.id]);
    if (so) {
      const s = SYNCS[so.sync], now = g.hostNow(), w = Object.keys(G.players).length > 1 ? s.w[1] : s.w[0];
      $('#syncBar').style.display = 'flex';
      $('#syncBar').innerHTML = `<span>${s.name} 동기화</span>` + s.ids.map(id => {
        const ts = G.sync[id], left = ts !== undefined ? w - (now - ts) : -1;
        return `<i class="${left > 0 ? 'on' : ''}">${left > 0 ? left.toFixed(1) + 's' : '대기'}</i>`;
      }).join('');
    } else $('#syncBar').style.display = 'none';
  }

  marks() {
    const g = this.g, G = g.G, out = [];
    const m = MISSIONS[G.mission];
    const carried = new Set(Object.values(G.carry));
    for (const k of m?.marks || []) {
      if (typeof k === 'string') {
        const e = g.byId[k]; if (!e || G.taken[k] || carried.has(k)) continue;
        if (e.kind === 'battery' && G.mission >= 2 && G.od['power.bat'] && G.mission === 2) continue;
        const p = G.moved[k] || e;
        out.push({ x: p.x, z: p.z, label: ITEMS[e.kind]?.name || ({ panel: '수리 패널', lever: '비상 레버', relay: '중계기', pump: '연료 펌프', navst: '항법 콘솔', workbench: '제작대', beaconSlot: '방어등 설치 지점', bed: '침대' })[e.kind] || e.kind, color: '#ffd34d' });
      } else out.push({ ...k, color: '#ffd34d' });
    }
    if (Object.keys(G.carry).includes(g.myId)) out.push({ x: -8, z: 4.5, label: '함선 (운반 목적지)', color: '#5dff8a' });
    out.push({ x: -10, z: 0, label: '함선', color: '#9fd8ff', ship: true });
    for (const p of g.pings) out.push({ x: p.x, z: p.z, label: '📍 ' + p.name, color: p.color, ping: true });
    if (G.flags.comms) for (const e of g.ents) if (e.kind === 'log' && !G.taken[e.id]) out.push({ x: e.x, z: e.z, label: '오리온-3 로그', color: '#5ac8ff', small: true });
    const snap = g.snap?.p || {};
    for (const id in G.players) if (id !== g.myId && snap[id]) out.push({ x: snap[id][0], z: snap[id][2], label: G.players[id].name, color: G.players[id].color, mate: true, down: G.players[id].down });
    return out;
  }

  drawCompass() {
    const c = this.cctx, W = this.compass.width, H = this.compass.height, p = this.g.player;
    c.clearRect(0, 0, W, H);
    const head = -p.yaw, fov = Math.PI * 0.9, px = a => W / 2 + wrap(a - head) / fov * W;
    c.fillStyle = 'rgba(10,8,20,0.45)'; c.fillRect(0, 20, W, 26);
    c.font = 'bold 13px "JetBrains Mono", monospace'; c.textAlign = 'center';
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], kor = { N: '북', E: '동', S: '남', W: '서' };
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, x = px(a);
      if (Math.abs(wrap(a - head)) > fov / 2) continue;
      c.fillStyle = i % 2 ? 'rgba(255,255,255,0.45)' : '#fff';
      c.fillText(kor[dirs[i]] || dirs[i], x, 39);
    }
    for (let i = 0; i < 36; i++) { const a = i * Math.PI / 18; if (Math.abs(wrap(a - head)) > fov / 2) continue; c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(px(a), 21, 1, 5); }
    const labels = [];
    for (const m of this.marks()) {
      const a = Math.atan2(m.x - p.pos.x, -(m.z - p.pos.z)), rel = wrap(a - head);
      const d = Math.hypot(m.x - p.pos.x, m.z - p.pos.z);
      const x = W / 2 + Math.max(-1, Math.min(1, rel / (fov / 2))) * (W / 2 - 8);
      c.fillStyle = m.color;
      if (m.mate) { c.beginPath(); c.arc(x, 33, 4, 0, 7); c.fill(); }
      else if (m.ping) { c.font = '14px sans-serif'; c.fillText('📍', x, 39); }
      else if (m.ship) { c.font = '13px sans-serif'; c.fillText('🚀', x, 39); }
      else { c.beginPath(); c.moveTo(x, 47); c.lineTo(x - 5, 54); c.lineTo(x + 5, 54); c.fill(); }
      if (!m.small && Math.abs(rel) < 0.25 && !labels.some(lx => Math.abs(lx - x) < 110)) {
        labels.push(x);
        c.font = '11px "Noto Sans KR", sans-serif';
        c.fillText(`${m.label} ${Math.round(d)}m`, x, 14);
      }
    }
    c.fillStyle = '#ffd34d'; c.fillRect(W / 2 - 1, 20, 2, 26);
  }

  setPrompt(text, prog = 0, disabled = false) {
    const el = $('#prompt');
    if (!text) { el.style.display = 'none'; return; }
    el.style.display = 'flex'; el.className = disabled ? 'dis' : '';
    $('#promptText').innerHTML = text;
    $('#promptRing').style.setProperty('--p', Math.round(prog * 100));
    $('#promptRing').style.display = prog > 0 ? 'block' : 'none';
  }

  toast(from, text) {
    const d = document.createElement('div');
    d.className = 'toast ' + (from === 'MIRA' ? 'mira' : from === 'SYS' ? 'sys' : from === '함대 본부' ? 'hq' : 'chat');
    d.innerHTML = (from === 'SYS' ? '' : `<b>${esc(from)}</b>`) + esc(text).replace(/\n/g, '<br>');
    this.toasts.appendChild(d);
    while (this.toasts.children.length > 6) this.toasts.firstChild.remove();
    setTimeout(() => d.classList.add('out'), 7000 + text.length * 60);
    setTimeout(() => d.remove(), 8000 + text.length * 60);
    if (this.phoneOpen && this.app === 'comms') this.renderApp();
  }

  banner(title, sub = '') {
    const b = $('#banner');
    b.innerHTML = `<div>${esc(title)}</div>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }

  // ───────── 휴대폰 ─────────
  togglePhone(open = !this.phoneOpen, app) {
    if (!this.g.G?.flags.phone && open) return;
    this.phoneOpen = open;
    $('#phone').classList.toggle('open', open);
    this.g.player.phoneUp = open;
    if (open) { this.g.input.unlock(); this.openApp(app || (this.app === 'home' ? 'home' : this.app)); this.g.audio.tone(1200, 0.05, 'sine', 0.05); }
    else { document.activeElement?.blur?.(); this.g.input.lock(); }
  }

  openApp(id) {
    this.app = id;
    $('#phHome').style.display = id === 'home' ? 'grid' : 'none';
    $('#phScreen').style.display = id === 'home' ? 'none' : 'block';
    $('#phBack').style.visibility = id === 'home' ? 'hidden' : 'visible';
    this.renderApp();
    if (id === 'search') setTimeout(() => $('#srchIn')?.focus(), 50);
  }

  renderApp() {
    const g = this.g, G = g.G, el = $('#phScreen');
    if (!G) return;
    switch (this.app) {
      case 'home': return;
      case 'mission': {
        const m = MISSIONS[G.mission];
        el.innerHTML = m ? `<h3>미션 ${G.mission + 1} / ${MISSIONS.length}</h3><h2>${esc(m.title)}</h2><ul class="objs">${this.objList(G, m, false)}</ul>
          ${m.hint ? `<p class="hint">💡 추천 검색어: <b>${esc(m.hint)}</b></p>` : ''}
          <p class="hint">위쪽 나침반의 ▼ 표시가 목표 방향이에요.</p>` : '<h2>탈출 성공</h2>';
        break;
      }
      case 'scanner':
        el.innerHTML = `<h3>스캐너</h3><canvas id="scan" width="300" height="300"></canvas>
          <p class="hint">${G.flags.power ? '노랑 = 목표 · 파랑 = 로그 · 점 = 대원' : '⚠ 전력 부족 — 지역 지도만 표시됩니다.'}</p>`;
        this.drawScanner();
        break;
      case 'search': {
        el.innerHTML = `<h3>ARK-PEDIA <small>오프라인 백과사전</small></h3>
          <div class="srch"><input id="srchIn" placeholder="예: 연료, 물, 밤…" value="${esc(this.searchQ)}" autocomplete="off"><button data-act="search">검색</button></div>
          <div id="srchRes"></div>`;
        this.renderSearch();
        break;
      }
      case 'craft': {
        const near = g.nearWorkbench();
        el.innerHTML = `<h3>제작 ${near ? '<span class="ok">● 제작대 연결됨</span>' : '<span class="no">○ 제작대 근처에서만 제작 가능</span>'}</h3>` +
          RECIPE_ORDER.map(k => {
            const r = RECIPES[k], un = !r.unlock || G.search[r.unlock];
            if (!un) return `<div class="rec lock"><b>??? </b><small>[검색]으로 제작법을 찾아야 해요</small></div>`;
            const cost = Object.entries(r.cost).map(([i, n]) => `<span class="${(G.inv[i] || 0) >= n ? 'ok' : 'no'}">${ITEMS[i].icon}${ITEMS[i].name} ${G.inv[i] || 0}/${n}</span>`).join(' ');
            const tool = r.tool ? `<span class="${G.inv[r.tool] > 0 ? 'ok' : 'no'}">🔧${ITEMS[r.tool].name} 필요</span>` : '';
            const can = near && Object.entries(r.cost).every(([i, n]) => (G.inv[i] || 0) >= n) && (!r.tool || G.inv[r.tool] > 0);
            return `<div class="rec"><b>${ITEMS[r.out].icon} ${ITEMS[r.out].name}${r.n > 1 ? ' ×' + r.n : ''}</b><div>${cost} ${tool}</div><button data-act="craft" data-r="${k}" ${can ? '' : 'disabled'}>만들기</button></div>`;
          }).join('');
        break;
      }
      case 'bag': {
        const items = Object.entries(G.inv).filter(([, n]) => n > 0);
        el.innerHTML = `<h3>팀 공용 가방 <small>(드론 연동)</small></h3><div class="bag">${items.length ? items.map(([k, n]) => `<div><span>${ITEMS[k].icon}</span>${ITEMS[k].name}<b>${n}</b></div>`).join('') : '<p class="hint">비어 있음</p>'}</div>
          <h3>함선 부품 현황</h3><ul class="objs">
          <li class="${G.inv.navchip || G.flags.installed ? 'done' : ''}">💾 항법 칩</li>
          <li class="${(G.inv.hull || 0) >= 3 || G.flags.installed ? 'done' : ''}">🛡️ 선체 판 ${G.flags.installed ? 3 : Math.min(3, G.inv.hull || 0)}/3</li>
          <li class="${G.flags.antennaHome ? 'done' : ''}">📡 통신 안테나</li>
          <li class="${G.inv.fuelcell || G.flags.installed ? 'done' : ''}">⚗️ 연료 셀 <small>(대체품 필요)</small></li>
          <li class="${G.inv.coil || G.flags.installed ? 'done' : ''}">🌀 냉각 코일 <small>(대체품 필요)</small></li>
          <li class="${G.flags.coreHome ? 'done' : ''}">🔮 전력 코어 <small>(대체품 필요)</small></li></ul>`;
        break;
      }
      case 'comms':
        el.innerHTML = `<h3>통신 기록</h3><div class="log">${g.log.slice(-60).reverse().map(m => `<p class="${m.from === 'MIRA' ? 'mira' : m.from === 'SYS' ? 'sys' : ''}"><b>${esc(m.from)}</b> ${esc(m.text).replace(/\n/g, '<br>')}</p>`).join('')}</div>`;
        break;
      case 'logs':
        el.innerHTML = `<h3>오리온-3 데이터 로그 (${Object.keys(G.logs).length}/5)</h3>` + Object.keys(LOGS).map(k => G.logs[k]
          ? `<div class="rec"><b>📼 ${LOGS[k].title}</b><p>${esc(LOGS[k].text)}</p></div>`
          : `<div class="rec lock"><b>📼 ???</b><small>${G.flags.comms ? '스캐너에 위치가 표시돼요' : '신호 없음'}</small></div>`).join('');
        break;
      case 'help':
        el.innerHTML = `<h3>조작법</h3><table class="keys">
          <tr><td>WASD</td><td>이동</td></tr><tr><td>Shift</td><td>달리기</td></tr><tr><td>C / Ctrl</td><td>웅크리기 (발각 ↓)</td></tr>
          <tr><td>Space</td><td>점프</td></tr><tr><td>E (길게)</td><td>줍기 / 사용</td></tr><tr><td>Tab</td><td>휴대폰</td></tr>
          <tr><td>L</td><td>손전등 (밤엔 위험!)</td></tr><tr><td>F</td><td>UV 조명탄 던지기</td></tr><tr><td>Q / 우클릭</td><td>핑 — 보는 곳을 팀에게 표시</td></tr><tr><td>V</td><td>1인칭 / 3인칭</td></tr>
          <tr><td>Enter</td><td>채팅</td></tr><tr><td>Esc</td><td>일시정지 / 초대 링크</td></tr></table>
          ${g.input.touch ? '<h3>📱 터치 조작</h3><p class="hint">왼쪽 아래를 엄지로 누르면 조이스틱이 생겨요 (끝까지 밀면 달리기). 오른쪽 화면을 드래그하면 시점이 돌아가요. 화면 가운데 안내 버튼(또는 E 버튼)을 누르고 있으면 줍기/사용.</p>' : ''}
          <p class="hint">외계 생물은 손전등, 달리기, 빛나는 물건에 끌려요. 웅크리면 덜 들켜요.</p>
          <h3>내 역할: ${ROLE_INFO[g.role()].icon} ${ROLE_INFO[g.role()].name}</h3><p class="hint">${ROLE_INFO[g.role()].desc}</p>`;
        break;
    }
  }

  renderSearch() {
    const box = $('#srchRes'); if (!box) return;
    const G = this.g.G, m = MISSIONS[G.mission];
    if (this.searchRes === null) {
      const chips = (m?.hint || '연료, 물, 냉각, 전력, 밤').split(', ');
      box.innerHTML = `<p class="hint">통신이 끊겨 오프라인 백과사전만 쓸 수 있어요. 추천 검색어:</p><div class="chips">${chips.map(c => `<button data-act="chip" data-q="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
      return;
    }
    if (!this.searchRes.length) {
      box.innerHTML = `<p class="hint">"${esc(this.searchQ)}"에 대한 결과가 없습니다.<br>다른 단어로 찾아보세요: 연료, 물, 냉각, 전력, 밤, 안테나…</p>`;
      return;
    }
    box.innerHTML = this.searchRes.map(s => `<div class="res"><b>${esc(s.title)}</b><p>${esc(s.body).replace(/\n/g, '<br>')}</p></div>`).join('');
  }

  doSearch(q) {
    this.searchQ = q;
    this.searchRes = searchDB(q);
    for (const s of this.searchRes) this.g.req({ a: 'search', key: s.key });
    this.renderSearch();
    this.g.audio.tone(900, 0.05, 'sine', 0.06);
  }

  onPhoneClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'search') this.doSearch($('#srchIn').value);
    if (b.dataset.act === 'chip') { $('#srchIn').value = b.dataset.q; this.doSearch(b.dataset.q); }
    if (b.dataset.act === 'craft') this.g.req({ a: 'craft', r: b.dataset.r });
  }

  drawScanner() {
    const cv = $('#scan'); if (!cv) return;
    const c = cv.getContext('2d'), g = this.g, G = g.G, S = 300 / 600, X = x => 150 + x * S, Z = z => 150 + z * S;
    c.fillStyle = '#05121a'; c.fillRect(0, 0, 300, 300);
    c.strokeStyle = 'rgba(80,220,255,0.12)';
    for (let i = 0; i <= 300; i += 25) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 300); c.moveTo(0, i); c.lineTo(300, i); c.stroke(); }
    c.font = '10px "Noto Sans KR", sans-serif'; c.textAlign = 'center';
    for (const r of REGIONS) {
      c.fillStyle = r.color + '22'; c.strokeStyle = r.color + '88';
      c.beginPath(); c.arc(X(r.p.x), Z(r.p.z), r.r * S, 0, 7); c.fill(); c.stroke();
      c.fillStyle = r.color; c.fillText(r.name, X(r.p.x), Z(r.p.z) + 3);
    }
    c.fillStyle = '#9fd8ff'; c.fillRect(X(-28), Z(-3), 34 * S, 6 * S + 1); c.fillText('함선', X(-10), Z(-8));
    if (G.flags.beaconPlaced) { c.strokeStyle = '#b06bff'; c.beginPath(); c.arc(X(0), Z(0), 24 * S, 0, 7); c.stroke(); }
    const blink = Math.sin(performance.now() / 200) > 0;
    if (G.flags.power) for (const m of this.marks()) {
      if (m.ship) continue;
      c.fillStyle = m.color;
      if (m.mate) { c.beginPath(); c.arc(X(m.x), Z(m.z), 4, 0, 7); c.fill(); continue; }
      if (blink || m.small) { c.beginPath(); c.arc(X(m.x), Z(m.z), m.small ? 2.5 : 4, 0, 7); c.fill(); }
    }
    const p = g.player;
    c.save(); c.translate(X(p.pos.x), Z(p.pos.z)); c.rotate(-p.yaw);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 5); c.lineTo(-5, 5); c.fill(); c.restore();
    c.fillStyle = '#fff'; c.fillText('N', 150, 11);
  }

  // ───────── 주파수 튜너 ─────────
  openTuner(id) {
    const base = id === 'relayA' ? { f: 2.2, a: 0.6, s: 1 } : { f: 3.4, a: 0.85, s: 2.5 };
    this.tuner = { id, base, f: 1 + Math.random() * 4, a: 0.2 + Math.random() * 0.3, lock: 0, send: 0, done: 0, age: 0 };
    $('#tuner').classList.add('open');
    this.g.player.locks.add('tuner');
  }
  closeTuner() {
    if (!this.tuner) return;
    this.tuner = null;
    $('#tuner').classList.remove('open');
    this.g.player.locks.delete('tuner');
    this.g.audio.hum(false);
  }
  updateTuner(dt) {
    const T = this.tuner, I = this.g.input, G = this.g.G, now = this.g.hostNow();
    // 연 순간의 E 입력이 곧바로 닫기로 처리되지 않도록 잠깐 무시
    T.age += dt;
    if (T.age > 0.3 && (I.hit('KeyE') || I.hit('Escape') || I.hit('Tab'))) return this.closeTuner();
    if (I.down('KeyA') || I.down('ArrowLeft')) T.f -= dt * 1.1;
    if (I.down('KeyD') || I.down('ArrowRight')) T.f += dt * 1.1;
    if (I.down('KeyW') || I.down('ArrowUp')) T.a += dt * 0.5;
    if (I.down('KeyS') || I.down('ArrowDown')) T.a -= dt * 0.5;
    T.f += I.wheel * 0.04;
    T.f = Math.max(1, Math.min(5, T.f)); T.a = Math.max(0.15, Math.min(1, T.a));
    const tf = T.base.f + Math.sin(now * 0.35 + T.base.s) * 0.35, ta = T.base.a + Math.sin(now * 0.5 + T.base.s) * 0.08;
    const err = Math.abs(T.f - tf) / 4 + Math.abs(T.a - ta) / 0.85;
    const match = err < (this.g.role() === 'engineer' ? 0.075 : 0.045);
    T.lock = Math.max(0, Math.min(1, T.lock + (match ? dt / 1.0 : -dt / 0.7)));
    const done = G.flags.sync_relays;
    if (T.lock >= 1 && !done) { T.send -= dt; if (T.send <= 0) { T.send = 0.4; this.g.req({ a: 'sync', id: T.id }); } }
    if (done) { T.done += dt; if (T.done > 1.6) return this.closeTuner(); }
    this.g.audio.hum(true, T.f, tf);
    // 그리기
    const cv = $('#tunerCv'), c = cv.getContext('2d'), W = cv.width, H = cv.height;
    c.fillStyle = '#04141a'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(80,220,255,0.15)'; for (let x = 0; x < W; x += 30) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    const wave = (f, a, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); for (let x = 0; x <= W; x += 3) { const y = H / 2 - Math.sin(x / W * f * Math.PI * 2 + now * 3) * a * H * 0.42; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); };
    wave(tf, ta, 'rgba(255,90,60,0.9)', 3);
    wave(T.f, T.a, match ? '#3dff8a' : '#6fe3ff', 2);
    $('#tunerInfo').innerHTML = done ? '<b class="ok">✔ 두 중계기 연결 완료!</b>'
      : T.lock >= 1 ? `<b class="ok">신호 고정 — 유지하세요!</b> ${Object.keys(G.players).length > 1 ? '다른 중계기도 동시에 고정돼야 해요' : '이제 다른 중계기로!'}`
      : `주파수 ${T.f.toFixed(2)} · 진폭 ${T.a.toFixed(2)} · 일치도 ${Math.max(0, Math.round((1 - err * 4) * 100))}%`;
    $('#tunerLock').style.width = (T.lock * 100) + '%';
  }

  showEnding(G, log) {
    const mins = Math.round(((G.stats.end || Date.now()) - G.stats.start) / 60000);
    const logs = Object.keys(G.logs).length;
    const crew = Object.values(G.players).map(p => esc(p.name)).join(', ');
    $('#ending').innerHTML = `<div class="end-in">
      <h1>탈출 성공</h1>
      <p>아르카디아 7호가 보랏빛 하늘을 찢고 솟아올랐다.<br>창밖 아래, 수백 개의 붉은 눈이 우리를 올려다보고 있었다.</p>
      <p>${logs >= 5 ? '오리온-3의 기록 다섯 개가 함대 본부로 전송되었다.<br>그들은 잊히지 않을 것이다.' : '녹턴 어딘가에는, 아직 아무도 읽지 않은 기록이 남아 있다…'}</p>
      <div class="stats"><div><b>${crew}</b><span>생존 대원</span></div><div><b>${mins}분</b><span>플레이 시간</span></div><div><b>${G.day}일</b><span>녹턴에서 보낸 날</span></div><div><b>${G.stats.downs}회</b><span>쓰러짐</span></div><div><b>${logs}/5</b><span>오리온-3 로그</span></div></div>
      <button onclick="location.href=location.pathname">타이틀로</button></div>`;
    $('#ending').classList.add('show');
  }
}
