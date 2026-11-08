// UI 연결: 메뉴(플레이/벤치마크/루틴/만들기/기록), 설정, 결과, 온보딩, 진단
import { World, THEMES } from './world.js';
import { Sfx } from './audio.js';
import { Game } from './game.js';
import { Hud, drawCrosshair } from './hud.js';
import { SCENARIOS, ROUTINES, DIFFICULTY, CATEGORIES, BENCHMARK, RECOMMEND, registerCustom, unregisterCustom } from './scenarios.js';
import { TARGET_KINDS, PALETTE } from './targets.js';
import { t, setLang, getLang, applyI18n } from './i18n.js';
import { tierFor, overallTier, weakestCategory, analyzeRun, TIERS } from './analysis.js';
import { CUSTOM_FIELDS, sanitizeCustom, encodeShare, decodeShare, newCustomId } from './custom.js';
import * as store from './storage.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ───────────────────────── 오류 기록 (외부 전송 없음, 로컬 보관)
const ERR_KEY = 'popshot.errors';
function logError(msg) {
  try {
    const list = JSON.parse(localStorage.getItem(ERR_KEY) || '[]');
    list.push({ t: new Date().toISOString(), msg: String(msg).slice(0, 500), ua: navigator.userAgent });
    while (list.length > 20) list.shift();
    localStorage.setItem(ERR_KEY, JSON.stringify(list));
  } catch {
    /* 무시 */
  }
  toast(t('오류가 발생했어요. 설정 → 일반에서 오류 기록을 복사할 수 있어요.'));
}
window.addEventListener('error', (e) => logError(`${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => logError(`unhandled: ${e.reason && (e.reason.stack || e.reason)}`));

let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2800);
}

// ───────────────────────── 데이터 & 엔진
const data = store.load();
const settings = data.settings;
setLang(settings.lang || ((navigator.language || '').toLowerCase().startsWith('ko') ? 'ko' : 'en'));
for (const c of data.customs) registerCustom(c);

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
    $('pause-hint').textContent = t('마우스 잠금에 실패했습니다. 잠시 후 다시 클릭하세요.');
  },
});

let routine = null; // { def, index, results, bench }
let lastRun = null; // { id, duration, opts }
let catFilter = 'all';
let currentPage = 'play';

// ───────────────────────── 아이콘
const ICONS = {
  click: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="20"/><circle cx="32" cy="32" r="4" class="fill"/><path d="M32 4v12M32 48v12M4 32h12M48 32h12"/></svg>',
  track: '<svg viewBox="0 0 64 64"><path d="M4 40c8 0 8-16 16-16s8 16 16 16 8-16 16-16 8 8 8 8"/><circle cx="36" cy="40" r="5" class="fill"/></svg>',
  switch: '<svg viewBox="0 0 64 64"><circle cx="14" cy="44" r="6"/><circle cx="32" cy="18" r="6"/><circle cx="50" cy="42" r="6"/><path d="M18 38l9-14M37 23l9 13" stroke-dasharray="3 4"/></svg>',
  reaction: '<svg viewBox="0 0 64 64"><path d="M36 4L12 36h16l-4 24 24-32H32z"/></svg>',
  custom: '<svg viewBox="0 0 64 64"><path d="M10 50l8-2 26-26-6-6-26 26zM38 16l6-6 6 6-6 6"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z" class="fill"/></svg>',
};
const KIND_ART = {
  bot: (c) => `<svg viewBox="0 0 60 60"><circle cx="30" cy="13" r="8" fill="${c}"/><rect x="19" y="23" width="22" height="34" rx="11" fill="${c}"/><rect x="20" y="26" width="20" height="3" rx="1.5" fill="#0d1020"/></svg>`,
  orb: (c) => `<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="22" fill="${c}" opacity=".25"/><circle cx="30" cy="30" r="15" fill="${c}"/><circle cx="25" cy="25" r="4" fill="#fff" opacity=".5"/></svg>`,
  balloon: (c) => `<svg viewBox="0 0 60 60"><ellipse cx="30" cy="25" rx="15" ry="18" fill="${c}"/><path d="M27 44l3-3 3 3z" fill="${c}"/><circle cx="24" cy="18" r="4" fill="#fff" opacity=".45"/></svg>`,
};

const sName = (id) => (SCENARIOS[id]?.custom ? SCENARIOS[id].name : t(SCENARIOS[id]?.name || id));

// ───────────────────────── 화면 전환
const screens = ['menu', 'pause', 'results', 'settings', 'onboard', 'diag', 'import'];
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

const PAGES = ['play', 'bench', 'routines', 'create', 'stats'];
function showPage(name) {
  currentPage = name;
  for (const p of PAGES) $('page-' + p).classList.toggle('hidden', p !== name);
  for (const b of document.querySelectorAll('.nav-item[data-page]')) b.classList.toggle('on', b.dataset.page === name);
  renderPage();
}
for (const b of document.querySelectorAll('.nav-item[data-page]')) b.onclick = () => showPage(b.dataset.page);

function renderPage() {
  if (currentPage === 'play' || currentPage === 'routines') renderMenu();
  if (currentPage === 'bench') renderBench();
  if (currentPage === 'create') renderCustoms();
  if (currentPage === 'stats') renderStats();
}

// ───────────────────────── 설정 적용
function fireLabel() {
  return settings.fireKey ? `${t('좌클릭')} / ${bindLabel(settings.fireKey)}` : t('좌클릭');
}

function applySettings() {
  world.setFov(settings.fov);
  if (world.theme !== settings.theme) world.setTheme(settings.theme);
  if (world.quality !== settings.graphics) world.setQuality(settings.graphics);
  document.documentElement.dataset.cb = settings.colorblind;
  sfx.setVolume(settings.volume);
  hud.setCrosshair(settings.crosshair);
  hud.showFps(settings.showFps);
  game.dpc = store.degPerCount(settings);
  const preset = store.SENS_PRESETS[settings.sensGame];
  const cm = store.cm360(settings);
  $('side-sens-value').textContent =
    settings.sensGame === 'cm360' ? `${cm.toFixed(1)} cm/360` : `${t(preset.label)} ${store.fmtSens(store.getSens(settings))}`;
  $('side-sens-sub').textContent = `${settings.dpi} DPI · ${cm.toFixed(1)} cm/360 · FOV ${Math.round(settings.fov)}°`;
  $('footnote').textContent = t('{fire} 사격 · ESC 일시정지 · R 재시작 · 기록은 이 브라우저에 저장됩니다', { fire: fireLabel() });
  $('hud-hint').textContent = t('{fire} 사격 · ESC 일시정지 · R 즉시 재시작', { fire: fireLabel() });
  store.save(data);
}

function applyLanguage(lang) {
  settings.lang = lang;
  setLang(lang);
  document.documentElement.lang = lang;
  applyI18n(document);
  fillSenseOptions();
  applySettings();
  renderPage();
}

// ───────────────────────── 플레이 페이지
function renderSeg(id, value, onPick) {
  for (const b of $(id).querySelectorAll('button')) {
    b.classList.toggle('on', b.dataset.v === String(value));
    b.onclick = () => {
      onPick(b.dataset.v);
      store.save(data);
      renderPage();
    };
  }
}

function fmtBest(id) {
  const def = SCENARIOS[id];
  const best = store.bestFor(data, id, settings.difficulty, def.custom ? def.cfg.duration : settings.duration, def.mode);
  return best ? t('최고 {n}', { n: best.score.toLocaleString() }) : t('기록 없음');
}

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function benchOverall() {
  return overallTier(BENCHMARK.steps.map((id) => tierFor(id, data.bench[id])));
}

function renderDashboard() {
  const log = data.log;
  const now = Date.now();
  const week = log.filter((e) => now - e.date < 7 * 864e5).length;
  $('st-plays-sub').textContent = t('총 {n}판 · 최근 7일 {w}판', { n: log.length, w: week });
  const recent = log.slice(-10);
  if (recent.length) {
    const acc = recent.reduce((a, e) => a + e.accuracy, 0) / recent.length;
    $('st-acc').textContent = `${(acc * 100).toFixed(1)}%`;
    $('st-acc-bar').style.width = `${acc * 100}%`;
  } else {
    $('st-acc').textContent = '—';
    $('st-acc-bar').style.width = '0';
  }
  const days = new Set(log.map((e) => dayKey(e.date)));
  let streak = 0;
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  $('st-streak').textContent = t('{n}일', { n: streak });
  $('st-streak-sub').textContent = days.has(dayKey(Date.now())) ? t('오늘 플레이 완료 🔥') : t('오늘 플레이해서 기록을 이어가세요');

  // 랭크 타일
  const ov = benchOverall();
  $('tile-rank').innerHTML = ov
    ? `<div class="tile-label">${t('종합 랭크')}</div><div class="tile-value" style="color:${ov.color}">${t(ov.name)}</div><div class="tile-sub">${t('벤치마크 기준')}</div>`
    : `<div class="tile-label">${t('종합 랭크')}</div><div class="tile-value">—</div><button class="btn small-btn" id="rank-cta">${t('벤치마크로 측정하기')}</button>`;
  $('rank-cta')?.addEventListener('click', () => showPage('bench'));

  // 추천 루틴: 벤치마크 약점이 있으면 약점 맞춤, 없으면 인기 루틴
  const weak = weakestCategory(data.bench, (id) => SCENARIOS[id]?.cat);
  const r = (weak && ROUTINES.find((x) => x.id === RECOMMEND[weak.cat])) || ROUTINES.find((x) => x.featured) || ROUTINES[0];
  const mins = Math.round(r.steps.reduce((a, [, s]) => a + (s || 20), 0) / 60);
  const tag = weak
    ? t('약점 맞춤 · {cat} · 약 {m}분', { cat: t(CATEGORIES[weak.cat].label), m: mins })
    : t('추천 루틴 · 약 {m}분', { m: mins });
  $('hero').innerHTML = `
    <div class="hero-top"><span class="hero-tag">${tag}</span></div>
    <div class="hero-title">${r.icon} ${esc(t(r.name))}</div>
    <div class="hero-steps">${r.steps.map(([id]) => `<span>${esc(sName(id))}</span>`).join('')}</div>
    <button class="btn primary" id="hero-start">${t('루틴 시작')}</button>`;
  $('hero-start').onclick = () => startRoutine(r);
}

function scenarioCard(id, def, onClick) {
  const cat = CATEGORIES[def.cat];
  const card = document.createElement('button');
  card.className = 'card';
  card.style.setProperty('--c', cat.color);
  const desc = def.custom ? customSummary(def.cfg) : t(def.desc);
  card.innerHTML = `
    <div class="card-art"><span class="cat">${esc(t(def.tag))}</span>${ICONS[def.cat]}</div>
    <div class="card-body">
      <div class="card-name">${esc(sName(id))}</div>
      <div class="card-desc">${esc(desc)}</div>
      <div class="card-foot"><span class="card-best">${def.mode === 'rounds' ? t('10라운드') + ' · ' : ''}${fmtBest(id)}</span><span class="card-play">${ICONS.play}</span></div>
    </div>`;
  card.onclick = onClick;
  return card;
}

function renderMenu() {
  renderSeg('seg-duration', settings.duration, (v) => (settings.duration = Number(v)));
  renderSeg('seg-diff', settings.difficulty, (v) => (settings.difficulty = v));
  renderSeg('seg-kind', settings.targetKind, (v) => {
    settings.targetKind = v;
    game.refreshDecor();
  });
  renderDashboard();

  const cats = Object.entries(CATEGORIES).filter(([k]) => k !== 'custom' || data.customs.length);
  const chips = [['all', t('전체'), null], ...cats.map(([k, c]) => [k, t(c.label), c.color])];
  $('cat-filter').innerHTML = chips
    .map(([k, l, c]) => `<button class="chip ${catFilter === k ? 'on' : ''}" data-cat="${k}">${c ? `<i style="background:${c}"></i>` : ''}${esc(l)}</button>`)
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
    grid.appendChild(
      scenarioCard(id, def, () => {
        routine = null;
        startRun(id, def.custom ? def.cfg.duration : settings.duration);
      })
    );
  }

  const rg = $('routine-grid');
  rg.textContent = '';
  for (const r of ROUTINES) {
    const card = document.createElement('button');
    card.className = 'card routine';
    const total = r.steps.reduce((a, [, d]) => a + (d || 20), 0);
    card.style.setProperty('--c', r.featured ? '#2ef2b0' : '#4f8cff');
    card.innerHTML = `
      <div class="card-art"><span class="cat">${t('약 {m}분 · {n}단계', { m: Math.round(total / 60), n: r.steps.length })}</span>${ICONS.click}</div>
      <div class="card-body">
        <div class="card-name">${r.icon} ${esc(t(r.name))}</div>
        <div class="card-desc">${esc(t(r.desc))}</div>
        <ol class="steps">${r.steps
          .map(([id, d]) => `<li><b>${esc(sName(id))}</b><span>${d ? t('{n}초', { n: d }) : t('10라운드')}</span></li>`)
          .join('')}</ol>
      </div>`;
    card.onclick = () => startRoutine(r);
    rg.appendChild(card);
  }
}

// ───────────────────────── 벤치마크 페이지
function tierBadge(tr) {
  return tr ? `<span class="tier-pill" style="--tc:${tr.color}">${esc(t(tr.name))}</span>` : '<span class="dim">—</span>';
}

function renderBench() {
  const ov = benchOverall();
  const done = BENCHMARK.steps.filter((id) => data.bench[id] != null).length;
  $('bench-overall').innerHTML = ov
    ? `<div class="tile-label">${t('종합 랭크')}</div>
       <div class="rank-big" style="color:${ov.color}">${esc(t(ov.name))}</div>
       <div class="tier-scale">${TIERS.map((x, i) => `<i style="background:${x.color};opacity:${i <= ov.idx ? 1 : 0.2}"></i>`).join('')}</div>
       <div class="tile-sub">${t('{d}/{n}개 시나리오 측정됨', { d: done, n: BENCHMARK.steps.length })}</div>`
    : `<div class="tile-label">${t('종합 랭크')}</div><div class="rank-big">—</div><div class="tile-sub">${t('벤치마크를 완료하면 랭크가 표시됩니다')}</div>`;

  const weak = weakestCategory(data.bench, (id) => SCENARIOS[id]?.cat);
  const rr = weak && ROUTINES.find((x) => x.id === RECOMMEND[weak.cat]);
  $('bench-weak').innerHTML = weak
    ? `<div class="tile-label">${t('가장 약한 분야')}</div>
       <div class="tile-value" style="color:${CATEGORIES[weak.cat].color}">${esc(t(CATEGORIES[weak.cat].label))}</div>
       <div class="tile-sub">${t('추천 루틴')}: ${esc(t(rr.name))}</div>
       <button class="btn small-btn" id="weak-start">${t('추천 루틴 시작')}</button>`
    : `<div class="tile-label">${t('가장 약한 분야')}</div><div class="tile-value">—</div><div class="tile-sub">${t('측정 후 약점에 맞는 루틴을 추천해 드려요')}</div>`;
  $('weak-start')?.addEventListener('click', () => startRoutine(rr));

  $('bench-body').innerHTML = BENCHMARK.steps
    .map((id) => {
      const sc = data.bench[id];
      const tr = tierFor(id, sc);
      const def = SCENARIOS[id];
      const nextTxt = tr && tr.next ? `${(tr.next - sc).toLocaleString()} · ${esc(t(TIERS[tr.idx + 1].name))}` : tr ? 'MAX' : '—';
      return `<tr>
        <td><span class="cat-dot" style="background:${CATEGORIES[def.cat].color}"></span>${esc(sName(id))}</td>
        <td>${esc(t(CATEGORIES[def.cat].label))}</td>
        <td class="${sc == null ? 'dim' : ''}">${sc == null ? '—' : sc.toLocaleString()}</td>
        <td>${tierBadge(tr)}</td>
        <td class="${tr ? '' : 'dim'}">${tr ? `<div class="mini-bar"><i style="width:${tr.progress * 100}%;background:${tr.color}"></i></div>${nextTxt}` : '—'}</td>
        <td><button class="btn ghost small-btn" data-bench-one="${id}">${t('이것만')}</button></td>
      </tr>`;
    })
    .join('');
  for (const b of document.querySelectorAll('[data-bench-one]')) {
    b.onclick = () => startBenchmark([b.dataset.benchOne]);
  }
}
$('bench-start').onclick = () => startBenchmark(BENCHMARK.steps);

function seedFor(id) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function startBenchmark(ids) {
  routine = {
    def: { name: '벤치마크', icon: '⭐', steps: ids.map((id) => [id, SCENARIOS[id].mode === 'rounds' ? 0 : BENCHMARK.duration]) },
    index: 0,
    results: [],
    bench: true,
  };
  startRoutineStep();
}

// ───────────────────────── 만들기 (커스텀 시나리오)
const FIELD_LABELS = {
  count: '타겟 수', size: '타겟 크기', distance: '거리 (m)', spreadYaw: '좌우 범위 (°)', spreadPitch: '상하 범위 (°)',
  moveSpeed: '이동 속도 (°/초)', lifetime: '타겟 수명 (초, 0=무제한)', hp: '처치까지 추적 시간 (초)', duration: '플레이 시간 (초)',
};
let editing = null;

function customSummary(c) {
  const parts = [
    c.type === 'track' ? t('트래킹') : t('클릭'),
    t('타겟 {n}개', { n: c.count }),
    t('크기 {n}', { n: c.size }),
    t('{n}m', { n: c.distance }),
    c.moveSpeed ? t('이동 {n}°/초', { n: c.moveSpeed }) : t('정지'),
    t('{n}초', { n: c.duration }),
  ];
  return parts.join(' · ');
}

function renderEditorFields() {
  const type = $('ed-type').value;
  $('ed-fields').innerHTML = Object.entries(CUSTOM_FIELDS)
    .filter(([k]) => k !== 'hp' || type === 'track')
    .filter(([k]) => k !== 'lifetime' || type === 'click')
    .map(
      ([k, f]) => `<label><span>${esc(t(FIELD_LABELS[k]))} <b id="ed-${k}-v">${editing[k]}</b></span>
        <input type="range" id="ed-${k}" min="${f.min}" max="${f.max}" step="${f.step}" value="${editing[k]}" /></label>`
    )
    .join('');
  for (const k of Object.keys(CUSTOM_FIELDS)) {
    const el = $('ed-' + k);
    if (!el) continue;
    el.oninput = () => {
      editing[k] = Number(el.value);
      $('ed-' + k + '-v').textContent = el.value;
    };
  }
}

function openEditor(cfg) {
  editing = sanitizeCustom(cfg || { name: t('새 시나리오') });
  if (!editing.id) editing.id = newCustomId();
  $('ed-name').value = editing.name;
  $('ed-type').value = editing.type;
  renderEditorFields();
  show('editor');
  $('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('ed-type').onchange = () => {
  editing.type = $('ed-type').value;
  renderEditorFields();
};
$('create-new').onclick = () => openEditor();
$('ed-cancel').onclick = () => hide('editor');

function saveEditor() {
  editing.name = $('ed-name').value;
  const c = sanitizeCustom(editing);
  const i = data.customs.findIndex((x) => x.id === c.id);
  if (i >= 0) data.customs[i] = c;
  else data.customs.push(c);
  registerCustom(c);
  store.save(data);
  hide('editor');
  renderCustoms();
  return 'custom-' + c.id;
}
$('ed-save').onclick = () => {
  saveEditor();
  toast(t('저장했어요'));
};
$('ed-test').onclick = () => {
  const id = saveEditor();
  routine = null;
  startRun(id, SCENARIOS[id].cfg.duration);
};

function renderCustoms() {
  const grid = $('custom-grid');
  grid.textContent = '';
  $('custom-empty').classList.toggle('hidden', data.customs.length > 0);
  for (const c of data.customs) {
    const id = 'custom-' + c.id;
    const def = SCENARIOS[id];
    if (!def) continue;
    const card = scenarioCard(id, def, () => {
      routine = null;
      startRun(id, c.duration);
    });
    const tools = document.createElement('div');
    tools.className = 'card-tools';
    tools.innerHTML = `<button class="btn ghost small-btn" data-act="edit">${t('수정')}</button>
      <button class="btn ghost small-btn" data-act="share">${t('공유 링크')}</button>
      <button class="btn ghost small-btn danger" data-act="del">${t('삭제')}</button>`;
    tools.onclick = (e) => {
      e.stopPropagation();
      const act = e.target.dataset.act;
      if (act === 'edit') openEditor(c);
      if (act === 'share') {
        const url = `${location.origin}${location.pathname}#s=${encodeShare(c)}`;
        navigator.clipboard?.writeText(url).then(
          () => toast(t('공유 링크를 복사했어요')),
          () => prompt(t('공유 링크'), url)
        );
        if (!navigator.clipboard) prompt(t('공유 링크'), url);
      }
      if (act === 'del' && confirm(t('"{name}" 시나리오를 삭제할까요?', { name: c.name }))) {
        data.customs = data.customs.filter((x) => x.id !== c.id);
        unregisterCustom(id);
        store.save(data);
        renderCustoms();
      }
    };
    card.querySelector('.card-body').appendChild(tools);
    grid.appendChild(card);
  }
}

