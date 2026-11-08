// UI 연결: 메뉴(플레이/루틴/기록), 설정, 결과, 루틴 진행
import { World, THEMES } from './world.js';
import { Sfx } from './audio.js';
import { Game } from './game.js';
import { Hud, drawCrosshair } from './hud.js';
import { SCENARIOS, ROUTINES, DIFFICULTY, CATEGORIES } from './scenarios.js';
import { TARGET_KINDS, PALETTE } from './targets.js';
import * as store from './storage.js';

const $ = (id) => document.getElementById(id);
const data = store.load();
const settings = data.settings;

const world = new World($('game'));
const sfx = new Sfx();
const hud = new Hud();
const game = new Game({
  world,
  sfx,
  hud,
  getSettings: () => settings,
  onFinish: showResults,
  onPause: () => show('pause'),
  onResume: () => hide('pause'),
  onLockFail: () => {
    $('pause-hint').textContent = '마우스 잠금에 실패했습니다. 잠시 후 다시 클릭하세요.';
  },
});

let routine = null; // { def, index, results }
let lastRun = null; // { id, duration }
let catFilter = 'all';

// ───────────────────────── 아이콘
const ICONS = {
  click: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="20"/><circle cx="32" cy="32" r="4" class="fill"/><path d="M32 4v12M32 48v12M4 32h12M48 32h12"/></svg>',
  track: '<svg viewBox="0 0 64 64"><path d="M4 40c8 0 8-16 16-16s8 16 16 16 8-16 16-16 8 8 8 8"/><circle cx="36" cy="40" r="5" class="fill"/></svg>',
  switch: '<svg viewBox="0 0 64 64"><circle cx="14" cy="44" r="6"/><circle cx="32" cy="18" r="6"/><circle cx="50" cy="42" r="6"/><path d="M18 38l9-14M37 23l9 13" stroke-dasharray="3 4"/></svg>',
  reaction: '<svg viewBox="0 0 64 64"><path d="M36 4L12 36h16l-4 24 24-32H32z"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z" class="fill"/></svg>',
};
const KIND_ART = {
  bot: (c) => `<svg viewBox="0 0 60 60"><circle cx="30" cy="13" r="8" fill="${c}"/><rect x="19" y="23" width="22" height="34" rx="11" fill="${c}"/><rect x="20" y="26" width="20" height="3" rx="1.5" fill="#0d1020"/></svg>`,
  orb: (c) => `<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="22" fill="${c}" opacity=".25"/><circle cx="30" cy="30" r="15" fill="${c}"/><circle cx="25" cy="25" r="4" fill="#fff" opacity=".5"/></svg>`,
  balloon: (c) => `<svg viewBox="0 0 60 60"><ellipse cx="30" cy="25" rx="15" ry="18" fill="${c}"/><path d="M27 44l3-3 3 3z" fill="${c}"/><circle cx="24" cy="18" r="4" fill="#fff" opacity=".45"/></svg>`,
};

// ───────────────────────── 화면 전환
const screens = ['menu', 'pause', 'results', 'settings'];
function show(id) {
  $(id).classList.remove('hidden');
}
function hide(id) {
  $(id).classList.add('hidden');
}
function only(id) {
  for (const s of screens) if (s !== id) hide(s);
  if (id) show(id);
}

function showPage(name) {
  for (const p of ['play', 'routines', 'stats']) $('page-' + p).classList.toggle('hidden', p !== name);
  for (const b of document.querySelectorAll('.nav-item[data-page]')) b.classList.toggle('on', b.dataset.page === name);
  if (name === 'stats') renderStats();
}
for (const b of document.querySelectorAll('.nav-item[data-page]')) b.onclick = () => showPage(b.dataset.page);

// ───────────────────────── 설정 적용
function fireLabel() {
  return settings.fireKey ? `좌클릭 / ${bindLabel(settings.fireKey)}` : '좌클릭';
}

