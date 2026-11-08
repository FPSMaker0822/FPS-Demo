import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../js/storage.js';
import { sanitizeCustom, encodeShare, decodeShare, CUSTOM_FIELDS } from '../js/custom.js';
import { tierFor, overallTier, weakestCategory, analyzeRun, BENCH_TOP, TIERS } from '../js/analysis.js';

const approx = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

// ── 감도 변환
test('degrees per count follows each game yaw', () => {
  const s = { sensGame: 'valorant', sensByGame: { valorant: 0.4 }, dpi: 800 };
  approx(store.degPerCount(s), 0.028);
  approx(store.degPerCount({ ...s, sensGame: 'cs2', sensByGame: { cs2: 1 } }), 0.022);
});

test('cm/360 matches the textbook formula', () => {
  // CS2 sens 1 @ 800 DPI = 360 / (0.022 * 800) inches = 20.4545 in = 51.95 cm
  const s = { sensGame: 'cs2', sensByGame: { cs2: 1 }, dpi: 800 };
  approx(store.cm360(s), (360 / 0.022 / 800) * 2.54, 1e-9);
});

test('converting between games keeps the same cm/360', () => {
  const s = { sensGame: 'valorant', sensByGame: { valorant: 0.35 }, dpi: 1600 };
  for (const g of Object.keys(store.SENS_PRESETS)) {
    const v = store.convertTo(s, g);
    const s2 = { ...s, sensGame: g, sensByGame: { [g]: v } };
    approx(store.cm360(s2), store.cm360(s), 1e-6);
  }
  approx(store.convertTo(s, 'cs2'), (0.35 * 0.07) / 0.022, 1e-9);
});

test('cm360 mode uses the entered distance directly', () => {
  const s = { sensGame: 'cm360', sensByGame: { cm360: 40 }, dpi: 800 };
  approx(store.cm360(s), 40, 1e-9);
});

test('record keeps best score and history', () => {
  const data = { best: {}, history: {}, log: [] };
  const base = { scenarioId: 'grid', difficulty: 'normal', duration: 60, mode: 'timed', accuracy: 0.9, date: 1 };
  assert.equal(store.record(data, { ...base, score: 100 }).isBest, true);
  assert.equal(store.record(data, { ...base, score: 50 }).isBest, false);
  const r = store.record(data, { ...base, score: 150 });
  assert.equal(r.isBest, true);
  assert.equal(r.prevBest, 100);
  assert.equal(data.log.length, 3);
});

// ── 커스텀 시나리오
test('sanitizeCustom clamps values and strips unsafe text', () => {
  const c = sanitizeCustom({ name: '<img src=x onerror=alert(1)>Evil', count: 999, size: -5, type: 'weird', extra: 'x' });
  assert.equal(c.count, CUSTOM_FIELDS.count.max);
  assert.equal(c.size, CUSTOM_FIELDS.size.min);
  assert.equal(c.type, 'click');
  assert.ok(!c.name.includes('<') && !c.name.includes('>'));
  assert.equal(c.extra, undefined);
  assert.equal(sanitizeCustom({ count: 'abc' }).count, CUSTOM_FIELDS.count.def);
});

test('share code round-trips and rejects garbage', () => {
  const cfg = sanitizeCustom({ name: '내 시나리오 🎯', type: 'track', count: 2, moveSpeed: 30, hp: 1.5 });
  const back = decodeShare(encodeShare(cfg));
  assert.deepEqual({ ...back, id: undefined }, { ...cfg, id: undefined });
  assert.equal(decodeShare('!!!not-base64'), null);
  assert.equal(decodeShare('x'.repeat(5000)), null);
});

// ── 랭크 · 분석
test('tiers are monotonic and cap at the top tier', () => {
  let prev = -1;
  for (let f = 0; f <= 1.2; f += 0.05) {
    const tr = tierFor('six', BENCH_TOP.six * f);
    assert.ok(tr.idx >= prev);
    prev = tr.idx;
  }
  assert.equal(tierFor('six', BENCH_TOP.six * 2).idx, TIERS.length - 1);
  assert.equal(tierFor('six', BENCH_TOP.six * 2).next, null);
  assert.equal(tierFor('unknown', 100), null);
});

test('overall tier and weakest category', () => {
  const ov = overallTier([tierFor('six', BENCH_TOP.six), tierFor('micro', 0)]);
  assert.ok(ov.idx >= 3 && ov.idx <= 4);
  const weak = weakestCategory({ six: BENCH_TOP.six, tracking: 100 }, (id) => (id === 'six' ? 'click' : 'track'));
  assert.equal(weak.cat, 'track');
});

