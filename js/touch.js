// 모바일 터치 조작 — 로블록스식: 왼쪽 썸스틱(닿은 곳에 생김), 오른쪽 드래그 카메라, 오른쪽 아래 큰 점프 버튼
export const IS_TOUCH = new URLSearchParams(location.search).has('touch') ||
  (matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0);

export function setupTouch(input, hooks) {
  document.body.classList.add('touch');
  const root = document.querySelector('#touch');
  const stick = document.querySelector('#stick'), knob = document.querySelector('#knob');
  const R = 56;
  let stickId = null, sx = 0, sy = 0, lookId = null, lx = 0, ly = 0;

  // 화면을 돌려 그리는 중이면 손가락 좌표도 같이 돌려서 계산
  const pt = t => document.body.classList.contains('force-land') ? { x: t.clientY, y: innerWidth - t.clientX } : { x: t.clientX, y: t.clientY };
  const viewW = () => document.body.classList.contains('force-land') ? innerHeight : innerWidth;
  const isButton = el => el && el.closest('[data-vkey],[data-vtap],[data-act],[data-toggle]');
  root.addEventListener('touchstart', e => {
    for (const t of e.changedTouches) {
      if (isButton(t.target)) continue;
      const p = pt(t);
      if (p.x < viewW() * 0.42 && stickId === null) {
        stickId = t.identifier; sx = p.x; sy = p.y;
        stick.style.left = sx + 'px'; stick.style.top = sy + 'px'; stick.classList.add('on');
      } else if (lookId === null) {
        lookId = t.identifier; lx = p.x; ly = p.y;
      }
    }
    e.preventDefault();
  }, { passive: false });
  root.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      const p = pt(t);
      if (t.identifier === stickId) {
        let dx = p.x - sx, dy = p.y - sy;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx *= R / d; dy *= R / d; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        input.axis.x = dx / R; input.axis.y = -dy / R;
      } else if (t.identifier === lookId) {
        input.look((p.x - lx) * 2.2, (p.y - ly) * 2.2);
        lx = p.x; ly = p.y;
      }
    }
    e.preventDefault();
  }, { passive: false });
  const end = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) {
        stickId = null; input.axis.x = input.axis.y = 0;
        knob.style.transform = ''; stick.classList.remove('on'); stick.style.left = stick.style.top = '';
      }
      if (t.identifier === lookId) lookId = null;
    }
  };
  root.addEventListener('touchend', end);
  root.addEventListener('touchcancel', end);

  // 버튼: data-vkey = 누르는 동안 키, data-vtap = 한 번 탭, data-toggle = 켜기/끄기, data-act = 직접 호출
  const bind = (el, down, up) => {
    el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); el.classList.add('on'); down(); }, { passive: false });
    const u = e => { e.preventDefault(); e.stopPropagation(); el.classList.remove('on'); up?.(); };
    el.addEventListener('touchend', u, { passive: false }); el.addEventListener('touchcancel', u, { passive: false });
  };
  for (const el of document.querySelectorAll('[data-vkey]')) bind(el, () => input.vdown(el.dataset.vkey), () => input.vup(el.dataset.vkey));
  for (const el of document.querySelectorAll('[data-vtap]')) bind(el, () => input.vtap(el.dataset.vtap));
  for (const el of document.querySelectorAll('[data-act]')) bind(el, () => hooks[el.dataset.act]?.());
  for (const el of document.querySelectorAll('[data-toggle]')) {
    bind(el, () => {
      const k = el.dataset.toggle, on = !input.keys.has(k);
      if (on) input.keys.add(k); else input.keys.delete(k);
      el.classList.toggle('latched', on);
    });
  }
}

// 아이폰 Safari는 웹페이지 전체화면 API를 막아 두었다 → "홈 화면에 추가"로 설치하면 전체화면으로 실행된다
export const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const IS_STANDALONE = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;
const el = document.documentElement;
export const CAN_FULLSCREEN = !!(el.requestFullscreen || el.webkitRequestFullscreen);
export const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement) || IS_STANDALONE;

function enter() {
  try {
    const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.();
    p?.then?.(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  } catch {}
}

// 게임 시작 시 모바일만 자동으로 전체화면
export function goFullscreen() {
  if (IS_TOUCH && !isFullscreen()) enter();
}

export function toggleFullscreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch {}
  } else enter();
}