function applySettings() {
  world.setFov(settings.fov);
  if (world.theme !== settings.theme) world.setTheme(settings.theme);
  sfx.setVolume(settings.volume);
  hud.setCrosshair(settings.crosshair);
  hud.showFps(settings.showFps);
  game.dpc = store.degPerCount(settings);
  const preset = store.SENS_PRESETS[settings.sensGame];
  const cm = store.cm360(settings);
  $('side-sens-value').textContent =
    settings.sensGame === 'cm360' ? `${cm.toFixed(1)} cm/360` : `${preset.label} ${store.fmtSens(store.getSens(settings))}`;
  $('side-sens-sub').textContent = `${settings.dpi} DPI · ${cm.toFixed(1)} cm/360 · FOV ${Math.round(settings.fov)}°`;
  $('footnote').textContent = `${fireLabel()} 사격 · ESC 일시정지 · R 재시작 · 기록은 이 브라우저에 저장됩니다`;
  $('hud-hint').textContent = `${fireLabel()} 사격 · ESC 일시정지 · R 즉시 재시작`;
  store.save(data);
}

// ───────────────────────── 플레이 페이지
function renderSeg(id, value, onPick) {
  for (const b of $(id).querySelectorAll('button')) {
    b.classList.toggle('on', b.dataset.v === String(value));
    b.onclick = () => {
      onPick(b.dataset.v);
      store.save(data);
      renderMenu();
    };
  }
}

function fmtBest(id) {
  const def = SCENARIOS[id];
  const best = store.bestFor(data, id, settings.difficulty, settings.duration, def.mode);
  return best ? `최고 ${best.score.toLocaleString()}` : '기록 없음';
}