// 공유 링크로 들어온 경우
let pendingImport = null;
function checkImport() {
  const m = location.hash.match(/^#s=([A-Za-z0-9_-]+)$/);
  if (!m) return false;
  const cfg = decodeShare(m[1]);
  history.replaceState(null, '', location.pathname + location.search);
  if (!cfg) {
    toast(t('공유 링크를 읽을 수 없어요'));
    return false;
  }
  pendingImport = cfg;
  $('import-name').textContent = cfg.name;
  $('import-desc').textContent = customSummary(cfg);
  show('import');
  return true;
}
window.addEventListener('hashchange', checkImport);
$('import-ok').onclick = () => {
  const c = sanitizeCustom({ ...pendingImport, id: newCustomId() });
  data.customs.push(c);
  registerCustom(c);
  store.save(data);
  hide('import');
  showPage('create');
  toast(t('시나리오를 추가했어요'));
};
$('import-cancel').onclick = () => hide('import');

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

function drawWeekly(canvas) {
  const w = canvas.clientWidth || 600, h = canvas.clientHeight || 160;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const x = canvas.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, w, h);
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim();
  const accent2 = css.getPropertyValue('--accent-2').trim();
  const muted = css.getPropertyValue('--muted').trim();
  const WEEKS = 8;
  const now = Date.now();
  const weeks = Array.from({ length: WEEKS }, () => ({ n: 0, acc: 0 }));
  for (const e of data.log) {
    const wi = WEEKS - 1 - Math.floor((now - e.date) / (7 * 864e5));
    if (wi >= 0 && wi < WEEKS) {
      weeks[wi].n++;
      weeks[wi].acc += e.accuracy;
    }
  }
  const maxN = Math.max(1, ...weeks.map((k) => k.n));
  const pad = 24, bw = (w - pad * 2) / WEEKS;
  x.font = '11px Pretendard, system-ui, sans-serif';
  x.textAlign = 'center';
  weeks.forEach((k, i) => {
    const bh = (k.n / maxN) * (h - 50);
    x.fillStyle = accent2 + '66';
    x.beginPath();
    x.roundRect(pad + i * bw + bw * 0.2, h - 22 - bh, bw * 0.6, bh, 4);
    x.fill();
    x.fillStyle = muted;
    x.fillText(i === WEEKS - 1 ? t('이번 주') : t('{n}주 전', { n: WEEKS - 1 - i }), pad + i * bw + bw / 2, h - 6);
    if (k.n) {
      x.fillStyle = muted;
      x.fillText(String(k.n), pad + i * bw + bw / 2, h - 26 - bh);
    }
  });
  const pts = weeks.map((k, i) => (k.n ? [pad + i * bw + bw / 2, h - 22 - (k.acc / k.n) * (h - 50)] : null)).filter(Boolean);
  if (pts.length >= 2) {
    x.strokeStyle = accent;
    x.lineWidth = 2;
    x.beginPath();
    pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
    x.stroke();
  }
  x.fillStyle = accent;
  for (const [px, py] of pts) {
    x.beginPath();
    x.arc(px, py, 3, 0, Math.PI * 2);
    x.fill();
  }
}

