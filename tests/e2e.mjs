// 브라우저 E2E 스모크 테스트: 정적 서버를 띄우고 Chromium으로 주요 흐름을 실제로 실행
// 실행: node tests/e2e.mjs  (playwright 필요)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT)) throw new Error('bad path');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
let failed = false;

async function newPage(storage) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  // 외부 리소스(폰트 CDN)는 차단해서 네트워크 상태와 무관하게 테스트
  await page.route('**/*', (route) => (route.request().url().startsWith(BASE) ? route.continue() : route.abort()));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    // 외부 폰트 CDN 차단 등 네트워크 오류는 무시
    if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push(m.text());
  });
  await page.addInitScript((st) => {
    if (st && !sessionStorage.getItem('seeded')) {
      localStorage.setItem('popshot.v1', JSON.stringify(st));
      sessionStorage.setItem('seeded', '1');
    }
    // 헤드리스에서는 포인터 락이 안 되므로 흉내
    let locked = null;
    Object.defineProperty(Document.prototype, 'pointerLockElement', { get: () => locked });
    Element.prototype.requestPointerLock = function () {
      locked = this;
      setTimeout(() => document.dispatchEvent(new Event('pointerlockchange')), 5);
      return Promise.resolve();
    };
    Document.prototype.exitPointerLock = function () {
      locked = null;
      setTimeout(() => document.dispatchEvent(new Event('pointerlockchange')), 5);
    };
  }, storage);
  await page.goto(BASE);
  await page.waitForFunction(() => window.popshot);
  return page;
}

async function step(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed = true;
    console.log(`FAIL ${name}\n     ${e.message.split('\n')[0]}`);
  }
}

const skipCountdown = (page) => page.evaluate(() => (window.popshot.game.countdown = 0.01));
const aimAndFire = (page) =>
  page.evaluate(() => {
    const g = window.popshot.game;
    const t = g.targets[0];
    if (!t) return false;
    const d = t.position.clone().sub(g.camera.position);
    g.yaw = Math.atan2(-d.x, -d.z);
    g.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    g.applyCamera();
    document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    document.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    return true;
  });
const endRun = (page) =>
  page.evaluate(() => {
    const g = window.popshot.game;
    g.time = 9999;
    if (g.def.mode === 'rounds') g.finish();
  });

// 1) 첫 실행 안내 + 영어 전환
await step('onboarding shows on first visit and switches language', async () => {
  const page = await newPage(null);
  await page.waitForSelector('#onboard:not(.hidden)');
  await page.click('#ob-lang [data-v="en"]');
  assert.equal((await page.textContent('.nav-item[data-page="play"] span')).trim(), 'Play');
  await page.click('#ob-next');
  await page.selectOption('#ob-game', 'cs2');
  await page.fill('#ob-sens', '1.5');
  await page.dispatchEvent('#ob-sens', 'input');
  assert.match(await page.textContent('#ob-readout'), /34\.6 cm\/360/);
  await page.click('#ob-next');
  await page.click('#ob-skip');
  assert.equal(await page.isHidden('#onboard'), true);
  await page.close();
});

const seeded = { settings: { onboarded: true, lang: 'ko' } };

// 2) 모든 시나리오 실행 + 결과/분석
await step('every built-in scenario runs and produces results', async () => {
  const page = await newPage(seeded);
  const all = await page.evaluate(async () => (await import('./js/scenarios.js')).BENCHMARK.steps);
  const extra = ['grid', 'flick', 'precision', 'rise'];
  for (const id of [...all, ...extra]) {
    await page.evaluate((id) => {
      document.getElementById('menu').classList.add('hidden');
      document.getElementById('results').classList.add('hidden');
      window.popshot.game.begin(id, { duration: 30 });
      window.popshot.game.requestLock();
    }, id);
    await page.waitForTimeout(50);
    await skipCountdown(page);
    await page.waitForFunction(() => window.popshot.game.state === 'playing');
    if (id !== 'reaction') {
      await page.waitForFunction(() => window.popshot.game.targets.length > 0, null, { timeout: 5000 });
      for (let i = 0; i < 3; i++) {
        await aimAndFire(page);
        await page.waitForTimeout(40);
      }
    }
    await endRun(page);
    await page.waitForSelector('#results:not(.hidden)');
  }
  const plays = await page.evaluate(() => window.popshot.data.log.length);
  assert.equal(plays, 12);
  await page.close();
});