function dayKey(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function renderDashboard() {
  const log = data.log;
  const now = Date.now();
  const week = log.filter((e) => now - e.date < 7 * 864e5).length;
  $('st-plays').textContent = log.length.toLocaleString();
  $('st-plays-sub').textContent = `최근 7일 ${week}판`;
  const recent = log.slice(-10);
  if (recent.length) {
    const acc = recent.reduce((a, e) => a + e.accuracy, 0) / recent.length;
    $('st-acc').textContent = `${(acc * 100).toFixed(1)}%`;
    $('st-acc-bar').style.width = `${acc * 100}%`;
  } else {
    $('st-acc').textContent = '—';
    $('st-acc-bar').style.width = '0';
  }
  // 연속 플레이 일수
  const days = new Set(log.map((e) => dayKey(e.date)));
  let streak = 0;
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  $('st-streak').textContent = `${streak}일`;
  $('st-streak-sub').textContent = days.has(dayKey(Date.now())) ? '오늘 플레이 완료 🔥' : '오늘 플레이해서 기록을 이어가세요';

  const r = ROUTINES.find((x) => x.featured) || ROUTINES[0];
  const mins = Math.round(r.steps.reduce((a, [, s]) => a + (s || 20), 0) / 60);
  $('hero').innerHTML = `
    <div class="hero-top"><span class="hero-tag">추천 루틴 · 약 ${mins}분</span></div>
    <div class="hero-title">${r.name}</div>
    <div class="hero-steps">${r.steps.map(([id]) => `<span>${SCENARIOS[id].name}</span>`).join('')}</div>
    <button class="btn primary" id="hero-start">루틴 시작</button>`;
  $('hero-start').onclick = () => startRoutine(r);
}

function renderMenu() {
  renderSeg('seg-duration', settings.duration, (v) => (settings.duration = Number(v)));
  renderSeg('seg-diff', settings.difficulty, (v) => (settings.difficulty = v));
  renderSeg('seg-kind', settings.targetKind, (v) => {
    settings.targetKind = v;
    game.refreshDecor();
  });
  renderDashboard();

  const chips = [['all', '전체', null], ...Object.entries(CATEGORIES).map(([k, c]) => [k, c.label, c.color])];
  $('cat-filter').innerHTML = chips
    .map(([k, l, c]) => `<button class="chip ${catFilter === k ? 'on' : ''}" data-cat="${k}">${c ? `<i style="background:${c}"></i>` : ''}${l}</button>`)
    .join('');
  for (const b of $('cat-filter').querySelectorAll('.chip')) {
    b.onclick = () => {
      catFilter = b.dataset.cat;
      renderMenu();
    };
  }

  const grid = $('scenario-grid');
  grid.textContent = '';
  for (const [id, def] of Object.entries(SCENARIOS)) {
    if (catFilter !== 'all' && def.cat !== catFilter) continue;
    const cat = CATEGORIES[def.cat];
    const card = document.createElement('button');
    card.className = 'card';
    card.style.setProperty('--c', cat.color);
    card.innerHTML = `
      <div class="card-art"><span class="cat">${def.tag}</span>${ICONS[def.cat]}</div>
      <div class="card-body">
        <div class="card-name">${def.name}</div>
        <div class="card-desc">${def.desc}</div>
        <div class="card-foot"><span class="card-best">${def.mode === 'rounds' ? '10라운드 · ' : ''}${fmtBest(id)}</span><span class="card-play">${ICONS.play}</span></div>
      </div>`;
    card.onclick = () => {
      routine = null;
      startRun(id, settings.duration);
    };
    grid.appendChild(card);
  }

  const rg = $('routine-grid');
  rg.textContent = '';
  for (const r of ROUTINES) {
    const card = document.createElement('button');
    card.className = 'card routine';
    const total = r.steps.reduce((a, [, d]) => a + (d || 20), 0);
    card.style.setProperty('--c', r.featured ? '#2ef2b0' : '#4f8cff');
    card.innerHTML = `
      <div class="card-art"><span class="cat">약 ${Math.round(total / 60)}분 · ${r.steps.length}단계</span>${ICONS.click}</div>
      <div class="card-body">
        <div class="card-name">${r.icon} ${r.name}</div>
        <div class="card-desc">${r.desc}</div>
        <ol class="steps">${r.steps.map(([id, d]) => `<li><b>${SCENARIOS[id].name}</b><span>${d ? d + '초' : '10라운드'}</span></li>`).join('')}</ol>
      </div>`;
    card.onclick = () => startRoutine(r);
    rg.appendChild(card);
  }
}

// ───────────────────────── 기록 페이지
function sparkInto(canvas, values, color) {
  const w = canvas.clientWidth || 120, h = canvas.clientHeight || 30;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const x = canvas.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (values.length < 2) return;
  const max = Math.max(...values), min = Math.min(...values);
  const px = (i) => 3 + (i / (values.length - 1)) * (w - 6);
  const py = (v) => h - 4 - (max === min ? 0.5 : (v - min) / (max - min)) * (h - 8);
  x.strokeStyle = color;
  x.lineWidth = 1.8;
  x.lineJoin = 'round';
  x.beginPath();
  values.forEach((v, i) => (i ? x.lineTo(px(i), py(v)) : x.moveTo(px(i), py(v))));
  x.stroke();
}

function renderStats() {
  const log = data.log;
  $('stats-lede').textContent = log.length ? `총 ${log.length}판의 기록 (이 브라우저 기준)` : '아직 기록이 없어요. 시나리오를 한 판 플레이해 보세요!';
  const rows = [];
  for (const [id, def] of Object.entries(SCENARIOS)) {
    const es = log.filter((e) => e.id === id);
    const last = es[es.length - 1];
    const best = es.length ? Math.max(...es.map((e) => e.score)) : null;
    rows.push(`<tr>
      <td><span class="cat-dot" style="background:${CATEGORIES[def.cat].color}"></span>${def.name}</td>
      <td class="${best == null ? 'dim' : ''}">${best == null ? '—' : best.toLocaleString()}</td>
      <td class="${last ? '' : 'dim'}">${last ? last.score.toLocaleString() : '—'}</td>
      <td class="${last ? '' : 'dim'}">${last ? (last.accuracy * 100).toFixed(1) + '%' : '—'}</td>
      <td class="${es.length ? '' : 'dim'}">${es.length}</td>
      <td><canvas data-spark="${id}"></canvas></td>
    </tr>`);
  }
  $('stats-body').innerHTML = rows.join('');
  requestAnimationFrame(() => {
    for (const c of document.querySelectorAll('canvas[data-spark]')) {
      const id = c.dataset.spark;
      sparkInto(c, log.filter((e) => e.id === id).slice(-15).map((e) => e.score), CATEGORIES[SCENARIOS[id].cat].color);
    }
  });
}

// ───────────────────────── 실행
function startRun(id, duration) {
  sfx.ensure();
  lastRun = { id, duration };
  only(null);
  const routineText = routine ? `${routine.def.name} ${routine.index + 1}/${routine.def.steps.length}` : '';
  game.begin(id, { duration, difficulty: settings.difficulty, routineText });
  game.requestLock();
  $('pause-hint').textContent = '화면을 클릭하거나 계속하기를 누르세요';
}

function startRoutine(r) {
  routine = { def: r, index: 0, results: [] };
  startRoutineStep();
}

function startRoutineStep() {
  const [id, d] = routine.def.steps[routine.index];
  startRun(id, d || 60);
}

// ───────────────────────── 결과
const fmtMs = (s) => (s == null ? '—' : `${Math.round(s * 1000)}ms`);
const pct = (v) => `${(v * 100).toFixed(1)}%`;

function statCells(r) {
  const cells = [
    ['정확도', pct(r.accuracy)],
    [r.metric === 'track' ? '명중 / 판정' : '명중 / 발사', `${r.hits} / ${r.shots}`],
  ];
  if (r.headshotRate != null) cells.push(['헤드샷 비율', pct(r.headshotRate)]);
  if (r.metric === 'kill') {
    cells.push(['평균 처치 시간', fmtMs(r.avgKill)], ['처치 수', String(r.kills)], ['최고 연속', String(r.maxStreak)]);
    if (r.scenarioId === 'precision') cells.push(['놓친 타겟', String(r.expired)]);
  } else if (r.metric === 'track') {
    cells.push(['처치한 타겟', String(r.pops)]);
  } else if (r.metric === 'reaction') {
    cells.push(
      ['평균 반응 속도', r.avgReaction == null ? '—' : `${Math.round(r.avgReaction)}ms`],
      ['최고 반응 속도', r.bestReaction == null ? '—' : `${Math.round(r.bestReaction)}ms`],
      ['부정 출발', String(r.falseStarts)]
    );
  } else if (r.metric === 'rise') {
    cells.push(['처치 수', String(r.kills)], ['놓친 타겟', String(r.expired)], ['최고 연속', String(r.maxStreak)]);
  }
  return cells;
}

function drawSpark(canvas, hist) {
  const w = canvas.clientWidth || 400, h = canvas.clientHeight || 72;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const x = canvas.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, w, h);
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim();
  const muted = css.getPropertyValue('--muted').trim();
  const pts = hist.slice(-20).map((e) => e.score);
  if (pts.length < 2) {
    x.fillStyle = muted;
    x.font = '13px Pretendard, system-ui, sans-serif';
    x.textAlign = 'center';
    x.fillText('기록이 쌓이면 추이가 표시됩니다', w / 2, h / 2 + 4);
    return;
  }
  const max = Math.max(...pts), min = Math.min(...pts);
  const pad = 10;
  const px = (i) => pad + (i / (pts.length - 1)) * (w - pad * 2);
  const py = (v) => h - pad - (max === min ? 0.5 : (v - min) / (max - min)) * (h - pad * 2);
  const grad = x.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(46,242,176,0.25)');
  grad.addColorStop(1, 'rgba(46,242,176,0)');
  x.beginPath();
  pts.forEach((v, i) => (i ? x.lineTo(px(i), py(v)) : x.moveTo(px(i), py(v))));
  x.lineTo(px(pts.length - 1), h);
  x.lineTo(px(0), h);
  x.closePath();
  x.fillStyle = grad;
  x.fill();
  x.strokeStyle = accent;
  x.lineWidth = 2;
  x.lineJoin = 'round';
  x.beginPath();
  pts.forEach((v, i) => (i ? x.lineTo(px(i), py(v)) : x.moveTo(px(i), py(v))));
  x.stroke();
  const li = pts.length - 1;
  x.fillStyle = accent;
  x.beginPath();
  x.arc(px(li), py(pts[li]), 4, 0, Math.PI * 2);
  x.fill();
}