function renderStats() {
  const log = data.log;
  $('stats-lede').textContent = log.length ? t('총 {n}판의 기록 (이 브라우저 기준)', { n: log.length }) : t('아직 기록이 없어요. 시나리오를 한 판 플레이해 보세요!');
  const rows = [];
  for (const [id, def] of Object.entries(SCENARIOS)) {
    const es = log.filter((e) => e.id === id);
    const last = es[es.length - 1];
    const best = es.length ? Math.max(...es.map((e) => e.score)) : null;
    rows.push(`<tr>
      <td><span class="cat-dot" style="background:${CATEGORIES[def.cat].color}"></span>${esc(sName(id))}</td>
      <td class="${best == null ? 'dim' : ''}">${best == null ? '—' : best.toLocaleString()}</td>
      <td class="${last ? '' : 'dim'}">${last ? last.score.toLocaleString() : '—'}</td>
      <td class="${last ? '' : 'dim'}">${last ? (last.accuracy * 100).toFixed(1) + '%' : '—'}</td>
      <td class="${es.length ? '' : 'dim'}">${es.length}</td>
      <td><canvas data-spark="${esc(id)}"></canvas></td>
    </tr>`);
  }
  $('stats-body').innerHTML = rows.join('');
  requestAnimationFrame(() => {
    drawWeekly($('weekly-chart'));
    for (const c of document.querySelectorAll('canvas[data-spark]')) {
      const id = c.dataset.spark;
      sparkInto(c, log.filter((e) => e.id === id).slice(-15).map((e) => e.score), CATEGORIES[SCENARIOS[id].cat].color);
    }
  });
}

