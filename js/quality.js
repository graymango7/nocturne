// 그래픽 품질 단계 — 옛날 아이폰에서도 돌아가도록 기기에 맞춰 자동 선택
import * as THREE from 'three';
import { IS_TOUCH } from './touch.js';

const KEY = 'nocturne-quality';
let pref = 'auto';
try { pref = new URLSearchParams(location.search).get('q') || localStorage.getItem(KEY) || 'auto'; } catch {}
export const QUALITY_PREF = pref;

// 아이폰 Safari는 메모리 정보를 주지 않으므로 폰은 기본 '낮음'에서 시작하고, 프레임이 남으면 해상도만 올린다
function autoTier() {
  if (!IS_TOUCH) return 'high';
  return (navigator.deviceMemory || 0) >= 6 ? 'mid' : 'low';
}
export const TIER = ['low', 'mid', 'high'].includes(pref) ? pref : autoTier();
export const TIER_NAME = { low: '낮음', mid: '보통', high: '높음' };

const TABLE = {
  // lambert: 빛 계산이 훨씬 싼 재질 / lights: 보조 조명(방어등·조명탄 등)을 실제 광원으로 쓸지
  low: { dprMin: 0.55, dprMax: 1.0, shadows: false, lambert: true, lights: false, grass: 700, decor: 0.6, cull: 110, far: 900, aa: false, nebula: false },
  mid: { dprMin: 0.7, dprMax: 1.4, shadows: false, lambert: true, lights: true, grass: 1600, decor: 0.85, cull: 170, far: 1300, aa: false, nebula: true },
  high: { dprMin: 0.85, dprMax: 1.75, shadows: true, lambert: false, lights: true, grass: 3200, decor: 1, cull: 1e9, far: 1600, aa: true, nebula: true },
};
export const Q = TABLE[TIER];

export function saveQualityPref(v) { try { localStorage.setItem(KEY, v); } catch {} }

// 품질에 따라 Standard(물리 기반) ↔ Lambert(가벼움) 재질을 만든다
export function mat(o) {
  if (!Q.lambert) return new THREE.MeshStandardMaterial(o);
  const { roughness, metalness, ...rest } = o;
  return new THREE.MeshLambertMaterial(rest);
}

let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const cx = cv.getContext('2d'), g = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = g; cx.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(cv);
  return glowTex;
}

// 실제 광원 대신 쓰는 가짜 빛 번짐 (거의 공짜)
export function glowSprite(color, size, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  return s;
}

let blobTex = null;
// 그림자 맵이 꺼진 단계에서 캐릭터 발밑에 까는 동그란 그림자
export function blobShadow(size) {
  if (!blobTex) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const cx = cv.getContext('2d'), g = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    cx.fillStyle = g; cx.fillRect(0, 0, 64, 64);
    blobTex = new THREE.CanvasTexture(cv);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.04; m.renderOrder = 1;
  return m;
}