let enterAction = null;

function showResults(r) {
  const rec = store.record(data, r);
  $('res-name').textContent = r.name;
  $('res-meta').textContent = `${DIFFICULTY[r.difficulty].label} · ${r.duration ? r.duration + '초' : '10라운드'} · ${TARGET_KINDS[r.kind].label}`;
  $('res-score').textContent = r.score.toLocaleString();
  $('res-badge').classList.toggle('hidden', !rec.isBest || rec.prevBest == null);
  $('res-prev').textContent =
    rec.prevBest == null ? '첫 기록!' : rec.isBest ? `이전 최고 ${rec.prevBest.toLocaleString()}` : `최고 ${rec.prevBest.toLocaleString()}`;
  $('res-stats').innerHTML = statCells(r)
    .map(([k, v]) => `<div class="stat"><div class="stat-k">${k}</div><div class="stat-v">${v}</div></div>`)
    .join('');

  const rr = $('res-routine');
  let hasNext = false;
  if (routine) {
    routine.results[routine.index] = r;
    hasNext = routine.index < routine.def.steps.length - 1;
    const rows = routine.def.steps
      .map(([id], i) => {
        const x = routine.results[i];
        return `<tr class="${i === routine.index ? 'cur' : ''}"><td>${i + 1}. ${SCENARIOS[id].name}</td><td>${
          x ? x.score.toLocaleString() : '—'
        }</td><td>${x ? pct(x.accuracy) : '—'}</td></tr>`;
      })
      .join('');
    const done = routine.results.filter(Boolean);
    const total = done.reduce((a, x) => a + x.score, 0);
    rr.innerHTML = `<div class="small-label">${routine.def.name} ${hasNext ? '진행 중' : '완료!'}</div>
      <table class="routine-table"><thead><tr><th>단계</th><th>점수</th><th>정확도</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><td>합계</td><td>${total.toLocaleString()}</td><td>${
        done.length ? pct(done.reduce((a, x) => a + x.accuracy, 0) / done.length) : '—'
      }</td></tr></tfoot></table>`;
    rr.classList.remove('hidden');
  } else {
    rr.classList.add('hidden');
  }

  $('res-next').classList.toggle('hidden', !hasNext);
  if (hasNext) {
    const [nid] = routine.def.steps[routine.index + 1];
    $('res-next').textContent = `다음: ${SCENARIOS[nid].name} ▶`;
    $('res-retry').classList.remove('primary');
    enterAction = nextStep;
    $('res-enter-label').textContent = '다음 단계';
  } else {
    $('res-retry').classList.add('primary');
    enterAction = retry;
    $('res-enter-label').textContent = routine ? '루틴 다시 하기' : '다시 하기';
  }
  $('res-retry').textContent = routine && !hasNext ? '루틴 다시 하기' : '다시 하기';

  only('results');
  requestAnimationFrame(() => drawSpark($('res-spark'), rec.history));
}