// ───────────────────────── 실행
function startRun(id, duration, opts = {}) {
  sfx.ensure();
  lastRun = { id, duration, opts };
  only(null);
  const routineText = routine ? `${t(routine.def.name)} ${routine.index + 1}/${routine.def.steps.length}` : '';
  game.begin(id, { duration, difficulty: opts.difficulty || settings.difficulty, routineText, seed: opts.seed ?? null });
  hud.setScenario(sName(id), routineText);
  game.requestLock();
  $('pause-hint').textContent = t('화면을 클릭하거나 계속하기를 누르세요');
}

function startRoutine(r) {
  routine = { def: r, index: 0, results: [] };
  startRoutineStep();
}

function startRoutineStep() {
  const [id, d] = routine.def.steps[routine.index];
  if (routine.bench) startRun(id, d || 60, { seed: seedFor(id), difficulty: BENCHMARK.difficulty });
  else startRun(id, d || 60);
}

// ───────────────────────── 결과
const fmtMs = (s) => (s == null ? '—' : `${Math.round(s * 1000)}ms`);
const pct = (v) => `${(v * 100).toFixed(1)}%`;

function statCells(r) {
  const cells = [
    [t('정확도'), pct(r.accuracy)],
    [r.metric === 'track' ? t('명중 / 판정') : t('명중 / 발사'), `${r.hits} / ${r.shots}`],
  ];
  if (r.metric === 'kill') {
    cells.push([t('평균 처치 시간'), fmtMs(r.avgKill)], [t('처치 수'), String(r.kills)], [t('최고 연속'), String(r.maxStreak)]);
    if (r.expired) cells.push([t('놓친 타겟'), String(r.expired)]);
  } else if (r.metric === 'track') {
    cells.push([t('처치한 타겟'), String(r.pops)]);
  } else if (r.metric === 'reaction') {
    cells.push(
      [t('평균 반응 속도'), r.avgReaction == null ? '—' : `${Math.round(r.avgReaction)}ms`],
      [t('최고 반응 속도'), r.bestReaction == null ? '—' : `${Math.round(r.bestReaction)}ms`],
      [t('부정 출발'), String(r.falseStarts)]
    );
  } else if (r.metric === 'rise') {
    cells.push([t('처치 수'), String(r.kills)], [t('놓친 타겟'), String(r.expired)], [t('최고 연속'), String(r.maxStreak)]);
  }
  return cells;
}

