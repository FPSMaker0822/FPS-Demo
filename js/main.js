// UI 연결: 메뉴, 설정, 결과, 루틴 진행
import { World } from './world.js';
import { Sfx } from './audio.js';
import { Game } from './game.js';
import { Hud, drawCrosshair } from './hud.js';
import { SCENARIOS, ROUTINES, DIFFICULTY } from './scenarios.js';
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

// ───────────────────────── 설정 적용
function applySettings() {
  world.setFov(settings.fov);
  sfx.setVolume(settings.volume);
  hud.setCrosshair(settings.crosshair);
  hud.showFps(settings.showFps);
  game.dpc = store.degPerCount(settings);
  const preset = store.SENS_PRESETS[settings.sensGame];
  const cm = store.cm360(settings);
  $('sens-chip').innerHTML =
    settings.sensGame === 'cm360'
      ? `🖱 <b>${cm.toFixed(1)} cm/360</b> · ${settings.dpi} DPI`
      : `🖱 ${preset.label} <b>${settings.sens}</b> · ${settings.dpi} DPI · ${cm.toFixed(1)} cm/360`;
  store.save(data);
}

// ───────────────────────── 메뉴
function renderSeg(id, value, onPick) {
  const seg = $(id);
  for (const b of seg.querySelectorAll('button')) {
    b.classList.toggle('on', b.dataset.v === String(value));
    b.onclick = () => {
      onPick(b.dataset.v);
      renderMenu();
    };
  }
}

function fmtBest(id) {
  const def = SCENARIOS[id];
  const best = store.bestFor(data, id, settings.difficulty, settings.duration, def.mode);
  return best ? `최고 ${best.score.toLocaleString()}` : '기록 없음';
}

function renderMenu() {
  renderSeg('seg-duration', settings.duration, (v) => {
    settings.duration = Number(v);
    store.save(data);
  });
  renderSeg('seg-diff', settings.difficulty, (v) => {
    settings.difficulty = v;
    store.save(data);
  });

  const grid = $('scenario-grid');
  grid.textContent = '';
  for (const [id, def] of Object.entries(SCENARIOS)) {
    const card = document.createElement('button');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-top"><span class="card-icon">${def.icon}</span><span class="card-tag">${def.tag}</span></div>
      <div class="card-name">${def.name}</div>
      <div class="card-desc">${def.desc}</div>
      <div class="card-best">${def.mode === 'rounds' ? '10라운드 · ' : ''}${fmtBest(id)}</div>`;
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
    card.innerHTML = `
      <div class="card-top"><span class="card-icon">${r.icon}</span><span class="card-tag">약 ${Math.round(total / 60)}분 · ${r.steps.length}단계</span></div>
      <div class="card-name">${r.name}</div>
      <div class="card-desc">${r.desc}</div>
      <ol class="steps">${r.steps
        .map(([id, d]) => `<li>${SCENARIOS[id].name}<span>${d ? d + '초' : '10라운드'}</span></li>`)
        .join('')}</ol>`;
    card.onclick = () => {
      routine = { def: r, index: 0, results: [] };
      startRoutineStep();
    };
    rg.appendChild(card);
  }
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
  if (r.metric === 'kill') {
    cells.push(['평균 처치 시간', fmtMs(r.avgKill)], ['처치 수', String(r.kills)], ['최고 연속', String(r.maxStreak)]);
    if (r.scenarioId === 'precision') cells.push(['놓친 풍선', String(r.expired)]);
  } else if (r.metric === 'track') {
    cells.push(['터트린 풍선', String(r.pops)]);
  } else if (r.metric === 'reaction') {
    cells.push(
      ['평균 반응 속도', r.avgReaction == null ? '—' : `${Math.round(r.avgReaction)}ms`],
      ['최고 반응 속도', r.bestReaction == null ? '—' : `${Math.round(r.bestReaction)}ms`],
      ['부정 출발', String(r.falseStarts)]
    );
  } else if (r.metric === 'rise') {
    cells.push(['터트린 풍선', String(r.kills)], ['놓친 풍선', String(r.expired)], ['최고 연속', String(r.maxStreak)]);
  }
  return cells;
}

function drawSpark(canvas, hist) {
  const w = canvas.clientWidth || 400, h = canvas.clientHeight || 70;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const x = canvas.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, w, h);
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim();
  const line = css.getPropertyValue('--line').trim();
  const muted = css.getPropertyValue('--muted').trim();
  const pts = hist.slice(-20).map((e) => e.score);
  if (pts.length < 2) {
    x.fillStyle = muted;
    x.font = '13px system-ui, sans-serif';
    x.textAlign = 'center';
    x.fillText('기록이 쌓이면 추이가 표시됩니다', w / 2, h / 2 + 4);
    return;
  }
  const max = Math.max(...pts), min = Math.min(...pts);
  const pad = 8;
  const px = (i) => pad + (i / (pts.length - 1)) * (w - pad * 2);
  const py = (v) => h - pad - (max === min ? 0.5 : (v - min) / (max - min)) * (h - pad * 2);
  x.strokeStyle = line;
  x.lineWidth = 1;
  x.beginPath();
  x.moveTo(pad, h - pad + 0.5);
  x.lineTo(w - pad, h - pad + 0.5);
  x.stroke();
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
  $('res-meta').textContent = `${DIFFICULTY[r.difficulty].label} · ${r.duration ? r.duration + '초' : '10라운드'}`;
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
        const cls = i === routine.index ? 'cur' : '';
        return `<tr class="${cls}"><td>${i + 1}. ${SCENARIOS[id].name}</td><td>${x ? x.score.toLocaleString() : '—'}</td><td>${
          x ? pct(x.accuracy) : '—'
        }</td></tr>`;
      })
      .join('');
    const done = routine.results.filter(Boolean);
    const total = done.reduce((a, x) => a + x.score, 0);
    rr.innerHTML = `<div class="muted small-label">${routine.def.name} ${hasNext ? '진행 중' : '완료!'}</div>
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
    routine = { def: routine.def, index: 0, results: [] };
    startRoutineStep();
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
  if (e.code === 'Escape' && !$('settings').classList.contains('hidden')) closeSettings();
});