function retry() {
  if (routine && routine.index >= routine.def.steps.length - 1 && routine.results.length === routine.def.steps.length) {
    startRoutine(routine.def);
  } else if (lastRun) {
    startRun(lastRun.id, lastRun.duration);
  }
}

function nextStep() {
  routine.index++;
  startRoutineStep();
}

function toMenu() {
  game.quit();
  routine = null;
  renderMenu();
  only('menu');
}

$('res-retry').onclick = retry;
$('res-next').onclick = nextStep;
$('res-menu').onclick = toMenu;

document.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && !$('results').classList.contains('hidden') && $('settings').classList.contains('hidden')) {
    e.preventDefault();
    enterAction?.();
  }
  if (e.code === 'Escape' && !capturing && !$('settings').classList.contains('hidden')) closeSettings();
});

// ───────────────────────── 일시정지
$('pause-resume').onclick = () => game.resume();
$('pause-restart').onclick = () => {
  hide('pause');
  game.restart();
};
$('pause-menu').onclick = toMenu;
$('pause-settings').onclick = () => openSettings();
$('pause').addEventListener('click', (e) => {
  if (e.target.id === 'pause') game.resume();
});

// ───────────────────────── 설정: 탭
function showTab(name) {
  for (const b of $('settings-tabs').querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === name);
  for (const t of document.querySelectorAll('.tab-body')) t.classList.toggle('hidden', t.dataset.tab !== name);
}
for (const b of $('settings-tabs').querySelectorAll('button')) b.onclick = () => showTab(b.dataset.tab);

// 설정: 감도
const setGame = $('set-game');
for (const [k, p] of Object.entries(store.SENS_PRESETS)) {
  const o = document.createElement('option');
  o.value = k;
  o.textContent = p.label;
  setGame.appendChild(o);
}

function fillSettings() {
  setGame.value = settings.sensGame;
  $('set-sens').value = store.fmtSens(store.getSens(settings));
  $('set-dpi').value = settings.dpi;
  $('set-fov').value = settings.fov;
  $('set-vol').value = Math.round(settings.volume * 100);
  $('set-fps').checked = settings.showFps;
  const ch = settings.crosshair;
  $('ch-color').value = ch.color;
  $('ch-length').value = ch.length;
  $('ch-thickness').value = ch.thickness;
  $('ch-gap').value = ch.gap;
  $('ch-dot').checked = ch.dot;
  $('ch-outline').checked = ch.outline;
  updateSettingsReadouts();
}

