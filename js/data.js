// 게임 데이터: 아이템, 제작법, 검색 백과사전, 미션, 월드 엔티티
import { P, SEED, height, mulberry32, WATER_Y, inLake } from './terrain.js';

export const GAME = { title: 'NOCTURNE', dest: '케플러-442b', planet: 'KX-9 "녹턴"', ship: '아르카디아 7호' };

export const ITEMS = {
  fiber: { name: '섬유 식물', icon: '🌿' },
  moss: { name: '발광 이끼', icon: '🍄' },
  crystal: { name: '공명 결정', icon: '💎' },
  resin: { name: '호박빛 수지', icon: '🟠' },
  chitin: { name: '키틴 껍질', icon: '🐚' },
  water: { name: '오염된 물', icon: '💧' },
  purewater: { name: '정제수', icon: '🚰' },
  battery: { name: '배터리 팩', icon: '🔋' },
  filter: { name: '정수 필터', icon: '🧪' },
  flare: { name: 'UV 조명탄', icon: '🧨' },
  beacon: { name: 'UV 방어등', icon: '🗼' },
  fuelcell: { name: '바이오 연료 셀', icon: '⚗️' },
  coil: { name: '결정 냉각 코일', icon: '🌀' },
  navchip: { name: '항법 칩', icon: '💾' },
  hull: { name: '선체 판', icon: '🛡️' },
  core: { name: '둥지 핵', icon: '🔮' },
  antenna: { name: '통신 안테나', icon: '📡' },
  phone: { name: '휴대폰', icon: '📱' },
  log: { name: '데이터 로그', icon: '📼' },
};

// 들고 옮기는 물건 (heavy = 달리기 불가, 느려짐)
export const ROLE_INFO = {
  scout: { icon: '🏃', name: '정찰병', desc: '달리기 더 빠르고 오래, 외계 생물에게 덜 들킴' },
  engineer: { icon: '🔧', name: '엔지니어', desc: '채집·채굴이 거의 2배 빠름, 주파수 튜닝이 쉬움' },
  medic: { icon: '⛑️', name: '의무병', desc: '쓰러진 동료를 1초 만에 일으킴' },
};

export const CARRY = { antenna: { heavy: true }, core: { heavy: false } };

// 줍기/채집 시간(초)과 동사
export const PICK = {
  fiber: { verb: '채집', t: 0.6 }, moss: { verb: '채집', t: 0.8 }, crystal: { verb: '채굴', t: 1.8 },
  resin: { verb: '채취', t: 1.2 }, chitin: { verb: '줍기', t: 0.6 }, water: { verb: '물 뜨기', t: 1.0 },
  battery: { verb: '줍기', t: 0.5 }, navchip: { verb: '줍기', t: 0.5 }, hull: { verb: '줍기', t: 0.7 },
  log: { verb: '재생', t: 0.4 }, phone: { verb: '줍기', t: 0.3 }, antenna: { verb: '들기', t: 1.0 }, core: { verb: '들기', t: 0.5 },
};

export const RECIPE_ORDER = ['beacon', 'filter', 'purewater', 'fuelcell', 'coil', 'flare'];
export const RECIPES = {
  beacon: { out: 'beacon', n: 1, cost: { fiber: 4, battery: 1 }, unlock: 'night' },
  filter: { out: 'filter', n: 1, cost: { fiber: 2, resin: 1 }, unlock: 'water' },
  purewater: { out: 'purewater', n: 1, cost: { water: 1 }, tool: 'filter', unlock: 'water' },
  fuelcell: { out: 'fuelcell', n: 1, cost: { moss: 4, purewater: 2 }, unlock: 'fuel' },
  coil: { out: 'coil', n: 1, cost: { crystal: 3, resin: 2 }, unlock: 'cool' },
  flare: { out: 'flare', n: 2, cost: { chitin: 1, moss: 1 }, unlock: 'power' },
};

