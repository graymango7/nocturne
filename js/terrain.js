// 지형/좌표 공용 함수 — 호스트와 모든 클라이언트가 같은 결과를 내도록 시드를 고정한다.
export const SEED = 7331;
export const HALF = 340;

// 주요 지역 (북 = -z, 동 = +x)
export const P = {
  RIDGE: { x: -170, z: 20 },    // 서쪽 능선
  LAKE: { x: 20, z: 175 },      // 남쪽 호수
  CRYSTAL: { x: 15, z: -175 },  // 북쪽 결정 평원
  FOREST: { x: 175, z: 15 },    // 동쪽 버섯 숲
  NEST: { x: 150, z: -150 },    // 북동쪽 둥지
  RESIN: { x: -115, z: 125 },   // 남서쪽 호박나무 숲
  HILL: { x: 60, z: -40 },      // 중계 언덕
};

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(x, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263) + SEED) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, z, oct = 5) {
  let s = 0, amp = 1, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, z * f); n += amp; amp *= 0.5; f *= 2.03; }
  return s / n;
}

export function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const gauss = (d, s) => Math.exp(-(d * d) / (2 * s * s));

export function height(x, z) {
  let h = (fbm(x * 0.007, z * 0.007) - 0.5) * 36 + (fbm(x * 0.035 + 50, z * 0.035 - 20, 3) - 0.5) * 5;
  h += 48 * gauss(Math.hypot(x - P.RIDGE.x, (z - P.RIDGE.z) * 0.55), 40);
  h += 12 * gauss(Math.hypot(x - P.HILL.x, z - P.HILL.z), 13);
  h -= 16 * gauss(Math.hypot(x - P.LAKE.x, z - P.LAKE.z), 42);
  const dn = Math.hypot(x - P.NEST.x, z - P.NEST.z);
  h += -7 * gauss(dn, 20) + 5 * gauss(dn - 30, 6);
  h *= smooth(16, 48, Math.hypot(x, z)); // 추락 지점은 평평하게
  const e = Math.max(Math.abs(x), Math.abs(z));
  if (e > 270) h += ((e - 270) / 70) ** 2 * 70; // 맵 가장자리 산맥
  return h;
}

export const WATER_Y = height(P.LAKE.x, P.LAKE.z) + 7;
export const inLake = (x, z) => Math.hypot(x - P.LAKE.x, z - P.LAKE.z) < 110 && height(x, z) < WATER_Y;