function updateSettingsReadouts() {
  const preset = store.SENS_PRESETS[settings.sensGame];
  $('set-sens-label').textContent = settings.sensGame === 'cm360' ? 'cm/360' : `${preset.label} 감도`;
  $('set-fov').value = settings.fov;
  $('set-fov-v').textContent = `${Math.round(settings.fov * 100) / 100}°`;
  $('set-vol-v').textContent = `${Math.round(settings.volume * 100)}%`;
  $('ch-length-v').textContent = settings.crosshair.length;
  $('ch-thickness-v').textContent = settings.crosshair.thickness;
  $('ch-gap-v').textContent = settings.crosshair.gap;
  const dpc = store.degPerCount(settings);
  $('sens-readout').innerHTML = `<b>${store.cm360(settings).toFixed(2)} cm/360</b><span>${dpc.toFixed(4)}°/count</span>`;
  const fovBtn = $('apply-fov');
  fovBtn.classList.toggle('hidden', !preset.fov);
  if (preset.fov) {
    const same = Math.abs(settings.fov - preset.fov) < 0.01;
    fovBtn.textContent = same ? `✓ ${preset.label} 시야각 적용됨 (${preset.fov}°)` : `${preset.label} 시야각 적용 (${preset.fov}°)`;
    fovBtn.disabled = same;
  }
  drawCrosshair($('ch-preview'), settings.crosshair, 180);
  renderSensTable();
  renderThemeGrid();
  renderKindGrid();
  renderSwatches();
  $('fire-key-btn').textContent = capturing
    ? '키나 마우스 버튼을 누르세요… (Esc 취소)'
    : settings.fireKey
    ? bindLabel(settings.fireKey)
    : '+ 추가 발사 키 지정';
  $('fire-key-btn').classList.toggle('capturing', capturing);
  $('fire-key-clear').classList.toggle('hidden', !settings.fireKey);
}

function renderSensTable() {
  const rows = [];
  for (const [k, p] of Object.entries(store.SENS_PRESETS)) {
    if (k === 'cm360') continue;
    const saved = settings.sensByGame[k];
    const has = Number(saved) > 0;
    const active = k === settings.sensGame;
    rows.push(`<tr data-game="${k}" class="${active ? 'active' : ''}">
      <td>${active ? '▶ ' : ''}${p.label}</td>
      <td class="${has ? '' : 'unset'}">${has ? store.fmtSens(Number(saved)) : '미설정'}</td>
      <td>${has ? store.cm360(settings, k).toFixed(1) : '—'}</td>
      <td>${store.fmtSens(store.convertTo(settings, k))}</td>
      <td>${active ? '' : `<button class="btn ghost small-btn" data-copy="${k}" title="현재 감도와 같은 회전량으로 저장">환산값 저장</button>`}</td>
    </tr>`);
  }
  $('sens-table').innerHTML = rows.join('');
}

$('sens-table').addEventListener('click', (e) => {
  const copy = e.target.closest('[data-copy]');
  if (copy) {
    const k = copy.dataset.copy;
    settings.sensByGame[k] = Number(store.fmtSens(store.convertTo(settings, k)));
    applySettings();
    updateSettingsReadouts();
    return;
  }
  const row = e.target.closest('tr[data-game]');
  if (row) switchGame(row.dataset.game);
});

function switchGame(g) {
  // 처음 고르는 게임이면 지금 감도와 같은 회전량으로 시작
  if (!(Number(settings.sensByGame[g]) > 0)) {
    settings.sensByGame[g] = Number(store.fmtSens(store.convertTo(settings, g)));
  }
  settings.sensGame = g;
  setGame.value = g;
  $('set-sens').value = store.fmtSens(store.getSens(settings));
  applySettings();
  updateSettingsReadouts();
}

$('apply-fov').onclick = () => {
  const f = store.SENS_PRESETS[settings.sensGame].fov;
  if (f) {
    settings.fov = f;
    applySettings();
    updateSettingsReadouts();
  }
};