// 휴대폰 오프라인 백과사전 "ARK-PEDIA"
export const SEARCH = [
  { key: 'night', words: ['밤', '외계', '괴물', '생물', '빛', '조명', '방어', '안전', '몬스터', '야행', 'night', 'alien'],
    title: 'KX-9 야행성 생물 — 생태 스캔 요약',
    body: '궤도 스캔에 따르면 이 행성의 대형 생물은 야행성이다. 강한 자외선(UV)을 극도로 싫어하지만, 손전등 같은 가시광선과 발소리에는 오히려 끌린다.\n\n▶ 제작법 해금: UV 방어등 (섬유 식물 ×4 + 배터리 팩 ×1)\n방어등 반경 안쪽은 밤에도 안전하다.' },
  { key: 'fuel', words: ['연료', 'fuel', '추진', '에너지원', '바이오', '기름', '셀'],
    title: '대체 연료 — 현지 재료로 바이오 연료 만들기',
    body: '연료 셀이 파손되었다면: 동쪽 버섯 숲의 "발광 이끼"는 고밀도 인광 지질을 품고 있다. 정제수와 반응시키면 임시 바이오 연료가 된다. 이끼는 밤에 더 밝게 빛나 찾기 쉽다.\n\n▶ 제작법 해금: 바이오 연료 셀 (발광 이끼 ×4 + 정제수 ×2)\n※ 정제수 만드는 법은 "물"로 검색' },
  { key: 'water', words: ['물', '정수', '정제', 'water', '식수', '호수', '필터'],
    title: '오염수 정화 — 간이 필터',
    body: '남쪽 호수의 물은 금속 이온으로 오염되어 있다. 섬유질과 호박빛 수지로 간이 필터를 만들 수 있다. 필터는 닳지 않는다.\n\n▶ 제작법 해금: 정수 필터 (섬유 ×2 + 수지 ×1)\n▶ 제작법 해금: 정제수 (오염된 물 ×1, 필터 필요)\n※ 수지는 남서쪽 호박나무 숲에서 채취.' },
  { key: 'cool', words: ['냉각', '쿨링', 'coolant', '코일', '엔진', '과열', '열', '온도'],
    title: '엔진 냉각 코일 대체품',
    body: '북쪽 결정 평원의 "공명 결정"은 극저온 특성을 가진다. 단, 낮에는 햇빛을 흡수해 과열 상태라 손댈 수 없다 — 반드시 밤에 채굴할 것.\n\n▶ 제작법 해금: 결정 냉각 코일 (공명 결정 ×3 + 수지 ×2)\n※ 낮을 건너뛰려면 모든 대원이 조종실 침대에서 함께 휴식.' },
  { key: 'power', words: ['전력', '코어', '에너지', 'power', 'core', '동력', '핵', '발전', '조명탄', 'flare'],
    title: '고에너지원 — "둥지 핵"',
    body: '파손된 전력 코어를 대체할 수 있는 건 이 행성에 단 하나: 북동쪽 외계 생물 둥지 중심의 생체 에너지 결정이다. 낮에는 경비 개체가 잠들어 있지만, 추출 진동에 깨어난다.\n\n▶ 제작법 해금: UV 조명탄 ×2 (키틴 껍질 ×1 + 발광 이끼 ×1)\n[F]로 던지면 주변 생물이 달아난다. 키틴 껍질은 둥지 주변에 흩어져 있다.' },
  { key: 'storm', words: ['폭풍', '포자', '먼지', '바람', 'storm', '날씨'],
    title: '포자 폭풍', body: '녹턴의 낮에는 가끔 거대한 포자 구름이 몰려온다. 폭풍 속에선 시야가 10m 이하로 떨어지고, 어둠을 틈타 야행성 개체가 깨어난다.\n단, 폭풍의 냉기는 결정 평원의 공명 결정을 식힌다 — 폭풍 중엔 낮에도 결정 채굴이 가능하다.' },
  { key: 'screamer', words: ['울보', '비명', '소리', '울음', '우는', 'screamer'],
    title: '"울보" 개체', body: '직접 공격하지 않는 정찰 개체. 대원을 발견하면 멈춰 서서 길게 울어 70m 안의 개체를 모두 불러 모은다.\n다른 개체와 반대로 가시광선을 두려워한다 — 손전등을 정면으로 비추면 달아난다. 조명탄에도 달아난다.' },
  { key: 'hull', words: ['선체', 'hull', '장갑'], title: '선체 판', body: '충돌 때 선체 판 3장이 떨어져 나갔다. 스캐너에 세 군데 신호가 잡힌다. 부품 위로 빛 기둥이 솟아 있다.' },
  { key: 'nav', words: ['항법', 'navigation', '칩', '좌표', '지도'], title: '항법 칩', body: '항법 칩 신호: 북쪽 결정 평원. 칩만 줍는 건 낮에도 가능하다.' },
  { key: 'antenna', words: ['안테나', '통신', '신호', '전파', 'sos', '구조'], title: '통신 안테나', body: '통신 안테나는 서쪽 능선 꼭대기까지 날아갔다. 무거워서 들고 있는 동안 달릴 수 없다. 설치 후 중계기 2대의 주파수를 동시에 맞춰야 한다.' },
  { key: 'planet', words: ['녹턴', 'kx', '행성', '여기', '어디'], title: 'KX-9 "녹턴"', body: '공식 명칭 KX-9. 보랏빛 대기, 고리를 가진 가스 행성의 위성. 자전 주기가 짧고 밤이 길다. 12년 전 탐사선 1척이 연락 두절된 기록이 있다.' },
  { key: 'orion', words: ['오리온', 'orion', '탐사선', '실종'], title: '탐사선 오리온-3', body: '12년 전 KX-9 조사 임무 중 연락이 끊긴 탐사선. 대원 6명. 공식 기록: 전원 사망 추정.\n이 행성 곳곳에서 오리온-3 주파수의 데이터 로그 신호가 감지된다.' },
  { key: 'home', words: ['집', '엄마', '지구', 'home', '가족', '귀환'], title: '지구까지의 거리', body: '1,402 광년. 예상 도보 시간: 계산 불가.\n…일단 우주선부터 고치자.' },
  { key: 'food', words: ['맛집', '음식', '배고파', '밥', '먹', '라면', '치킨'], title: '주변 맛집 0곳', body: '발광 이끼는 먹지 마시오. 먹으면 밤새 밝게 빛나게 되며, 그건 이 행성에서 매우 나쁜 일이다.' },
  { key: 'wifi', words: ['와이파이', 'wifi', '인터넷', '유튜브', '구글'], title: '오프라인 모드', body: '네트워크 없음. ARK-PEDIA 로컬 백과사전만 사용 가능합니다.\n추천 검색어: 연료, 물, 냉각, 전력, 밤' },
];