// ───────────────────────── 일시정지
$('pause-resume').onclick = () => game.resume();
$('pause-restart').onclick = () => {
  hide('pause');
  game.restart();
};
$('pause-menu').onclick = toMenu;
$('pause-settings').onclick = openSettings;
$('pause').addEventListener('click', (e) => {
  if (e.target.id === 'pause') game.resume();
});

// ───────────────────────── 설정 모달
const setGame = $('set-game');
for (const [k, p] of Object.entries(store.SENS_PRESETS)) {
  const o = document.createElement('option');
  o.value = k;
  o.textContent = p.label;
  setGame.appendChild(o);
}

function fillSettings() {
  setGame.value = settings.sensGame;
  $('set-sens').value = settings.sens;
  $('set-dpi').value = settings.dpi;
  $('set-sens-label').textContent = settings.sensGame === 'cm360' ? 'cm/360' : '인게임 감도';
  $('set-fov').value = settings.fov;
  $('set-color').value = settings.balloonColor;
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
  $('set-fov-v').textContent = `${settings.fov}°`;
  $('set-vol-v').textContent = `${Math.round(settings.volume * 100)}%`;
  $('ch-length-v').textContent = settings.crosshair.length;
  $('ch-thickness-v').textContent = settings.crosshair.thickness;
  $('ch-gap-v').textContent = settings.crosshair.gap;
  const dpc = store.degPerCount(settings);
  $('sens-readout').innerHTML = `<b>${store.cm360(settings).toFixed(2)} cm/360</b><span>${dpc.toFixed(4)}°/count</span>`;
  drawCrosshair($('ch-preview'), settings.crosshair, 120);
}

function readSettings() {
  const prevGame = settings.sensGame;
  settings.sensGame = setGame.value;
  if (prevGame !== settings.sensGame) {
    // 게임 기준이 바뀌면 같은 cm/360을 유지하도록 감도 환산
    const cm = store.cm360({ ...settings, sensGame: prevGame });
    if (settings.sensGame === 'cm360') settings.sens = Number(cm.toFixed(2));
    else {
      const yaw = store.SENS_PRESETS[settings.sensGame].yaw;
      const dpc = 360 / ((cm / 2.54) * settings.dpi);
      settings.sens = Number((dpc / yaw).toFixed(3));
    }
    $('set-sens').value = settings.sens;
    $('set-sens-label').textContent = settings.sensGame === 'cm360' ? 'cm/360' : '인게임 감도';
  } else {
    const v = parseFloat($('set-sens').value);
    if (v > 0) settings.sens = v;
  }
  const dpi = parseInt($('set-dpi').value, 10);
  if (dpi >= 50) settings.dpi = dpi;
  settings.fov = Number($('set-fov').value);
  settings.balloonColor = $('set-color').value;
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
  updateSettingsReadouts();
  applySettings();
}

$('settings').addEventListener('input', readSettings);
$('settings').addEventListener('change', readSettings);

function openSettings() {
  fillSettings();
  show('settings');
}
function closeSettings() {
  hide('settings');
  renderMenu();
}
$('btn-settings').onclick = openSettings;
$('sens-chip').onclick = openSettings;
$('settings-close').onclick = closeSettings;
$('settings-done').onclick = closeSettings;
$('settings').addEventListener('click', (e) => {
  if (e.target.id === 'settings') closeSettings();
});
$('reset-records').onclick = () => {
  if (confirm('모든 최고 기록과 히스토리를 삭제할까요?')) {
    store.resetRecords(data);
    renderMenu();
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
