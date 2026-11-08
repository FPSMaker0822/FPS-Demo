// 설정 / 기록 저장 (localStorage)

const KEY = 'popshot.v1';

// 게임별 yaw 값 (도/카운트). 감도 × yaw = 마우스 1카운트당 회전 각도
export const SENS_PRESETS = {
  valorant: { label: 'Valorant', yaw: 0.07 },
  cs2: { label: 'CS2 / Apex Legends', yaw: 0.022 },
  ow2: { label: 'Overwatch 2', yaw: 0.0066 },
  cm360: { label: 'cm/360 직접 입력', yaw: null },
};

export const DEFAULT_SETTINGS = {
  sensGame: 'valorant',
  sens: 0.4,
  dpi: 800,
  fov: 103,
  crosshair: { color: '#2ef2b0', length: 6, thickness: 2, gap: 3, dot: false, outline: true },
  volume: 0.6,
  showFps: false,
  balloonColor: 'rainbow',
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
  return {
    settings: merge(DEFAULT_SETTINGS, raw.settings || {}),
    best: raw.best || {},
    history: raw.history || {},
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
  save(data);
}

/** 마우스 1카운트당 회전 각도(도) */
export function degPerCount(s) {
  if (s.sensGame === 'cm360') {
    const cm = Math.max(1, Number(s.sens) || 30);
    const dpi = Math.max(50, Number(s.dpi) || 800);
    return 360 / ((cm / 2.54) * dpi);
  }
  const preset = SENS_PRESETS[s.sensGame] || SENS_PRESETS.valorant;
  return Math.max(0.00001, (Number(s.sens) || 0) * preset.yaw);
}

export function cm360(s) {
  const dpi = Math.max(50, Number(s.dpi) || 800);
  return (360 / degPerCount(s) / dpi) * 2.54;
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
  save(data);
  return { isBest, prevBest: prev ? prev.score : null, history: hist };
}

export function bestFor(data, scenarioId, difficulty, duration, mode) {
  return data.best[recordKey(scenarioId, difficulty, duration, mode)] || null;
}