export function searchDB(q) {
  q = (q || '').trim().toLowerCase();
  if (!q) return [];
  return SEARCH.filter(s => s.words.some(w => q.includes(w) || (q.length >= 2 && w.includes(q))));
}

// 동시 수행 장치: w[0] = 혼자일 때 허용 간격(초), w[1] = 2인 이상일 때
export const SYNCS = {
  levers: { ids: ['leverA', 'leverB'], w: [10, 1.5], name: '비상 레버' },
  relays: { ids: ['relayA', 'relayB'], w: [50, 1.5], name: '중계기' },
  ignite: { ids: ['pump', 'navst'], w: [12, 2], name: '점화 스테이션' },
};

export const LOGS = {
  log1: { title: '오리온-3 일지 #1', text: '착륙 성공. 하늘이 보랏빛이다. 대장은 이곳이 우리의 새 집이 될 거라고 했다. 모두 웃었다.' },
  log2: { title: '오리온-3 일지 #2', text: '밤마다 무언가가 캠프 주위를 돈다. 손전등을 비추면 사라지는 게 아니라… 더 가까이 온다.' },
  log3: { title: '오리온-3 일지 #3', text: '결정 평원에서 노랫소리 같은 게 들린다. 결정끼리 공명하는 것 같다. 낮에 만졌다가 장갑이 녹았다.' },
  log4: { title: '오리온-3 일지 #4', text: '그것들은 짐승이 아니다. 둥지 핵을 중심으로 서로 신호를 주고받는다. 우리가 핵에 손을 댄 날, 모두가 깨어났다.' },
  log5: { title: '오리온-3 일지 #5 (마지막)', text: '이제 나 혼자다. 이걸 읽는 누군가에게: 해가 뜨기 전에 떠나라. 그리고… 우리를 기억해 줘. — 대원 한서윤' },
};

