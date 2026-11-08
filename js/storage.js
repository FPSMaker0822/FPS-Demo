// 설정 / 기록 저장 (localStorage)

const KEY = 'popshot.v1';

// 게임별 yaw 값 (도/카운트). 감도 × yaw = 마우스 1카운트당 회전 각도
// fov: 해당 게임의 16:9 기준 수평 시야각 (고정/대표값이 있는 경우만)
export const SENS_PRESETS = {
  valorant: { label: 'Valorant', yaw: 0.07, fov: 103, def: 0.4 },
  cs2: { label: 'Counter-Strike 2', yaw: 0.022, fov: 106.26, def: 1.25 },
  apex: { label: 'Apex Legends', yaw: 0.022, fov: null, def: 1.25 },
  ow2: { label: 'Overwatch 2', yaw: 0.0066, fov: 103, def: 4.2 },
  cod: { label: 'Call of Duty (MW / 워존)', yaw: 0.0066, fov: null, def: 4.2 },
  fortnite: { label: 'Fortnite (X 감도 %)', yaw: 0.005555, fov: null, def: 5 },
  r6: { label: 'Rainbow Six Siege (배율 0.02)', yaw: 0.00572958, fov: null, def: 5 },
  cm360: { label: 'cm/360 직접 입력', yaw: null, fov: null, def: 40 },
};

export const DEFAULT_SETTINGS = {
  sensGame: 'valorant',
  sensByGame: {}, // 게임별로 저장된 감도 { valorant: 0.4, cs2: 1.25, ... }
  dpi: 800,
  fov: 103,
  fireKey: null, // 추가 발사 입력: { type: 'key', code } | { type: 'mouse', button }
  crosshair: { color: '#2ef2b0', length: 6, thickness: 2, gap: 3, dot: false, outline: true },
  volume: 0.6,
  showFps: false,
  targetKind: 'orb', // 클릭 모드 타겟: orb | balloon
  humanTracking: true, // 트래킹 모드에서 움직이는 사람 표적 사용
  targetColor: 'auto', // auto | rainbow | #hex
  theme: 'midnight',
  graphics: 'high', // high: 블룸 + 그림자 | low: 가볍게
  lang: null, // 'ko' | 'en' (null이면 브라우저 언어)
  colorblind: 'off', // off | deut | prot | trit
  onboarded: false,
  duration: 60,
  difficulty: 'normal',
};

function merge(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(over || {})) {
    if (base && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k])) {
      out[k] = merge(base[k], over[k]);
    } else if (k in base) {
      out[k] = over[k];
    }
  }
  return out;
}

export function load() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    raw = null;
  }
  raw = raw || {};
  const settings = merge(DEFAULT_SETTINGS, raw.settings || {});
  settings.sensByGame = { ...((raw.settings && raw.settings.sensByGame) || {}) };
  // 이전 버전(단일 감도) 마이그레이션
  if (raw.settings && raw.settings.sens != null && settings.sensByGame[settings.sensGame] == null) {
    settings.sensByGame[settings.sensGame] = raw.settings.sens;
  }
  if (!SENS_PRESETS[settings.sensGame]) settings.sensGame = 'valorant';
  if (settings.targetKind === 'bot') settings.targetKind = 'orb'; // 사람 표적은 트래킹 전용
  return {
    settings,
    best: raw.best || {},
    history: raw.history || {},
    log: Array.isArray(raw.log) ? raw.log : [], // 최근 플레이 기록 (통계용)
    bench: raw.bench && typeof raw.bench === 'object' ? raw.bench : {}, // 벤치마크 최고 점수 { id: score }
    benchHistory: Array.isArray(raw.benchHistory) ? raw.benchHistory : [], // 완료한 벤치마크 [{ date, scores }]
    customs: Array.isArray(raw.customs) ? raw.customs : [], // 커스텀 시나리오 설정
  };
}

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* 저장 불가 환경 (시크릿 모드 등) */
  }
}

export function resetRecords(data) {
  data.best = {};
  data.history = {};
  data.log = [];
  data.bench = {};
  data.benchHistory = [];
  save(data);
}

/** 현재 선택된(또는 지정한) 게임의 저장된 감도 */
export function getSens(s, game = s.sensGame) {
  const v = Number(s.sensByGame[game]);
  return v > 0 ? v : SENS_PRESETS[game].def;
}

/** 마우스 1카운트당 회전 각도(도) */
export function degPerCount(s, game = s.sensGame, sens = getSens(s, game)) {
  const dpi = Math.max(50, Number(s.dpi) || 800);
  if (game === 'cm360') return 360 / ((Math.max(1, sens) / 2.54) * dpi);
  return Math.max(0.00001, sens * SENS_PRESETS[game].yaw);
}