// 설정: 배경 테마 / 타겟
function renderThemeGrid() {
  $('theme-grid').innerHTML = Object.entries(THEMES)
    .map(([k, t]) => {
      const [a, b, c] = t.swatch;
      const bg = `linear-gradient(180deg, ${a} 0%, ${a} 55%, ${b} 100%)`;
      const grid = `repeating-linear-gradient(90deg, transparent 0 17px, ${c}33 17px 18px), repeating-linear-gradient(0deg, transparent 0 17px, ${c}22 17px 18px)`;
      return `<button class="option-card ${settings.theme === k ? 'on' : ''}" data-theme="${k}">
        <div class="option-preview" style="background:${grid}, ${bg}"><div style="position:absolute;left:0;right:0;bottom:22px;height:2px;background:${c}"></div></div>
        <div class="option-name">${t.label}</div></button>`;
    })
    .join('');
}
$('theme-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-theme]');
  if (!b) return;
  settings.theme = b.dataset.theme;
  applySettings();
  updateSettingsReadouts();
});

function kindColor(kind) {
  const c = settings.targetColor;
  if (c === 'auto' || !c) return TARGET_KINDS[kind].color === 'rainbow' ? PALETTE[0] : TARGET_KINDS[kind].color;
  return c === 'rainbow' ? PALETTE[2] : c;
}
function renderKindGrid() {
  const bc = kindColor('bot');
  const track = [
    ['bot', true, '사람 표적', '움직이는 사람 형태'],
    ['same', false, '클릭 타겟과 동일', `${TARGET_KINDS[settings.targetKind].label} 사용`],
  ];
  $('track-grid').innerHTML = track
    .map(
      ([k, v, name, desc]) => `<button class="option-card ${settings.humanTracking === v ? 'on' : ''}" data-human="${v}">
        <div class="option-preview">${k === 'bot' ? KIND_ART.bot(bc) : KIND_ART[settings.targetKind](kindColor(settings.targetKind))}</div>
        <div class="option-name">${name}</div><div class="option-desc">${desc}</div></button>`
    )
    .join('');
  $('kind-grid').innerHTML = Object.entries(TARGET_KINDS)
    .filter(([k]) => k !== 'bot')
    .map(
      ([k, t]) => `<button class="option-card ${settings.targetKind === k ? 'on' : ''}" data-kind="${k}">
        <div class="option-preview">${KIND_ART[k](kindColor(k))}</div>
        <div class="option-name">${t.label}</div><div class="option-desc">${t.desc}</div></button>`
    )
    .join('');
}
$('kind-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-kind]');
  if (!b) return;
  settings.targetKind = b.dataset.kind;
  game.refreshDecor();
  applySettings();
  updateSettingsReadouts();
  renderMenu();
});

const COLORS = ['auto', 'rainbow', '#ff3d5a', '#ff8a3d', '#ffd23d', '#2ef2b0', '#3fb8ff', '#4f6bff', '#b57bff', '#ff5cc8', '#ffffff'];
function renderSwatches() {
  $('color-swatches').innerHTML = COLORS.map((c) => {
    const on = settings.targetColor === c ? 'on' : '';
    if (c === 'auto') return `<button class="swatch auto ${on}" data-color="auto">자동</button>`;
    if (c === 'rainbow')
      return `<button class="swatch ${on}" data-color="rainbow" title="무지개" style="background:conic-gradient(${PALETTE.join(',')},${PALETTE[0]})"></button>`;
    return `<button class="swatch ${on}" data-color="${c}" style="background:${c}"></button>`;
  }).join('');
}
$('track-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-human]');
  if (!b) return;
  settings.humanTracking = b.dataset.human === 'true';
  applySettings();
  updateSettingsReadouts();
});
$('color-swatches').addEventListener('click', (e) => {
  const b = e.target.closest('[data-color]');
  if (!b) return;
  settings.targetColor = b.dataset.color;
  game.refreshDecor();
  applySettings();
  updateSettingsReadouts();
});