const DIR_LABEL = { left: '왼쪽', right: '오른쪽', up: '위쪽', down: '아래쪽' };
function insightText(ins) {
  switch (ins.key) {
    case 'slowDir':
      return t('{dir} 방향 플릭이 가장 느려요 (가장 빠른 방향보다 {pct}% 느림). 이 방향을 집중적으로 연습해 보세요.', { dir: t(DIR_LABEL[ins.dir]), pct: ins.pct });
    case 'overflick':
      return t('빗나간 샷의 {pct}%가 타겟을 지나쳤어요 → 오버플릭 경향. 감도를 조금 낮추거나 멈추는 연습을 해보세요.', { pct: ins.pct });
    case 'underflick':
      return t('빗나간 샷의 {pct}%가 타겟에 못 미쳤어요 → 언더플릭 경향. 끝까지 따라가서 쏘는 연습을 해보세요.', { pct: ins.pct });
    case 'fatigue':
      return t('후반으로 갈수록 정확도가 {pct}%p 떨어졌어요. 집중력과 손목 피로를 관리해 보세요.', { pct: ins.pct });
    case 'warmup':
      return t('후반에 정확도가 {pct}%p 올라갔어요. 플레이 전 워밍업을 조금 더 하면 좋아요.', { pct: ins.pct });
    default:
      return '';
  }
}