export function cm360(s, game = s.sensGame) {
  const dpi = Math.max(50, Number(s.dpi) || 800);
  return (360 / degPerCount(s, game) / dpi) * 2.54;
}

/** 현재 감도(회전량)와 똑같아지는 다른 게임의 감도 */
export function convertTo(s, game) {
  const dpc = degPerCount(s);
  if (game === 'cm360') return cm360(s);
  return dpc / SENS_PRESETS[game].yaw;
}

export function fmtSens(v) {
  return v >= 10 ? v.toFixed(2) : v >= 1 ? v.toFixed(3) : v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

export function recordKey(scenarioId, difficulty, duration, mode) {
  return mode === 'rounds' ? `${scenarioId}|${difficulty}` : `${scenarioId}|${difficulty}|${duration}`;
}

export function record(data, r) {
  const key = recordKey(r.scenarioId, r.difficulty, r.duration, r.mode);
  const prev = data.best[key];
  const isBest = !prev || r.score > prev.score;
  if (isBest) data.best[key] = { score: r.score, accuracy: r.accuracy, date: r.date };
  const hist = (data.history[key] ||= []);
  hist.push({ score: r.score, accuracy: r.accuracy, date: r.date });
  while (hist.length > 30) hist.shift();
  data.log.push({ id: r.scenarioId, score: r.score, accuracy: r.accuracy, date: r.date });
  while (data.log.length > 500) data.log.shift();
  save(data);
  return { isBest, prevBest: prev ? prev.score : null, history: hist };
}

export function bestFor(data, scenarioId, difficulty, duration, mode) {
  return data.best[recordKey(scenarioId, difficulty, duration, mode)] || null;
}

// ───────────────────────── 백업 가져오기 (다른 PC의 기록 합치기)
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const KEY_RE = /^[a-z0-9-]{1,40}(\|[a-z]{1,10}(\|\d{1,4})?)?$/;

function cleanEntry(e) {
  if (!isObj(e)) return null;
  const score = num(e.score), accuracy = num(e.accuracy), date = num(e.date);
  if (score == null || accuracy == null || date == null) return null;
  return { score: Math.max(0, Math.round(score)), accuracy: Math.min(1, Math.max(0, accuracy)), date };
}

/**
 * 내보낸 JSON(다른 PC)의 기록을 현재 데이터에 합침. 설정은 건드리지 않음.
 * 최고 기록은 더 높은 쪽, 히스토리/로그는 합쳐서 날짜순(중복 제거), 커스텀 시나리오는 없는 것만 추가.
 * 반환: { added: 추가된 플레이 수 } — 형식이 맞지 않으면 예외
 */
export function mergeData(data, incoming, sanitizeCustom) {
  if (!isObj(incoming) || (!isObj(incoming.best) && !Array.isArray(incoming.log))) throw new Error('invalid backup');
  const before = data.log.length;

  for (const [k, v] of Object.entries(isObj(incoming.best) ? incoming.best : {})) {
    const e = cleanEntry(v);
    if (!e || !KEY_RE.test(k)) continue;
    if (!data.best[k] || e.score > data.best[k].score) data.best[k] = e;
  }

  const mergeList = (a, b, keyOf, limit) => {
    const seen = new Set(a.map(keyOf));
    for (const x of b) if (!seen.has(keyOf(x))) (seen.add(keyOf(x)), a.push(x));
    a.sort((x, y) => x.date - y.date);
    while (a.length > limit) a.shift();
    return a;
  };

  for (const [k, list] of Object.entries(isObj(incoming.history) ? incoming.history : {})) {
    if (!KEY_RE.test(k) || !Array.isArray(list)) continue;
    const clean = list.map(cleanEntry).filter(Boolean);
    data.history[k] = mergeList(data.history[k] || [], clean, (e) => `${e.date}|${e.score}`, 30);
  }

  const logIn = (Array.isArray(incoming.log) ? incoming.log : [])
    .map((e) => (isObj(e) && typeof e.id === 'string' && /^[a-z0-9-]{1,40}$/.test(e.id) ? { id: e.id, ...cleanEntry(e) } : null))
    .filter((e) => e && e.date != null);
  mergeList(data.log, logIn, (e) => `${e.id}|${e.date}`, 500);

  for (const [k, v] of Object.entries(isObj(incoming.bench) ? incoming.bench : {})) {
    const s = num(v);
    if (s == null || !/^[a-z]{1,20}$/.test(k)) continue;
    if (data.bench[k] == null || s > data.bench[k]) data.bench[k] = Math.round(s);
  }

  if (Array.isArray(incoming.customs) && sanitizeCustom) {
    const ids = new Set(data.customs.map((c) => c.id));
    for (const c of incoming.customs) {
      const s = sanitizeCustom(c);
      if (s.id && !ids.has(s.id)) (ids.add(s.id), data.customs.push(s));
    }
  }
  return { added: data.log.length - before };
}