export const REGIONS = [
  { p: P.CRYSTAL, name: '결정 평원', color: '#6fd8ff', r: 55 },
  { p: P.FOREST, name: '버섯 숲', color: '#7dffb0', r: 60 },
  { p: P.LAKE, name: '호수', color: '#3d9bd6', r: 55 },
  { p: P.RIDGE, name: '서쪽 능선', color: '#c8b8e0', r: 50 },
  { p: P.NEST, name: '둥지', color: '#ff4d6d', r: 45 },
  { p: P.RESIN, name: '호박나무 숲', color: '#ffae3d', r: 40 },
  { p: P.HILL, name: '중계 언덕', color: '#e0e0e0', r: 15 },
];

const M = (x, z, label) => ({ x, z, label });

// 미션: obj.type = flag | inv | craft | search | sync | reach | survive | allin
// req = 먼저 끝나야 하는 목표 id, msg = 목표 완료 시 대사, fx = 호스트 효과
export const MISSIONS = [
  {
    id: 'wake', title: '정신 차리기',
    obj: [
      { id: 'phone', text: '바닥에서 빛나는 휴대폰 줍기', type: 'flag', flag: 'phone',
        msg: [['MIRA', '연결됐어요! [Tab]으로 휴대폰을 열 수 있어요. 일단 밖으로 나가서 상황을 봐요.']] },
      { id: 'out', text: '조종실 밖으로 나가기', type: 'reach', x: 0, z: 9, r: 4, req: 'phone' },
    ],
    marks: ['phone1', M(0, 9, '출입구')],
    start: [
      ['MIRA', '…들리세요? 생체 신호 확인. 의식이 돌아오고 있어요.'],
      ['MIRA', '충돌 충격으로 함선 시스템이 거의 다 꺼졌어요. 제 백업 코어는 휴대폰에 연결돼 있어요. 바닥에 떨어진 휴대폰부터 주워 주세요. [E]'],
    ],
    done: [['MIRA', '…이상해요. 하늘 색이 데이터와 달라요. 여긴 케플러-442b가 아니에요.']],
  },
  {
    id: 'report', title: '피해 확인',
    obj: [{ id: 'panel', text: '함선 옆면의 수리 패널 조사하기', type: 'flag', flag: 'panel' }],
    marks: ['panel'],
    start: [['MIRA', '항로 계산 오류로 미확인 행성 KX-9 "녹턴"에 불시착한 것 같아요. 함선 옆면의 수리 패널에서 피해 상황을 확인해 주세요.']],
    fx: 'clock',
    done: [
      ['SYS', '━ 피해 보고서 ━\n비상 전력 … 오프라인\n항법 칩 … 분실\n선체 판 ×3 … 분실\n통신 안테나 … 분실\n연료 셀 … ✖ 완전 파손\n냉각 코일 … ✖ 완전 파손\n전력 코어 … ✖ 완전 파손'],
      ['MIRA', '분실 부품은 찾아오면 되지만, 완전히 파손된 세 개는 고칠 수 없어요. 이 행성에서 구할 수 있는 재료로 대체품을 만들어야 해요. 휴대폰 [검색] 앱에 오프라인 백과사전이 있어요.'],
      ['MIRA', '우선 전력부터. 잔해 사이에 비상 배터리 팩이 흩어져 있을 거예요. 빛 기둥을 찾아보세요.'],
    ],
  },
  {
    id: 'power', title: '비상 전력',
    obj: [
      { id: 'bat', text: '흩어진 배터리 팩 3개 회수', type: 'inv', item: 'battery', n: 3 },
      { id: 'lev', text: '함선 양쪽의 비상 레버 동시에 당기기 (1.5초 안에)', textSolo: '함선 양쪽의 비상 레버를 10초 안에 연달아 당기기',
        type: 'sync', sync: 'levers', req: 'bat',
        msg: [['MIRA', '배터리 연결 확인. 레버는 함선 양쪽에 하나씩 있어요. 동시에 당겨야 회로가 닫혀요!']], msgWhen: 'activate' },
    ],
    marks: ['battery1', 'battery2', 'battery3', 'battery4', 'leverA', 'leverB'],
    fx: 'power',
    done: [['MIRA', '전력 복구! 스캐너가 다시 살아났어요. 휴대폰 [스캐너] 앱에 부품 신호가 잡혀요.']],
  },
  {
    id: 'parts', title: '흩어진 부품',
    obj: [
      { id: 'nav', text: '북쪽 결정 평원에서 항법 칩 회수', type: 'inv', item: 'navchip', n: 1 },
      { id: 'hull', text: '흩어진 선체 판 3장 회수', type: 'inv', item: 'hull', n: 3 },
    ],
    marks: ['navchip1', 'hull1', 'hull2', 'hull3'],
    start: [['MIRA', '항법 칩은 북쪽 결정 평원, 선체 판은 세 군데로 흩어져 있어요. 나눠서 찾으면 빨라요. 해가 지기 전에 돌아오는 걸 추천해요.']],
    done: [['MIRA', '잘했어요. 그런데… 기온이 빠르게 떨어지고 있어요. 밤이 오기 전에 대비해야 해요.']],
  },
  {
    id: 'prep', title: '첫 번째 밤 준비',
    hint: '밤, 외계인, 빛',
    obj: [
      { id: 'srch', text: '휴대폰 [검색]으로 야행성 생물 조사하기', type: 'search', key: 'night' },
      { id: 'fib', text: '섬유 식물 4개 채집', type: 'inv', item: 'fiber', n: 4, req: 'srch', orCraft: 'beacon' },
      { id: 'bat', text: '배터리 팩 1개 더 확보 (꼬리 잔해)', type: 'inv', item: 'battery', n: 1, req: 'srch', orCraft: 'beacon' },
      { id: 'craft', text: '제작대에서 UV 방어등 만들기', type: 'craft', item: 'beacon', n: 1, req: ['fib', 'bat'] },
      { id: 'place', text: '함선 앞 설치 지점에 방어등 세우기', type: 'flag', flag: 'beaconPlaced', req: 'craft' },
    ],
    marks: ['battery1', 'battery2', 'battery3', 'battery4', 'workbench', 'beaconSlot'],
    start: [['MIRA', '궤도에서 찍은 생태 데이터에 대형 야행성 생물 반응이 있어요. [검색]에서 "밤"이나 "외계인"을 찾아보세요.']],
    fx: 'dusk',
    done: [['MIRA', '방어등 가동. 반경 안쪽은 안전해요. …해가 지고 있어요.']],
  },
  {
    id: 'night1', title: '첫 번째 밤',
    obj: [{ id: 'surv', text: '밤이 끝날 때까지 살아남기 (방어등 발전기를 계속 돌려야 함)', type: 'survive' }],
    marks: [M(0, 6, '함선')],
    start: [
      ['MIRA', '방어등 빛 안쪽에 머물러요. 그리고 손전등… [L] 불빛은 그것들을 불러요. 꼭 필요할 때만 켜세요.'],
      ['MIRA', '쓰러진 대원은 옆에서 [E]를 길게 눌러 일으킬 수 있어요.'],
      ['MIRA', '방어등 배터리는 밤새 닳아요. 꺼지기 전에 방어등 기둥에서 [E]를 길게 눌러 발전기를 돌려 주세요. 여럿이 돌리면 더 빨라요.'],
    ],
    done: [
      ['MIRA', '해가 떴어요. 우리… 살아남았어요.'],
      ['MIRA', '이제 완전히 부서진 부품을 대체할 차례예요. 먼저 연료부터. [검색]에서 "연료"를 찾아보세요.'],
    ],
  },
  {
    id: 'fuel', title: '대체 연료',
    hint: '연료, 물',
    obj: [
      { id: 'srch', text: '[검색]으로 대체 연료 찾기', type: 'search', key: 'fuel' },
      { id: 'moss', text: '동쪽 버섯 숲에서 발광 이끼 4개 채집', type: 'inv', item: 'moss', n: 4, req: 'srch', orCraft: 'fuelcell' },
      { id: 'srch2', text: '[검색]으로 정제수 만드는 법 찾기', type: 'search', key: 'water', req: 'srch' },
      { id: 'filter', text: '정수 필터 만들기 (섬유 + 수지)', type: 'craft', item: 'filter', n: 1, req: 'srch2' },
      { id: 'pure', text: '남쪽 호수의 물로 정제수 2개 만들기', type: 'craft', item: 'purewater', n: 2, req: 'filter' },
      { id: 'cell', text: '바이오 연료 셀 제작', type: 'craft', item: 'fuelcell', n: 1, req: ['moss', 'pure'] },
    ],
    marks: [M(P.FOREST.x, P.FOREST.z, '버섯 숲'), M(P.LAKE.x, P.LAKE.z, '호수'), M(P.RESIN.x, P.RESIN.z, '호박나무 숲'), 'workbench'],
    done: [['MIRA', '연료 셀 완성! 다음은 통신이에요. 함대에 우리 위치를 알려야 해요.']],
  },
  {
    id: 'comms', title: '통신 복구',
    obj: [
      { id: 'ant', text: '서쪽 능선 꼭대기의 안테나를 함선까지 운반 (무거움)', type: 'flag', flag: 'antennaHome' },
      { id: 'tune', text: '중계기 2대의 주파수를 동시에 고정 (함선 옆 + 중계 언덕)', textSolo: '중계기 2대를 50초 안에 모두 튜닝 (함선 옆 → 중계 언덕)',
        type: 'sync', sync: 'relays', req: 'ant',
        msg: [['MIRA', '안테나 장착 완료. 이제 중계기 두 대가 같은 순간에 신호를 잡아야 해요. 하나는 함선 옆, 하나는 북동쪽 중계 언덕에 있어요.']], msgWhen: 'activate' },
    ],
    marks: ['antenna1', 'relayA', 'relayB'],
    start: [['MIRA', '안테나 신호가 서쪽 능선 꼭대기에서 잡혀요. 무거워서 한 명이 들고 와야 해요. 들고 있는 동안엔 달릴 수 없으니 다른 대원이 엄호해 주세요.']],
    fx: 'comms',
    done: [
      ['SYS', '📡 수신 중… 신호 강도 12%'],
      ['함대 본부', '…아르카디아 7호… 신호 확인… 수리 완료 시… 궤도 랑데부 가능…'],
      ['함대 본부', '…경고. KX-9는… 12년 전 탐사선 "오리온-3"가… 실종된… 생존자 없음으로…'],
      ['MIRA', '오리온-3… 이 행성 곳곳에서 같은 주파수의 데이터 로그 신호가 잡혀요. 스캐너에 표시해 둘게요. 그들에게 무슨 일이 있었는지 알 수 있을지도 몰라요.'],
      ['MIRA', '다음은 냉각 코일이에요. [검색]에서 "냉각"을 찾아보세요.'],
    ],
  },
  {
    id: 'cool', title: '냉각 코일',
    hint: '냉각, 엔진',
    obj: [
      { id: 'srch', text: '[검색]으로 냉각 코일 대체품 찾기', type: 'search', key: 'cool' },
      { id: 'cry', text: '북쪽 결정 평원에서 공명 결정 3개 채굴 (밤에만 가능)', type: 'inv', item: 'crystal', n: 3, req: 'srch', orCraft: 'coil' },
      { id: 'res', text: '호박빛 수지 2개 확보', type: 'inv', item: 'resin', n: 2, req: 'srch', orCraft: 'coil' },
      { id: 'coil', text: '결정 냉각 코일 제작', type: 'craft', item: 'coil', n: 1, req: ['cry', 'res'] },
    ],
    marks: [M(P.CRYSTAL.x, P.CRYSTAL.z, '결정 평원'), M(P.RESIN.x, P.RESIN.z, '호박나무 숲'), 'bed1', 'workbench'],
    done: [['MIRA', '코일 완성. 이제 남은 건 전력 코어 하나예요… 이 행성에 그만한 에너지원이 있을까요? [검색]에서 "전력"을 찾아봐요.']],
  },
  {
    id: 'nest', title: '둥지 잠입',
    hint: '전력, 코어, 에너지',
    obj: [
      { id: 'srch', text: '[검색]으로 고에너지원 찾기', type: 'search', key: 'power' },
      { id: 'flare', text: 'UV 조명탄 만들기 (키틴 + 이끼)', type: 'craft', item: 'flare', n: 2, req: 'srch' },
      { id: 'reach', text: '북동쪽 둥지에 잠입하기 (낮에 가는 걸 추천)', type: 'reach', x: P.NEST.x, z: P.NEST.z, r: 30, req: 'srch' },
      { id: 'extract', text: '둥지 핵 추출 — [E] 길게 (함께 잡으면 빨라짐)', type: 'flag', flag: 'coreOut', req: 'reach',
        msg: [['MIRA', '핵이 떨어져 나왔어요! 그것들이 깨어나요 — 핵을 들고 뛰어요!! 빛나는 핵이 그것들을 끌어당겨요!']] },
      { id: 'home', text: '둥지 핵을 함선까지 옮기기', type: 'flag', flag: 'coreHome', req: 'extract' },
    ],
    marks: [M(P.NEST.x, P.NEST.z, '둥지'), 'core1'],
    done: [['MIRA', '모든 대체 부품이 준비됐어요! 수리 패널에서 부품을 장착하면 이륙할 수 있어요.']],
  },
  {
    id: 'launch', title: '탈출',
    obj: [
      { id: 'install', text: '수리 패널에서 모든 부품 장착', type: 'flag', flag: 'installed' },
      { id: 'ignite', text: '연료 펌프와 항법 콘솔 동시에 가동 (2초 안에)', textSolo: '연료 펌프와 항법 콘솔을 12초 안에 가동',
        type: 'sync', sync: 'ignite', req: 'install', fx: 'launch',
        msg: [
          ['MIRA', '점화 시퀀스 시작! 엔진 예열 90초. 방어등 전력을 엔진으로 돌렸어요 — 보호막이 꺼집니다!'],
          ['MIRA', '엔진 소리가… 너무 커요. 전부 몰려오고 있어요! 조명탄으로 버텨요!'],
        ] },
      { id: 'hold', text: '엔진 예열 동안 버티기', type: 'flag', flag: 'countdown', req: 'ignite',
        msg: [['MIRA', '예열 완료! 전원 조종실로 탑승하세요!!']] },
      { id: 'board', text: '모두 조종실에 탑승!', type: 'allin', req: 'hold', fx: 'end' },
    ],
    marks: ['panel', 'pump', 'navst', M(0, 0, '조종실')],
    start: [],
    done: [],
  },
];