function readSettings(e) {
  const id = e && e.target && e.target.id;
  if (!id) return;
  if (id === 'set-game') return switchGame(setGame.value);
  if (id === 'set-sens') {
    const v = parseFloat($('set-sens').value);
    if (v > 0) settings.sensByGame[settings.sensGame] = v;
  }
  if (id === 'set-dpi') {
    const dpi = parseInt($('set-dpi').value, 10);
    if (dpi >= 50) settings.dpi = dpi;
  }
  settings.fov = Number($('set-fov').value);
  settings.volume = Number($('set-vol').value) / 100;
  settings.showFps = $('set-fps').checked;
  Object.assign(settings.crosshair, {
    color: $('ch-color').value,
    length: Number($('ch-length').value),
    thickness: Number($('ch-thickness').value),
    gap: Number($('ch-gap').value),
    dot: $('ch-dot').checked,
    outline: $('ch-outline').checked,
  });
  applySettings();
  updateSettingsReadouts();
}
$('settings').addEventListener('input', readSettings);
$('settings').addEventListener('change', readSettings);

// ───────────────────────── 추가 발사 키 지정
let capturing = false;
const MOUSE_NAMES = { 1: '휠 클릭', 2: '우클릭', 3: '마우스 4 (뒤로)', 4: '마우스 5 (앞으로)' };
function bindLabel(b) {
  if (!b) return '';
  if (b.type === 'mouse') return MOUSE_NAMES[b.button] || `마우스 ${b.button + 1}`;
  const c = b.code;
  const map = {
    Space: 'Space', ShiftLeft: '왼쪽 Shift', ShiftRight: '오른쪽 Shift', ControlLeft: '왼쪽 Ctrl', ControlRight: '오른쪽 Ctrl',
    AltLeft: '왼쪽 Alt', AltRight: '오른쪽 Alt', CapsLock: 'Caps Lock', Tab: 'Tab', Enter: 'Enter', Backquote: '`',
  };
  if (map[c]) return map[c];
  return c.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
}
function setCapturing(v) {
  capturing = v;
  game.captureKey = v;
  updateSettingsReadouts();
}
$('fire-key-btn').onclick = (e) => {
  e.stopPropagation();
  setCapturing(!capturing);
};
$('fire-key-clear').onclick = () => {
  settings.fireKey = null;
  applySettings();
  updateSettingsReadouts();
};
document.addEventListener(
  'keydown',
  (e) => {
    if (!capturing) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') return setCapturing(false);
    if (e.code === 'KeyR') {
      $('fire-key-btn').textContent = 'R은 재시작 키라서 쓸 수 없어요';
      return;
    }
    settings.fireKey = { type: 'key', code: e.code };
    applySettings();
    setCapturing(false);
  },
  true
);
document.addEventListener(
  'mousedown',
  (e) => {
    if (!capturing || e.button === 0) return;
    e.preventDefault();
    e.stopPropagation();
    settings.fireKey = { type: 'mouse', button: e.button };
    applySettings();
    setCapturing(false);
  },
  true
);
// 마우스 옆 버튼이 브라우저 '뒤로 가기'를 실행하지 않도록
document.addEventListener('mouseup', (e) => {
  if ((e.button === 3 || e.button === 4) && (capturing || document.pointerLockElement)) e.preventDefault();
});
document.addEventListener('contextmenu', (e) => {
  if (capturing) e.preventDefault();
});

// ───────────────────────── 설정 모달 열고 닫기
function openSettings(tab) {
  fillSettings();
  if (typeof tab === 'string') showTab(tab);
  show('settings');
}
function closeSettings() {
  if (capturing) setCapturing(false);
  hide('settings');
  renderMenu();
}
$('nav-settings').onclick = () => openSettings();
$('side-sens').onclick = () => openSettings('sens');
$('settings-close').onclick = closeSettings;
$('settings-done').onclick = closeSettings;
$('settings').addEventListener('click', (e) => {
  if (e.target.id === 'settings') closeSettings();
});
$('reset-records').onclick = () => {
  if (confirm('모든 최고 기록과 히스토리를 삭제할까요?')) {
    store.resetRecords(data);
    renderMenu();
    renderStats();
  }
};

// ───────────────────────── 루프
let last = performance.now();
let fpsFrames = 0, fpsTime = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  world.render();
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    hud.fps(Math.round(fpsFrames / fpsTime));
    fpsFrames = 0;
    fpsTime = 0;
  }
  requestAnimationFrame(loop);
}

if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) {
  $('mobile-warn').classList.remove('hidden');
}

applySettings();
renderMenu();
requestAnimationFrame(loop);

// 디버그용 (브라우저 콘솔에서 popshot.game 접근)
window.popshot = { game, settings };