// 2-1) 빗나간 샷이 섞인 판도 결과/분석이 정상 (실제 오류 재현: misses 이름 충돌)
await step('runs with missed shots finish without errors and show analysis', async () => {
  const page = await newPage(seeded);
  await page.evaluate(() => {
    document.getElementById('menu').classList.add('hidden');
    window.popshot.game.begin('spider', { duration: 30 });
    window.popshot.game.requestLock();
  });
  await page.waitForTimeout(50);
  await skipCountdown(page);
  await page.waitForFunction(() => window.popshot.game.targets.length > 0);
  for (let i = 0; i < 8; i++) {
    await aimAndFire(page);
    await page.waitForTimeout(40);
    // 타겟 옆을 쏴서 빗나가게
    await page.evaluate(() => {
      const g = window.popshot.game;
      g.yaw += 0.03;
      g.applyCamera();
      document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
      document.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    });
    await page.waitForTimeout(40);
  }
  const misses = await page.evaluate(() => window.popshot.game.stats.misses);
  assert.ok(misses >= 4, `expected misses, got ${misses}`);
  await endRun(page);
  await page.waitForSelector('#results:not(.hidden)');
  assert.equal(await page.evaluate(() => localStorage.getItem('popshot.errors')), null);
  assert.ok(await page.isVisible('#res-analysis'));
  await page.close();
});

// 3) 벤치마크: 같은 시드면 같은 배치
await step('benchmark uses a fixed seed and assigns a tier', async () => {
  const page = await newPage(seeded);
  const layout = async () => {
    await page.click('.nav-item[data-page="bench"]');
    await page.click('[data-bench-one="six"]');
    await skipCountdown(page);
    await page.waitForFunction(() => window.popshot.game.targets.length === 6);
    const pos = await page.evaluate(() => window.popshot.game.targets.map((t) => t.position.toArray().map((v) => v.toFixed(3)).join(',')).join('|'));
    await aimAndFire(page);
    await endRun(page);
    await page.waitForSelector('#results:not(.hidden)');
    await page.click('#res-menu');
    return pos;
  };
  const a = await layout();
  const b = await layout();
  assert.equal(a, b);
  assert.ok(await page.evaluate(() => window.popshot.data.bench.six > 0));
  await page.close();
});

// 4) 커스텀 시나리오 만들기 → 공유 → 가져오기
await step('custom scenario can be created, played and imported from a share link', async () => {
  const page = await newPage(seeded);
  await page.click('.nav-item[data-page="create"]');
  await page.click('#create-new');
  await page.fill('#ed-name', 'E2E <b>test</b>');
  await page.click('#ed-save');
  const cfg = await page.evaluate(() => window.popshot.data.customs[0]);
  assert.ok(cfg && !cfg.name.includes('<'));
  const code = await page.evaluate(async (c) => (await import('./js/custom.js')).encodeShare(c), cfg);
  await page.goto(BASE + '#s=' + code);
  await page.waitForSelector('#import:not(.hidden)');
  await page.click('#import-ok');
  assert.equal(await page.evaluate(() => window.popshot.data.customs.length), 2);
  await page.click('#custom-grid .card');
  await skipCountdown(page);
  await page.waitForFunction(() => window.popshot.game.targets.length > 0);
  await page.close();
});

// 5) 설정: 색약 모드, 그래픽 품질, 진단 창
await step('settings: colorblind mode, graphics quality and diagnostics', async () => {
  const page = await newPage(seeded);
  await page.click('#nav-settings');
  await page.click('#settings-tabs [data-tab="general"]');
  await page.selectOption('#set-cb', 'deut');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.cb), 'deut');
  await page.click('#settings-tabs [data-tab="visual"]');
  await page.selectOption('#set-gfx', 'low');
  assert.equal(await page.evaluate(() => window.popshot.game.world.quality), 'low');
  await page.click('#settings-tabs [data-tab="sens"]');
  await page.click('#open-diag');
  await page.click('#diag-area');
  await page.evaluate(() => {
    for (let i = 0; i < 10; i++) document.dispatchEvent(new PointerEvent(window.popshot.game.rawInput ? 'pointerrawupdate' : 'mousemove', { movementX: 315 }));
  });
  await page.fill('#dg-cm', '10');
  await page.waitForFunction(() => /800 DPI/.test(document.getElementById('dg-dpi').textContent));
  await page.close();
});

await browser.close();
server.close();
if (errors.length) {
  failed = true;
  console.log('Console errors:\n  ' + errors.join('\n  '));
}
console.log(failed ? '\nE2E FAILED' : '\nE2E passed');
process.exit(failed ? 1 : 0);