// 월드 엔티티 — 시드로 생성되어 모든 클라이언트에서 동일
export function genEntities() {
  const R = mulberry32(SEED + 1);
  const E = [], count = {};
  const add = (kind, x, z, o = {}) => {
    const n = (count[kind] = (count[kind] || 0) + 1);
    const e = { id: kind + n, kind, x, z, y: height(x, z), ...o };
    E.push(e); return e;
  };
  const dry = (x, z) => { // 물에 잠긴 위치면 호수 바깥쪽으로 밀어낸다
    for (let i = 0; i < 40 && inLake(x, z); i++) {
      const dx = x - P.LAKE.x, dz = z - P.LAKE.z, d = Math.hypot(dx, dz) || 1;
      x += dx / d * 4; z += dz / d * 4;
    }
    return [x, z];
  };
  const blocked = (x, z) => (x > -34 && x < 9 && z > -11 && z < 16) || inLake(x, z) || Math.abs(x) > 285 || Math.abs(z) > 285;
  const ring = (kind, n, c, r0, r1) => {
    for (let i = 0; i < n; i++) {
      let x, z, k = 0;
      do { const a = R() * Math.PI * 2, r = r0 + R() * (r1 - r0); x = c.x + Math.cos(a) * r; z = c.z + Math.sin(a) * r; }
      while (blocked(x, z) && ++k < 40);
      add(kind, x, z);
    }
  };
  const O = { x: 0, z: 0 };

  // 함선 고정 장치
  add('phone', 1.5, -1.6, { y: 0.24 });
  add('bed', -2.6, -2.0, { y: 0.55 });
  add('navst', 3.25, 0, { y: 1.15, id: 'navst' });
  add('panel', -8, 3.45, { y: 1.4, id: 'panel' });
  add('lever', -14, 3.45, { y: 1.3, id: 'leverA' });
  add('lever', -14, -3.45, { y: 1.3, id: 'leverB' });
  add('pump', -29.5, 3.6, { y: 0, id: 'pump' });
  add('workbench', 7, 8, { id: 'workbench' });
  add('beaconSlot', 3, 15, { id: 'beaconSlot' });
  add('relay', -4, 12, { id: 'relayA' });
  add('relay', P.HILL.x, P.HILL.z, { id: 'relayB' });

  // 부품
  add('battery', 10, -7); add('battery', -21, -13); add('battery', 15, 10); add('battery', -44, 17);
  add('navchip', P.CRYSTAL.x + 10, P.CRYSTAL.z + 8);
  add('hull', ...dry(135, 40)); add('hull', ...dry(-48, 138)); add('hull', -85, -45);
  let best = [P.RIDGE.x, P.RIDGE.z], bh = -1e9;
  for (let dx = -24; dx <= 24; dx += 3) for (let dz = -24; dz <= 24; dz += 3) {
    const h = height(P.RIDGE.x + dx, P.RIDGE.z + dz); if (h > bh) { bh = h; best = [P.RIDGE.x + dx, P.RIDGE.z + dz]; }
  }
  add('antenna', best[0], best[1]);
  add('core', P.NEST.x, P.NEST.z, { y: height(P.NEST.x, P.NEST.z) + 1.2 });
  add('log', -46, -16); add('log', ...dry(P.FOREST.x + 20, P.FOREST.z - 28)); add('log', P.CRYSTAL.x - 28, P.CRYSTAL.z + 12);
  add('log', P.NEST.x + 30, P.NEST.z + 22); add('log', best[0] + 14, best[1] - 18);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2, r = 10 + (i % 2) * 7;
    add('water', P.LAKE.x + Math.cos(a) * r, P.LAKE.z + Math.sin(a) * r, { y: WATER_Y });
  }

  // 자원
  ring('fiber', 40, O, 20, 120); ring('fiber', 12, P.RESIN, 5, 45);
  ring('moss', 32, P.FOREST, 4, 60);
  ring('crystal', 26, P.CRYSTAL, 4, 55);
  ring('resin', 20, P.RESIN, 3, 40);
  ring('chitin', 14, P.NEST, 34, 75); ring('chitin', 6, O, 70, 200);
  return E;
}