function renderAnalysis(r) {
  const el = $('res-analysis');
  const a = analyzeRun(r.raw || {});
  const parts = [];
  if (a.dirs) {
    const vals = Object.values(a.dirs).filter((d) => d.n).map((d) => d.avg);
    const max = Math.max(...vals, 0.001);
    parts.push(`<div class="an-block"><div class="small-label">${t('방향별 평균 처치 시간')}</div><div class="dir-bars">${Object.entries(a.dirs)
      .map(([k, d]) => `<div class="dir-bar"><span>${t(DIR_LABEL[k])}</span><div class="mini-bar"><i style="width:${d.n ? (d.avg / max) * 100 : 0}%"></i></div><b>${d.n ? fmtMs(d.avg) : '—'}</b></div>`)
      .join('')}</div></div>`);
    parts.push(`<div class="an-block"><div class="small-label">${t('플릭 거리별')}</div><div class="an-pair">
      <div class="stat"><div class="stat-k">${t('짧은 플릭 (<10°)')}</div><div class="stat-v">${a.short.n ? fmtMs(a.short.avg) : '—'}</div></div>
      <div class="stat"><div class="stat-k">${t('긴 플릭 (≥10°)')}</div><div class="stat-v">${a.long.n ? fmtMs(a.long.avg) : '—'}</div></div></div>
      ${a.over != null ? `<div class="over-under"><span>${t('언더플릭')} ${a.under}</span><div class="ou-bar"><i style="width:${(a.under / (a.over + a.under)) * 100}%"></i></div><span>${a.over} ${t('오버플릭')}</span></div>` : ''}
    </div>`);
  }
  if (a.timeline) {
    parts.push(`<div class="an-block"><div class="small-label">${t('구간별 추적 정확도 (5초 단위)')}</div><div class="tl-bars">${a.timeline
      .map((v) => `<i style="height:${Math.max(4, v * 100)}%" title="${Math.round(v * 100)}%"></i>`)
      .join('')}</div></div>`);
  }
  const ins = a.insights.map(insightText).filter(Boolean);
  if (ins.length) parts.push(`<div class="insights">${ins.map((s) => `<div class="insight">💡 ${esc(s)}</div>`).join('')}</div>`);
  el.innerHTML = parts.length ? `<div class="small-label an-title">${t('분석')}</div><div class="an-grid">${parts.join('')}</div>` : '';
  el.classList.toggle('hidden', !parts.length);
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
    x.fillText(t('기록이 쌓이면 추이가 표시됩니다'), w / 2, h / 2 + 4);
    return;
  }
  const max = Math.max(...pts), min = Math.min(...pts);
  const pad = 10;
  const px = (i) => pad + (i / (pts.length - 1)) * (w - pad * 2);
  const py = (v) => h - pad - (max === min ? 0.5 : (v - min) / (max - min)) * (h - pad * 2);
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
  const bench = routine?.bench;
  if (bench && (data.bench[r.scenarioId] == null || r.score > data.bench[r.scenarioId])) data.bench[r.scenarioId] = r.score;
  $('res-name').textContent = sName(r.scenarioId);
  $('res-meta').textContent = bench
    ? t('벤치마크 · 보통 · 고정 배치')
    : `${t(DIFFICULTY[r.difficulty].label)} · ${r.duration ? t('{n}초', { n: r.duration }) : t('10라운드')} · ${t(TARGET_KINDS[r.kind].label)}`;
  $('res-score').textContent = r.score.toLocaleString();
  $('res-badge').classList.toggle('hidden', !rec.isBest || rec.prevBest == null);
  $('res-prev').textContent =
    rec.prevBest == null
      ? t('첫 기록!')
      : rec.isBest
      ? t('이전 최고 {n}', { n: rec.prevBest.toLocaleString() })
      : t('최고 {n}', { n: rec.prevBest.toLocaleString() });
  const tr = bench ? tierFor(r.scenarioId, r.score) : null;
  $('res-tier').classList.toggle('hidden', !tr);
  if (tr) {
    $('res-tier').textContent = t(tr.name);
    $('res-tier').style.setProperty('--tc', tr.color);
  }
  $('res-stats').innerHTML = statCells(r)
    .map(([k, v]) => `<div class="stat"><div class="stat-k">${esc(k)}</div><div class="stat-v">${esc(v)}</div></div>`)
    .join('');
  renderAnalysis(r);

  const rr = $('res-routine');
  let hasNext = false;
  if (routine) {
    routine.results[routine.index] = r;
    hasNext = routine.index < routine.def.steps.length - 1;
    const rows = routine.def.steps
      .map(([id], i) => {
        const x = routine.results[i];
        const tierCell = bench ? `<td>${x ? tierBadge(tierFor(id, x.score)) : '—'}</td>` : '';
        return `<tr class="${i === routine.index ? 'cur' : ''}"><td>${i + 1}. ${esc(sName(id))}</td><td>${
          x ? x.score.toLocaleString() : '—'
        }</td><td>${x ? pct(x.accuracy) : '—'}</td>${tierCell}</tr>`;
      })
      .join('');
    const done = routine.results.filter(Boolean);
    const total = done.reduce((a, x) => a + x.score, 0);
    let footExtra = '';
    if (bench) {
      const ov = overallTier(routine.def.steps.map(([id], i) => routine.results[i] && tierFor(id, routine.results[i].score)));
      footExtra = `<td>${ov ? tierBadge(ov) : '—'}</td>`;
      if (!hasNext) {
        data.benchHistory.push({ date: Date.now(), scores: Object.fromEntries(done.map((x) => [x.scenarioId, x.score])) });
        while (data.benchHistory.length > 50) data.benchHistory.shift();
      }
    }
    rr.innerHTML = `<div class="small-label">${esc(t(routine.def.name))} ${hasNext ? t('진행 중') : t('완료!')}</div>
      <table class="routine-table"><thead><tr><th>${t('단계')}</th><th>${t('점수')}</th><th>${t('정확도')}</th>${bench ? `<th>${t('티어')}</th>` : ''}</tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><td>${t('합계')}</td><td>${total.toLocaleString()}</td><td>${
        done.length ? pct(done.reduce((a, x) => a + x.accuracy, 0) / done.length) : '—'
      }</td>${footExtra}</tr></tfoot></table>`;
    rr.classList.remove('hidden');
  } else {
    rr.classList.add('hidden');
  }
  store.save(data);

  $('res-next').classList.toggle('hidden', !hasNext);
  if (hasNext) {
    const [nid] = routine.def.steps[routine.index + 1];
    $('res-next').textContent = t('다음: {name} ▶', { name: sName(nid) });
    $('res-retry').classList.remove('primary');
    enterAction = nextStep;
    $('res-enter-label').textContent = t('다음 단계');
  } else {
    $('res-retry').classList.add('primary');
    enterAction = retry;
    $('res-enter-label').textContent = routine ? t('루틴 다시 하기') : t('다시 하기');
  }
  $('res-retry').textContent = routine && !hasNext ? t('루틴 다시 하기') : t('다시 하기');

  only('results');
  requestAnimationFrame(() => drawSpark($('res-spark'), rec.history));
}

function retry() {
  if (routine && routine.index >= routine.def.steps.length - 1 && routine.results.length === routine.def.steps.length) {
    routine = { ...routine, index: 0, results: [] };
    startRoutineStep();
  } else if (lastRun) {
    startRun(lastRun.id, lastRun.duration, lastRun.opts);
  }
}

function nextStep() {
  routine.index++;
  startRoutineStep();
}

function toMenu() {
  game.quit();
  routine = null;
  only('menu');
  renderPage();
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
  for (const tb of document.querySelectorAll('.tab-body')) tb.classList.toggle('hidden', tb.dataset.tab !== name);
}
for (const b of $('settings-tabs').querySelectorAll('button')) b.onclick = () => showTab(b.dataset.tab);

// 설정: 감도
function fillSenseOptions() {
  for (const sel of [$('set-game'), $('ob-game')]) {
    const v = sel.value;
    sel.textContent = '';
    for (const [k, p] of Object.entries(store.SENS_PRESETS)) {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = t(p.label);
      sel.appendChild(o);
    }
    if (v) sel.value = v;
  }
}
fillSenseOptions();
const setGame = $('set-game');

function fillSettings() {
  setGame.value = settings.sensGame;
  $('set-sens').value = store.fmtSens(store.getSens(settings));
  $('set-dpi').value = settings.dpi;
  $('set-fov').value = settings.fov;
  $('set-vol').value = Math.round(settings.volume * 100);
  $('set-fps').checked = settings.showFps;
  $('set-gfx').value = settings.graphics;
  $('set-lang').value = getLang();
  $('set-cb').value = settings.colorblind;
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
  $('set-sens-label').textContent = settings.sensGame === 'cm360' ? 'cm/360' : t('{game} 감도', { game: t(preset.label) });
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
    fovBtn.textContent = same
      ? t('✓ {game} 시야각 적용됨 ({fov}°)', { game: t(preset.label), fov: preset.fov })
      : t('{game} 시야각 적용 ({fov}°)', { game: t(preset.label), fov: preset.fov });
    fovBtn.disabled = same;
  }
  drawCrosshair($('ch-preview'), settings.crosshair, 180);
  renderSensTable();
  renderThemeGrid();
  renderKindGrid();
  renderSwatches();
  $('fire-key-btn').textContent = capturing
    ? t('키나 마우스 버튼을 누르세요… (Esc 취소)')
    : settings.fireKey
    ? bindLabel(settings.fireKey)
    : t('+ 추가 발사 키 지정');
  $('fire-key-btn').classList.toggle('capturing', capturing);
  $('fire-key-clear').classList.toggle('hidden', !settings.fireKey);
  let errs = [];
  try {
    errs = JSON.parse(localStorage.getItem(ERR_KEY) || '[]');
  } catch {
    errs = [];
  }
  $('error-count').textContent = t('저장된 오류 기록: {n}건', { n: errs.length });
}