test('analyzeRun detects overflicking and slow directions', () => {
  const flicks = [];
  for (let i = 0; i < 8; i++) flicks.push({ dx: 15, dy: 0, t: 0.3 }, { dx: -15, dy: 0, t: 0.6 });
  const misses = Array.from({ length: 8 }, () => ({ along: 1.2, perp: 0.1 }));
  const a = analyzeRun({ flicks, misses });
  assert.equal(a.dirs.right.n, 8);
  assert.ok(a.insights.some((i) => i.key === 'overflick'));
  assert.ok(a.insights.some((i) => i.key === 'slowDir' && i.dir === 'left'));
});

test('analyzeRun detects tracking fatigue', () => {
  const timeline = [0.9, 0.9, 0.85, 0.6, 0.55, 0.5].map((v) => ({ hit: v * 100, total: 100 }));
  assert.ok(analyzeRun({ timeline }).insights.some((i) => i.key === 'fatigue'));
});

test('analyzeRun never throws on malformed input', () => {
  for (const bad of [undefined, null, {}, { misses: NaN }, { flicks: 3, misses: 'x', timeline: {} }]) {
    assert.doesNotThrow(() => analyzeRun(bad ?? undefined));
  }
});

test('recommendSens finds the peak of a smooth curve', async () => {
  const { recommendSens, SENS_FINDER_MULTS } = await import('../js/analysis.js');
  // 점수가 배율 1.1 근처에서 최고인 곡선
  const pts = SENS_FINDER_MULTS.map((mult) => ({ mult, score: 1000 - 4000 * (Math.log(mult) - Math.log(1.1)) ** 2 }));
  const r = recommendSens(pts);
  assert.ok(r.fitted);
  assert.ok(Math.abs(r.mult - 1.1) < 0.01, `got ${r.mult}`);
});

test('recommendSens falls back to the best score and stays in range', async () => {
  const { recommendSens } = await import('../js/analysis.js');
  // 오르기만 하는 경우 → 범위 끝(1.4)
  const up = recommendSens([0.7, 0.85, 1, 1.2, 1.4].map((mult, i) => ({ mult, score: i * 100 })));
  assert.ok(up.mult <= 1.4 + 1e-9 && up.mult >= 1.2);
  assert.equal(recommendSens([]), null);
  assert.equal(recommendSens([{ mult: 1, score: 5 }]).mult, 1);
});

test('mergeData combines records from another PC safely', async () => {
  const { mergeData } = await import('../js/storage.js');
  const data = {
    best: { 'grid|normal|60': { score: 500, accuracy: 0.9, date: 1 } },
    history: { 'grid|normal|60': [{ score: 500, accuracy: 0.9, date: 1 }] },
    log: [{ id: 'grid', score: 500, accuracy: 0.9, date: 1 }],
    bench: { six: 100 },
    customs: [],
  };
  const incoming = {
    best: { 'grid|normal|60': { score: 800, accuracy: 0.8, date: 2 }, '<script>': { score: 1, accuracy: 1, date: 1 } },
    history: { 'grid|normal|60': [{ score: 500, accuracy: 0.9, date: 1 }, { score: 800, accuracy: 0.8, date: 2 }] },
    log: [{ id: 'grid', score: 500, accuracy: 0.9, date: 1 }, { id: 'grid', score: 800, accuracy: 0.8, date: 2 }, { id: 'bad id!', score: 1, accuracy: 1, date: 3 }],
    bench: { six: 50, micro: 900 },
    customs: [{ id: 'abcd1234', name: 'X', count: 99 }],
  };
  const r = mergeData(data, incoming, sanitizeCustom);
  assert.equal(r.added, 1);
  assert.equal(data.best['grid|normal|60'].score, 800);
  assert.equal(data.best['<script>'], undefined);
  assert.equal(data.history['grid|normal|60'].length, 2);
  assert.deepEqual(data.bench, { six: 100, micro: 900 });
  assert.equal(data.customs[0].count, 8);
  // 다시 합쳐도 중복되지 않음
  assert.equal(mergeData(data, incoming, sanitizeCustom).added, 0);
  assert.throws(() => mergeData(data, { hello: 1 }));
});

test('recommendSens prefers the current sensitivity on ties', async () => {
  const { recommendSens } = await import('../js/analysis.js');
  assert.equal(recommendSens([0.7, 0.85, 1, 1.2, 1.4].map((mult) => ({ mult, score: 3000 }))).mult, 1);
});
