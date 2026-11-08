// 실력 분석 · 랭크 (DOM/three 의존 없음 → 단위 테스트 가능)

export const TIERS = [
  { name: '아이언', color: '#8b8f99' },
  { name: '브론즈', color: '#c08457' },
  { name: '실버', color: '#c7d0dc' },
  { name: '골드', color: '#ffcf4d' },
  { name: '플래티넘', color: '#4fd1c5' },
  { name: '다이아몬드', color: '#7aa8ff' },
  { name: '마스터', color: '#c084fc' },
  { name: '그랜드마스터', color: '#ff5c7a' },
];
// 각 티어 시작 비율 (최상위 기준점 대비)
const TIER_FRAC = [0, 0.25, 0.38, 0.5, 0.6, 0.7, 0.8, 0.9];

// 벤치마크(45초 · 보통 · 고정 시드) 그랜드마스터 기준 점수.
// 점수 공식에서 숙련자의 처치 속도/정확도를 가정해 계산한 '임시 기준'이며, 실제 플레이 데이터로 보정이 필요합니다.
export const BENCH_TOP = {
  six: 18000,
  motion: 14000,
  spider: 21000,
  micro: 24000,
  strafe: 11500,
  tracking: 12000,
  switching: 15500,
  reaction: 6500,
};

export function tierFor(id, score) {
  const top = BENCH_TOP[id];
  if (!top || score == null) return null;
  const frac = score / top;
  let idx = 0;
  for (let i = 0; i < TIER_FRAC.length; i++) if (frac >= TIER_FRAC[i]) idx = i;
  const next = idx < TIER_FRAC.length - 1 ? Math.ceil(TIER_FRAC[idx + 1] * top) : null;
  const cur = TIER_FRAC[idx] * top;
  const progress = next ? Math.min(1, Math.max(0, (score - cur) / (next - cur))) : 1;
  return { idx, ...TIERS[idx], next, progress };
}

/** 여러 시나리오 티어의 평균 → 종합 티어 */
export function overallTier(tiers) {
  const v = tiers.filter(Boolean);
  if (!v.length) return null;
  const avg = v.reduce((a, t) => a + t.idx, 0) / v.length;
  const idx = Math.min(TIERS.length - 1, Math.floor(avg + 1e-9));
  return { idx, ...TIERS[idx], avg };
}

/** 카테고리별 평균 티어 지수 → 가장 약한 카테고리 */
export function weakestCategory(benchBest, catOf) {
  const sums = {};
  for (const [id, score] of Object.entries(benchBest)) {
    const t = tierFor(id, score);
    const cat = catOf(id);
    if (!t || !cat) continue;
    (sums[cat] ||= []).push(t.idx + t.progress);
  }
  let worst = null;
  for (const [cat, arr] of Object.entries(sums)) {
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    if (!worst || avg < worst.avg) worst = { cat, avg };
  }
  return worst;
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/**
 * 한 판 분석.
 * flicks: [{ dx, dy, t }] 직전 명중 위치 → 다음 타겟 (화면 기준 도 단위, 오른쪽/위 +) 와 걸린 시간
 * misses: [{ along, perp, r }] 빗나간 지점: 플릭 방향 성분(+면 지나침), 수직 성분, 타겟 각반경
 * timeline: [{ hit, total }] 5초 구간별 트래킹 판정
 */
export function analyzeRun({ flicks = [], misses = [], timeline = [] } = {}) {
  const out = { insights: [] };

  if (flicks.length >= 5) {
    const dirs = { left: [], right: [], up: [], down: [] };
    const short = [], long = [];
    for (const f of flicks) {
      const dist = Math.hypot(f.dx, f.dy);
      if (dist < 0.5) continue;
      const key = Math.abs(f.dx) >= Math.abs(f.dy) ? (f.dx > 0 ? 'right' : 'left') : f.dy > 0 ? 'up' : 'down';
      dirs[key].push(f.t);
      (dist < 10 ? short : long).push(f.t);
    }
    out.dirs = Object.fromEntries(Object.entries(dirs).map(([k, v]) => [k, { n: v.length, avg: mean(v) }]));
    out.short = { n: short.length, avg: mean(short) };
    out.long = { n: long.length, avg: mean(long) };

    const valid = Object.entries(out.dirs).filter(([, d]) => d.n >= 3);
    if (valid.length >= 2) {
      valid.sort((a, b) => b[1].avg - a[1].avg);
      const [slowK, slow] = valid[0];
      const [, fast] = valid[valid.length - 1];
      if (slow.avg > fast.avg * 1.15) out.insights.push({ key: 'slowDir', dir: slowK, pct: Math.round((slow.avg / fast.avg - 1) * 100) });
    }
  }

  const mv = misses.filter((m) => Number.isFinite(m.along));
  if (mv.length >= 3) {
    const over = mv.filter((m) => m.along > 0).length;
    const under = mv.length - over;
    out.over = over;
    out.under = under;
    out.avgOff = mean(mv.map((m) => Math.hypot(m.along, m.perp)));
    if (over >= under * 1.6) out.insights.push({ key: 'overflick', pct: Math.round((over / mv.length) * 100) });
    else if (under >= over * 1.6) out.insights.push({ key: 'underflick', pct: Math.round((under / mv.length) * 100) });
  }

  const tl = timeline.filter((b) => b && b.total > 0);
  if (tl.length >= 3) {
    out.timeline = tl.map((b) => b.hit / b.total);
    const half = Math.floor(out.timeline.length / 2);
    const first = mean(out.timeline.slice(0, half));
    const last = mean(out.timeline.slice(-half));
    if (first - last > 0.08) out.insights.push({ key: 'fatigue', pct: Math.round((first - last) * 100) });
    else if (last - first > 0.08) out.insights.push({ key: 'warmup', pct: Math.round((last - first) * 100) });
  }
  return out;
}