function renderSensTable() {
  const rows = [];
  for (const [k, p] of Object.entries(store.SENS_PRESETS)) {
    if (k === 'cm360') continue;
    const saved = settings.sensByGame[k];
    const has = Number(saved) > 0;
    const active = k === settings.sensGame;
    rows.push(`<tr data-game="${k}" class="${active ? 'active' : ''}">
      <td>${active ? '▶ ' : ''}${esc(t(p.label))}</td>
      <td class="${has ? '' : 'unset'}">${has ? store.fmtSens(Number(saved)) : t('미설정')}</td>
      <td>${has ? store.cm360(settings, k).toFixed(1) : '—'}</td>
      <td>${store.fmtSens(store.convertTo(settings, k))}</td>
      <td>${active ? '' : `<button class="btn ghost small-btn" data-copy="${k}">${t('환산값 저장')}</button>`}</td>
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
    .map(([k, th]) => {
      const [a, b, c] = th.swatch;
      const bg = `linear-gradient(180deg, ${a} 0%, ${a} 55%, ${b} 100%)`;
      const grid = `repeating-linear-gradient(90deg, transparent 0 17px, ${c}33 17px 18px), repeating-linear-gradient(0deg, transparent 0 17px, ${c}22 17px 18px)`;
      return `<button class="option-card ${settings.theme === k ? 'on' : ''}" data-theme="${k}">
        <div class="option-preview" style="background:${grid}, ${bg}"><div style="position:absolute;left:0;right:0;bottom:22px;height:2px;background:${c}"></div></div>
        <div class="option-name">${esc(t(th.label))}</div></button>`;
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
  const c = game.nextColorPreview(kind);
  return c === 'rainbow' ? PALETTE[2] : c;
}
function renderKindGrid() {
  const bc = kindColor('bot');
  const track = [
    ['bot', true, t('사람 표적'), t('움직이는 사람 형태')],
    ['same', false, t('클릭 타겟과 동일'), t('{kind} 사용', { kind: t(TARGET_KINDS[settings.targetKind].label) })],
  ];
  $('track-grid').innerHTML = track
    .map(
      ([k, v, name, desc]) => `<button class="option-card ${settings.humanTracking === v ? 'on' : ''}" data-human="${v}">
        <div class="option-preview">${k === 'bot' ? KIND_ART.bot(bc) : KIND_ART[settings.targetKind](kindColor(settings.targetKind))}</div>
        <div class="option-name">${esc(name)}</div><div class="option-desc">${esc(desc)}</div></button>`
    )
    .join('');
  $('kind-grid').innerHTML = Object.entries(TARGET_KINDS)
    .filter(([k]) => k !== 'bot')
    .map(
      ([k, tk]) => `<button class="option-card ${settings.targetKind === k ? 'on' : ''}" data-kind="${k}">
        <div class="option-preview">${KIND_ART[k](kindColor(k))}</div>
        <div class="option-name">${esc(t(tk.label))}</div><div class="option-desc">${esc(t(tk.desc))}</div></button>`
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
});
$('track-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-human]');
  if (!b) return;
  settings.humanTracking = b.dataset.human === 'true';
  applySettings();
  updateSettingsReadouts();
});

const COLORS = ['auto', 'rainbow', '#ff3d5a', '#ff8a3d', '#ffd23d', '#2ef2b0', '#3fb8ff', '#4f6bff', '#b57bff', '#ff5cc8', '#ffffff'];
function renderSwatches() {
  $('color-swatches').innerHTML = COLORS.map((c) => {
    const on = settings.targetColor === c ? 'on' : '';
    if (c === 'auto') return `<button class="swatch auto ${on}" data-color="auto">${t('자동')}</button>`;
    if (c === 'rainbow')
      return `<button class="swatch ${on}" data-color="rainbow" style="background:conic-gradient(${PALETTE.join(',')},${PALETTE[0]})"></button>`;
    return `<button class="swatch ${on}" data-color="${c}" style="background:${c}"></button>`;
  }).join('');
}
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
  if (!id || !e.target.closest('#settings')) return;
  if (id === 'set-game') return switchGame(setGame.value);
  if (id === 'set-lang') return applyLanguage($('set-lang').value);
  if (id === 'set-sens') {
    const v = parseFloat($('set-sens').value);
    if (v > 0) settings.sensByGame[settings.sensGame] = v;
  }
  if (id === 'set-dpi') {
    const dpi = parseInt($('set-dpi').value, 10);
    if (dpi >= 50) settings.dpi = dpi;
  }
  if (id === 'set-cb') {
    settings.colorblind = $('set-cb').value;
    game.refreshDecor();
  }
  settings.fov = Number($('set-fov').value);
  settings.volume = Number($('set-vol').value) / 100;
  settings.showFps = $('set-fps').checked;
  settings.graphics = $('set-gfx').value;
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

$('copy-errors').onclick = () => {
  const txt = localStorage.getItem(ERR_KEY) || '[]';
  navigator.clipboard?.writeText(txt).then(() => toast(t('복사했어요')), () => prompt('errors', txt));
};
$('export-data').onclick = () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `popshot-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('redo-onboard').onclick = () => {
  hide('settings');
  openOnboarding();
};

// ───────────────────────── 추가 발사 키 지정
let capturing = false;
const MOUSE_NAMES = { 1: '휠 클릭', 2: '우클릭', 3: '마우스 4 (뒤로)', 4: '마우스 5 (앞으로)' };
function bindLabel(b) {
  if (!b) return '';
  if (b.type === 'mouse') return MOUSE_NAMES[b.button] ? t(MOUSE_NAMES[b.button]) : `Mouse ${b.button + 1}`;
  const c = b.code;
  const map = {
    Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt', AltRight: 'R-Alt', CapsLock: 'Caps Lock', Tab: 'Tab', Enter: 'Enter', Backquote: '`',
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
      $('fire-key-btn').textContent = t('R은 재시작 키라서 쓸 수 없어요');
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
document.addEventListener('mouseup', (e) => {
  if ((e.button === 3 || e.button === 4) && (capturing || document.pointerLockElement)) e.preventDefault();
});
document.addEventListener('contextmenu', (e) => {
  if (capturing) e.preventDefault();
});

// ───────────────────────── 설정 모달
function openSettings(tab) {
  fillSettings();
  if (typeof tab === 'string') showTab(tab);
  show('settings');
}
function closeSettings() {
  if (capturing) setCapturing(false);
  hide('settings');
  renderPage();
}
$('nav-settings').onclick = () => openSettings();
$('side-sens').onclick = () => openSettings('sens');
$('settings-close').onclick = closeSettings;
$('settings-done').onclick = closeSettings;
$('settings').addEventListener('click', (e) => {
  if (e.target.id === 'settings') closeSettings();
});
$('reset-records').onclick = () => {
  if (confirm(t('모든 최고 기록과 히스토리를 삭제할까요?'))) {
    store.resetRecords(data);
    renderPage();
  }
};

// ───────────────────────── 입력 진단 · DPI 측정
const diag = { counts: 0, events: 0, rate: 0, frames: 0, fps: 0, t0: performance.now(), raw: false };
function diagLocked() {
  return document.pointerLockElement === $('diag-area');
}
function onDiagMove(e) {
  if (!diagLocked()) return;
  diag.counts += e.movementX || 0;
  diag.events++;
}
document.addEventListener(game.rawInput ? 'pointerrawupdate' : 'mousemove', onDiagMove);
$('diag-area').onclick = () => {
  if (diagLocked()) return;
  const el = $('diag-area');
  diag.raw = true;
  let p;
  try {
    p = el.requestPointerLock({ unadjustedMovement: true });
  } catch {
    diag.raw = false;
    p = el.requestPointerLock();
  }
  p?.catch?.(() => {
    diag.raw = false;
    el.requestPointerLock();
  });
};
function updateDiag() {
  const now = performance.now();
  diag.frames++;
  if (now - diag.t0 >= 500) {
    const s = (now - diag.t0) / 1000;
    diag.rate = Math.round(diag.events / s);
    diag.fps = Math.round(diag.frames / s);
    diag.events = 0;
    diag.frames = 0;
    diag.t0 = now;
  }
  $('dg-rate').textContent = diagLocked() ? `${diag.rate} Hz` : '—';
  $('dg-fps').textContent = `${diag.fps} FPS`;
  $('dg-counts').textContent = Math.round(diag.counts).toLocaleString();
  $('dg-raw').textContent = diagLocked()
    ? (diag.raw ? t('Raw 입력 (가속 무시)') : t('일반 입력 (OS 가속 영향)')) + (game.rawInput ? ' · pointerrawupdate' : '')
    : t('영역을 클릭하세요');
  const cm = Number($('dg-cm').value) || 10;
  const dpi = Math.abs(diag.counts) / (cm / 2.54);
  $('dg-dpi').innerHTML = `<b>${dpi ? Math.round(dpi) : '—'} DPI</b><span>${t('측정값')}</span>`;
  $('dg-apply').disabled = dpi < 100;
}
$('dg-reset').onclick = (e) => {
  e.stopPropagation();
  diag.counts = 0;
};
$('dg-apply').onclick = (e) => {
  e.stopPropagation();
  const cm = Number($('dg-cm').value) || 10;
  const dpi = Math.round(Math.abs(diag.counts) / (cm / 2.54) / 50) * 50;
  if (dpi >= 100) {
    settings.dpi = dpi;
    $('set-dpi').value = dpi;
    $('ob-dpi').value = dpi;
    applySettings();
    updateSettingsReadouts();
    updateObReadout();
    toast(t('DPI를 {n}으로 설정했어요', { n: dpi }));
  }
};
function openDiag() {
  diag.counts = 0;
  show('diag');
}
function closeDiag() {
  if (diagLocked()) document.exitPointerLock();
  hide('diag');
}
$('open-diag').onclick = openDiag;
$('diag-close').onclick = closeDiag;

// ───────────────────────── 첫 실행 안내
let obStep = 0;
function updateObReadout() {
  $('ob-readout').innerHTML = `<b>${store.cm360(settings).toFixed(1)} cm/360</b><span>${t('360° 회전에 필요한 마우스 이동 거리')}</span>`;
}
function showObStep(i) {
  obStep = i;
  for (const s of document.querySelectorAll('.ob-step')) s.classList.toggle('hidden', Number(s.dataset.step) !== i);
  $('ob-dots').innerHTML = [0, 1, 2].map((k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
  $('ob-back').classList.toggle('hidden', i === 0);
  $('ob-next').classList.toggle('hidden', i === 2);
  for (const b of $('ob-lang').querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === getLang());
  if (i === 1) {
    $('ob-game').value = settings.sensGame;
    $('ob-sens').value = store.fmtSens(store.getSens(settings));
    $('ob-dpi').value = settings.dpi;
    updateObReadout();
  }
}
function openOnboarding() {
  show('onboard');
  showObStep(0);
}
function finishOnboarding() {
  settings.onboarded = true;
  store.save(data);
  hide('onboard');
}
for (const b of $('ob-lang').querySelectorAll('button')) {
  b.onclick = () => {
    applyLanguage(b.dataset.v);
    showObStep(0);
  };
}
$('ob-game').onchange = () => {
  const g = $('ob-game').value;
  if (!(Number(settings.sensByGame[g]) > 0)) settings.sensByGame[g] = store.SENS_PRESETS[g].def;
  settings.sensGame = g;
  $('ob-sens').value = store.fmtSens(store.getSens(settings));
  const f = store.SENS_PRESETS[g].fov;
  if (f) settings.fov = f;
  applySettings();
  updateObReadout();
};
$('ob-sens').oninput = () => {
  const v = parseFloat($('ob-sens').value);
  if (v > 0) settings.sensByGame[settings.sensGame] = v;
  applySettings();
  updateObReadout();
};
$('ob-dpi').oninput = () => {
  const v = parseInt($('ob-dpi').value, 10);
  if (v >= 50) settings.dpi = v;
  applySettings();
  updateObReadout();
};
$('ob-measure').onclick = openDiag;
$('ob-next').onclick = () => showObStep(Math.min(2, obStep + 1));
$('ob-back').onclick = () => showObStep(Math.max(0, obStep - 1));
$('ob-bench').onclick = () => {
  finishOnboarding();
  showPage('bench');
  startBenchmark(BENCHMARK.steps);
};
$('ob-skip').onclick = finishOnboarding;

// ───────────────────────── PWA (설치 · 오프라인)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ───────────────────────── 루프
let last = performance.now();
let fpsFrames = 0, fpsTime = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  world.render();
  if (!$('diag').classList.contains('hidden')) updateDiag();
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

document.documentElement.lang = getLang();
applyI18n(document);
applySettings();
showPage('play');
const imported = checkImport();
if (!settings.onboarded && !data.log.length && !imported) openOnboarding();
requestAnimationFrame(loop);

// 디버그용 (브라우저 콘솔에서 popshot.game 접근)
window.popshot = { game, settings, data };
