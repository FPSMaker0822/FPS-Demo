// 연습 시나리오 & 루틴 정의
import * as THREE from 'three';
import { EYE_HEIGHT } from './world.js';

import { t } from './i18n.js';
import { sanitizeCustom } from './custom.js';

// 시드 고정 난수 (벤치마크는 매번 같은 배치로 공정하게)
let rng = Math.random;
export function setSeed(seed) {
  if (seed == null) {
    rng = Math.random;
    return;
  }
  let a = seed >>> 0;
  rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = (a, b) => a + rng() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDist = (a, b) => Math.hypot(a.yaw - b.yaw, a.pitch - b.pitch);

export const DIFFICULTY = {
  easy: { label: '쉬움', size: 1.3, speed: 0.75, life: 1.35 },
  normal: { label: '보통', size: 1, speed: 1, life: 1 },
  hard: { label: '어려움', size: 0.72, speed: 1.3, life: 0.75 },
};

/** 다른 타겟과 최소 각도만큼 떨어진 랜덤 방향 */
function pickDir(g, yawR, pitchR, minSep, exclude = []) {
  let p, tries = 0;
  const others = [...g.targets.map((b) => b.data.dir).filter(Boolean), ...exclude];
  const sep = minSep * (g.kind === 'bot' ? 1.35 : 1);
  do {
    p = { yaw: rand(-yawR, yawR), pitch: rand(pitchR[0], pitchR[1]) };
    tries++;
  } while (tries < 30 && others.some((o) => angDist(o, p) < sep));
  return p;
}

/** 박스 안에서 부드럽게 방향을 바꾸며 떠다니는 움직임 */
const BOX = { x: 7.5, y0: 1.6, y1: 6.8 };
function wander(b, dt, maxV, box = BOX) {
  const d = b.data;
  if (d.vx === undefined) Object.assign(d, { vx: 0, vy: 0, tvx: 0, tvy: 0, turn: 0 });
  d.turn -= dt;
  if (d.turn <= 0) {
    d.turn = rand(0.35, 1.1);
    let v = rand(-1, 1);
    if (Math.abs(v) < 0.35) v = Math.sign(v || 1) * 0.35;
    d.tvx = v * maxV;
    d.tvy = rand(-0.6, 0.6) * maxV * 0.5;
  }
  const k = Math.min(1, dt * 6);
  d.vx += (d.tvx - d.vx) * k;
  d.vy += (d.tvy - d.vy) * k;
  if (box.y0 === box.y1) d.vy = d.tvy = 0;
  const p = b.position;
  p.x += d.vx * dt;
  p.y += d.vy * dt;
  if (p.x < -box.x || p.x > box.x) {
    p.x = clamp(p.x, -box.x, box.x);
    d.vx *= -1;
    d.tvx *= -1;
  }
  if (p.y < box.y0 || p.y > box.y1) {
    p.y = clamp(p.y, box.y0, box.y1);
    d.vy *= -1;
    d.tvy *= -1;
  }
}

/** 트래킹 공통: 맞히는 동안 부풀다가 터짐 */
function trackDamage(g, b, dt, hpTime) {
  g.addScore(10);
  b.data.lit = 0.1;
  b.data.hp -= dt / hpTime;
  if (b.kind === 'balloon') b.inflate = 1 + (1 - b.data.hp) * 0.35;
  b.setHp(b.data.hp);
  if (b.data.hp <= 0) {
    g.stats.pops++;
    g.pop(b, 150);
    return true;
  }
  return false;
}
function trackGlow(b, dt) {
  b.data.lit = Math.max(0, (b.data.lit || 0) - dt);
  b.setLit(b.data.lit > 0);
}
/** 움직이는 타겟 영역: 봇은 바닥에 서서 좌우로, 나머지는 공중에서 */
function moveBox(g, r) {
  if (g.kind !== 'bot') return BOX;
  const y = g.standY(r);
  return { x: 7.5, y0: y, y1: y };
}

// ─────────────────────────────────────────────── 풍선 플릭
class Flick {
  constructor(g) {
    this.g = g;
    this.last = { yaw: 0, pitch: 0 };
  }
  start() {
    this.spawn();
  }
  spawn() {
    const p = pickDir(this.g, 34, [0, 22], 14, [this.last]);
    this.last = p;
    this.g.spawn({ position: this.g.dirPos(p.yaw, p.pitch, 18), radius: 0.55 * this.g.diff.size });
  }
  onShoot(hit) {
    if (!hit) return;
    const g = this.g;
    const kt = g.time - hit.spawnAt;
    g.stats.killTimes.push(kt);
    g.pop(hit, 100 + Math.round(100 * clamp((1.2 - kt) / 0.9, 0, 1)));
    this.spawn();
  }
}

// ─────────────────────────────────────────────── 풍선 그리드 (3개 동시)
class Grid {
  constructor(g) {
    this.g = g;
    this.N = 5;
    this.rows = g.kind === 'bot' ? 3 : 5;
    this.spacing = 1.8;
    this.spacingY = g.kind === 'bot' ? 2.7 * g.diff.size : 1.8;
    this.lastKill = 0;
  }
  cellPos(i) {
    const c = i % this.N, r = Math.floor(i / this.N);
    const half = (this.N - 1) / 2, halfR = (this.rows - 1) / 2;
    const cy = this.g.kind === 'bot' ? 5.0 : 5.4;
    return new THREE.Vector3((c - half) * this.spacing, cy + (r - halfR) * this.spacingY, -14);
  }
  start() {
    this.lastKill = this.g.time;
    for (let i = 0; i < 3; i++) this.spawn(-1);
  }
  spawn(exclude) {
    const used = new Set(this.g.targets.map((b) => b.data.cell));
    const free = [];
    for (let i = 0; i < this.N * this.rows; i++) if (!used.has(i) && i !== exclude) free.push(i);
    const cell = free[Math.floor(rng() * free.length)];
    const b = this.g.spawn({ position: this.cellPos(cell), radius: 0.62 * this.g.diff.size });
    b.data.cell = cell;
  }
  onShoot(hit) {
    if (!hit) return;
    const g = this.g;
    g.stats.killTimes.push(g.time - this.lastKill);
    this.lastKill = g.time;
    const cell = hit.data.cell;
    g.pop(hit, 100 + Math.min(g.stats.streak, 10) * 5);
    this.spawn(cell);
  }
}

// ─────────────────────────────────────────────── 식스 풍선 (작은 풍선 6개 동시)
class Six {
  constructor(g) {
    this.g = g;
    this.lastKill = 0;
  }
  start() {
    this.lastKill = this.g.time;
    for (let i = 0; i < 6; i++) this.spawn();
  }
  spawn() {
    const g = this.g;
    const p = pickDir(g, 22, [1, 16], 6);
    const b = g.spawn({ position: g.dirPos(p.yaw, p.pitch, 15), radius: 0.36 * g.diff.size });
    b.data.dir = p;
  }
  onShoot(hit) {
    if (!hit) return;
    const g = this.g;
    g.stats.killTimes.push(g.time - this.lastKill);
    this.lastKill = g.time;
    g.pop(hit, 100 + Math.min(g.stats.streak, 10) * 6);
    this.spawn();
  }
}

// ─────────────────────────────────────────────── 센터 리턴 플릭 (중앙 ↔ 바깥 반복)
class Spider {
  constructor(g) {
    this.g = g;
    this.toCenter = true;
  }
  start() {
    this.spawn();
  }
  spawn() {
    const g = this.g;
    let dir;
    if (this.toCenter) dir = { yaw: 0, pitch: 6 };
    else {
      const a = rng() * Math.PI * 2;
      const d = rand(12, 32);
      dir = { yaw: Math.cos(a) * d, pitch: clamp(6 + Math.sin(a) * d * 0.6, 0, 22) };
    }
    g.spawn({ position: g.dirPos(dir.yaw, dir.pitch, 16), radius: 0.5 * g.diff.size });
  }
  onShoot(hit) {
    if (!hit) return;
    const g = this.g;
    const kt = g.time - hit.spawnAt;
    g.stats.killTimes.push(kt);
    g.pop(hit, 100 + Math.round(100 * clamp((1.0 - kt) / 0.7, 0, 1)));
    this.toCenter = !this.toCenter;
    this.spawn();
  }
}

// ─────────────────────────────────────────────── 마이크로 플릭
class Micro {
  constructor(g) {
    this.g = g;
    this.last = { yaw: 0, pitch: 7 };
  }
  start() {
    this.spawn();
  }
  spawn() {
    const a = rng() * Math.PI * 2;
    const d = rand(2.5, 7.5);
    this.last = {
      yaw: clamp(this.last.yaw + Math.cos(a) * d, -20, 20),
      pitch: clamp(this.last.pitch + Math.sin(a) * d, 0, 16),
    };
    this.g.spawn({ position: this.g.dirPos(this.last.yaw, this.last.pitch, 16), radius: 0.28 * this.g.diff.size });
  }
  onShoot(hit) {
    if (!hit) return;
    const g = this.g;
    const kt = g.time - hit.spawnAt;
    g.stats.killTimes.push(kt);
    g.pop(hit, 100 + Math.round(100 * clamp((0.85 - kt) / 0.6, 0, 1)));
    this.spawn();
  }
}

// ─────────────────────────────────────────────── 무빙 풍선 (움직이는 타겟 클릭)
class Motion {
  constructor(g) {
    this.g = g;
    this.lastKill = 0;
  }
  start() {
    this.lastKill = this.g.time;
    for (let i = 0; i < 3; i++) this.spawn();
  }
  spawn() {
    const g = this.g, r = 0.5 * g.diff.size;
    const y = g.kind === 'bot' ? g.standY(r) : rand(2, 6);
    g.spawn({ position: new THREE.Vector3(rand(-6, 6), y, rand(-17, -14)), radius: r });
  }
  update(dt) {
    for (const b of this.g.targets) wander(b, dt, 4.2 * this.g.diff.speed, moveBox(this.g, b.radius));
  }
  onShoot(hit) {
    if (!hit) return;
    const g = this.g;
    g.stats.killTimes.push(g.time - this.lastKill);
    this.lastKill = g.time;
    g.pop(hit, 100 + Math.min(g.stats.streak, 10) * 6);
    this.spawn();
  }
}

// ─────────────────────────────────────────────── 트래킹 (꾹 누르고 따라가기)
class Tracking {
  constructor(g) {
    this.g = g;
    this.b = null;
  }
  start() {
    this.spawn();
  }
  spawn() {
    const g = this.g;
    const r = 0.7 * g.diff.size;
    const y = g.kind === 'bot' ? g.standY(r) : rand(2.4, 5.5);
    this.b = g.spawn({ position: new THREE.Vector3(rand(-5, 5), y, -15), radius: r, unique: true });
    this.b.data.hp = 1;
    this.b.setHp(1);
  }
  update(dt) {
    const b = this.b;
    if (!b || b.dead) return;
    wander(b, dt, 5.5 * this.g.diff.speed, moveBox(this.g, b.radius));
    trackGlow(b, dt);
  }
  onTick(hit, dt) {
    if (hit && hit === this.b && trackDamage(this.g, hit, dt, 1.4)) this.spawn();
  }
}

// ─────────────────────────────────────────────── 스트레이프 트래킹 (좌우 무빙)
class Strafe {
  constructor(g) {
    this.g = g;
    this.b = null;
  }
  start() {
    this.spawn();
  }
  spawn() {
    const g = this.g;
    const r = 0.62 * g.diff.size;
    this.baseY = g.kind === 'bot' ? g.standY(r) : 2.6;
    this.b = g.spawn({ position: new THREE.Vector3(rand(-4, 4), this.baseY, -13), radius: r, unique: true });
    this.b.data.hp = 1;
    this.b.setHp(1);
    this.dir = rng() < 0.5 ? -1 : 1;
    this.v = 0;
    this.switchIn = rand(0.25, 0.9);
    this.stopFor = 0;
    this.jumpV = 0;
  }
  update(dt) {
    const b = this.b;
    if (!b || b.dead) return;
    const maxV = 6.5 * this.g.diff.speed;
    this.switchIn -= dt;
    if (this.stopFor > 0) this.stopFor -= dt;
    if (this.switchIn <= 0) {
      this.switchIn = rand(0.22, 0.95);
      const r = rng();
      if (r < 0.15) this.stopFor = rand(0.12, 0.3); // 잠깐 멈춤
      else if (r < 0.25 && b.position.y <= this.baseY + 0.01) this.jumpV = 4.5; // 점프
      else this.dir *= -1; // 방향 전환 (AD 스트레이프)
    }
    const target = this.stopFor > 0 ? 0 : this.dir * maxV;
    this.v += (target - this.v) * Math.min(1, dt * 14);
    const p = b.position;
    p.x += this.v * dt;
    if (Math.abs(p.x) > 7) {
      p.x = clamp(p.x, -7, 7);
      this.dir = -Math.sign(p.x);
    }
    if (this.jumpV !== 0 || p.y > this.baseY) {
      this.jumpV -= 12 * dt;
      p.y += this.jumpV * dt;
      if (p.y <= this.baseY) {
        p.y = this.baseY;
        this.jumpV = 0;
      }
    }
    trackGlow(b, dt);
  }
  onTick(hit, dt) {
    if (hit && hit === this.b && trackDamage(this.g, hit, dt, 1.4)) this.spawn();
  }
}

// ─────────────────────────────────────────────── 타겟 스위칭 (여러 개를 추적하며 전환)
class Switching {
  constructor(g) {
    this.g = g;
  }
  start() {
    for (let i = 0; i < 3; i++) this.spawn();
  }
  spawn() {
    const g = this.g;
    const r = 0.55 * g.diff.size;
    const y = g.kind === 'bot' ? g.standY(r) : rand(2, 6.5);
    const b = g.spawn({ position: new THREE.Vector3(rand(-7, 7), y, rand(-17, -12)), radius: r, unique: true });
    b.data.hp = 1;
    b.setHp(1);
  }
  update(dt) {
    for (const b of this.g.targets) {
      wander(b, dt, 4.5 * this.g.diff.speed, moveBox(this.g, b.radius));
      trackGlow(b, dt);
    }
  }
  onTick(hit, dt) {
    if (hit && trackDamage(this.g, hit, dt, 0.6)) this.spawn();
  }
}

// ─────────────────────────────────────────────── 반응속도 (라운드제)
class Reaction {
  constructor(g) {
    this.g = g;
    this.rounds = 10;
    this.round = 0;
    this.phase = 'idle';
    this.finishIn = -1;
  }
  start() {
    this.wait();
  }
  wait() {
    this.phase = 'wait';
    this.timer = rand(1.0, 2.8);
    this.g.hud.message(t('기다리세요…'), 'wait');
  }
  update(dt) {
    if (this.finishIn >= 0) {
      this.finishIn -= dt;
      if (this.finishIn < 0) this.g.finish();
      return;
    }
    if (this.phase === 'wait') {
      this.timer -= dt;
      if (this.timer <= 0) this.show();
    }
  }
  show() {
    this.phase = 'show';
    const g = this.g;
    g.hud.message('');
    g.spawn({ position: g.dirPos(rand(-9, 9), rand(0, 9), 15), radius: 0.6 * g.diff.size });
    this.shownAt = performance.now();
  }
  onShoot(hit) {
    const g = this.g;
    if (this.phase === 'wait') {
      g.stats.falseStarts++;
      g.addScore(-100);
      g.sfx.bad();
      g.hud.message(t('너무 빨라요! −100'), 'bad', 0.9);
      this.timer = rand(1.2, 2.8);
      return 'skip';
    }
    if (this.phase !== 'show') return 'skip';
    if (!hit) return;
    const ms = performance.now() - this.shownAt;
    g.stats.reactionTimes.push(ms);
    g.pop(hit, 50 + Math.max(0, Math.round((700 - ms) * 1.5)), `${Math.round(ms)}ms`);
    this.round++;
    if (this.round >= this.rounds) {
      this.phase = 'done';
      this.finishIn = 0.6;
    } else {
      this.wait();
    }
  }
  onResume(pausedMs) {
    if (this.phase === 'show') this.shownAt += pausedMs;
  }
  progressText() {
    return `${Math.min(this.round + 1, this.rounds)} / ${this.rounds}`;
  }
}

// ─────────────────────────────────────────────── 정밀 사격 (작아지는 원거리 풍선)
class Precision {
  constructor(g) {
    this.g = g;
  }
  start() {
    this.spawn();
    this.spawn();
  }
  spawn() {
    const g = this.g;
    const p = pickDir(g, 20, [1, 12], 8);
    const r0 = 0.5 * g.diff.size;
    const b = g.spawn({ position: g.dirPos(p.yaw, p.pitch, 26), radius: r0 });
    b.data.dir = p;
    b.data.r0 = r0;
    b.data.life = 2.2 * g.diff.life;
  }
  update() {
    const g = this.g;
    for (const b of [...g.targets]) {
      const f = (g.time - b.spawnAt) / b.data.life;
      if (f >= 1) {
        g.expire(b, 0);
        this.spawn();
      } else {
        b.radius = b.data.r0 * (1 - 0.7 * f);
      }
    }
  }
  onShoot(hit) {
    if (!hit) return;
    const g = this.g;
    const age = g.time - hit.spawnAt;
    g.stats.killTimes.push(age);
    g.pop(hit, 100 + Math.round(100 * clamp(1 - age / hit.data.life, 0, 1)));
    this.spawn();
  }
}

// ─────────────────────────────────────────────── 풍선 상승 (날아가기 전에 터트리기)
class Rise {
  constructor(g) {
    this.g = g;
    this.spawnTimer = 0;
  }
  start() {
    this.spawnTimer = 0;
  }
  spawn() {
    const g = this.g;
    const x0 = rand(-9, 9);
    const r = 0.6 * g.diff.size;
    const b = g.spawn({ position: new THREE.Vector3(x0, 0, rand(-19, -12)), radius: r });
    b.data.x0 = x0;
    b.data.speed = (1.5 + rng() * 0.8 + g.time * 0.02) * g.diff.speed;
    b.data.wf = rand(0.8, 1.6);
  }
  update(dt) {
    const g = this.g;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer += Math.max(0.38, 1.0 - g.time * 0.01) / g.diff.speed;
      this.spawn();
    }
    for (const b of [...g.targets]) {
      b.position.y += b.data.speed * dt;
      b.position.x = b.data.x0 + Math.sin(b.age * b.data.wf + b.phase) * 0.5;
      if (b.position.y - b.bottomOffset() > 9) g.expire(b, 30);
    }
  }
  onShoot(hit) {
    if (!hit) return;
    const g = this.g;
    g.stats.killTimes.push(g.time - hit.spawnAt);
    g.pop(hit, 100 + Math.round(60 * clamp(1 - hit.position.y / 11, 0, 1)));
  }
}

// ─────────────────────────────────────────────── 커스텀 시나리오 (유저가 만든 설정으로 동작)
class Custom {
  constructor(g, cfg) {
    this.g = g;
    this.c = cfg;
    this.lastKill = 0;
  }
  start() {
    this.lastKill = this.g.time;
    for (let i = 0; i < this.c.count; i++) this.spawn();
  }
  pitchRange() {
    const c = this.c;
    return [Math.max(0, 6 - c.spreadPitch / 2), 6 + c.spreadPitch / 2];
  }
  spawn() {
    const g = this.g, c = this.c;
    const r = c.size * g.diff.size;
    const bot = g.kind === 'bot';
    const p = pickDir(g, c.spreadYaw / 2, bot ? [0, 0] : this.pitchRange(), Math.min(6, c.spreadYaw / 4));
    const pos = g.dirPos(p.yaw, p.pitch, c.distance);
    if (bot) pos.y = g.standY(r);
    const b = g.spawn({ position: pos, radius: r, unique: c.type === 'track' });
    b.data.dir = p;
    b.data.hp = 1;
    if (c.type === 'track') b.setHp(1);
    const a = rng() * Math.PI * 2;
    b.data.vy = Math.cos(a) * c.moveSpeed * g.diff.speed;
    b.data.vp = bot ? 0 : Math.sin(a) * c.moveSpeed * g.diff.speed * 0.6;
    b.data.turn = rand(0.4, 1.2);
  }
  update(dt) {
    const g = this.g, c = this.c;
    for (const b of [...g.targets]) {
      if (c.lifetime > 0 && g.time - b.spawnAt >= c.lifetime) {
        g.expire(b, 0);
        this.spawn();
        continue;
      }
      if (c.moveSpeed > 0) {
        const d = b.data;
        d.turn -= dt;
        if (d.turn <= 0) {
          d.turn = rand(0.4, 1.2);
          const a = rng() * Math.PI * 2;
          d.vy = Math.cos(a) * c.moveSpeed * g.diff.speed;
          d.vp = g.kind === 'bot' ? 0 : Math.sin(a) * c.moveSpeed * g.diff.speed * 0.6;
        }
        d.dir.yaw += d.vy * dt;
        d.dir.pitch += d.vp * dt;
        const ym = c.spreadYaw / 2, [p0, p1] = this.pitchRange();
        if (Math.abs(d.dir.yaw) > ym) {
          d.dir.yaw = clamp(d.dir.yaw, -ym, ym);
          d.vy *= -1;
        }
        if (g.kind !== 'bot' && (d.dir.pitch < p0 || d.dir.pitch > p1)) {
          d.dir.pitch = clamp(d.dir.pitch, p0, p1);
          d.vp *= -1;
        }
        const pos = g.dirPos(d.dir.yaw, d.dir.pitch, c.distance);
        if (g.kind === 'bot') pos.y = b.position.y;
        b.position.copy(pos);
      }
      if (c.type === 'track') trackGlow(b, dt);
    }
  }
  onShoot(hit) {
    if (!hit) return;
    const g = this.g;
    const kt = g.time - Math.max(hit.spawnAt, this.lastKill);
    this.lastKill = g.time;
    g.stats.killTimes.push(kt);
    g.pop(hit, 100 + Math.round(100 * clamp((1.2 - kt) / 0.9, 0, 1)));
    this.spawn();
  }
  onTick(hit, dt) {
    if (hit && trackDamage(this.g, hit, dt, this.c.hp)) this.spawn();
  }
}

// cat: click | track | switch | reaction | custom
export const CATEGORIES = {
  click: { label: '클릭', color: '#ff5c7a' },
  track: { label: '트래킹', color: '#3fb8ff' },
  switch: { label: '타겟 전환', color: '#b57bff' },
  reaction: { label: '반응', color: '#ffcf4d' },
  custom: { label: '커스텀', color: '#2ef2b0' },
};

export const SCENARIOS = {
  grid: {
    name: '그리드 클릭', cat: 'click', tag: '플릭 · 속도', metric: 'kill', mode: 'timed',
    desc: '격자 위 3개의 타겟. 하나를 맞히면 다른 칸에 새로 생깁니다. 연속 명중 보너스.',
    create: (g) => new Grid(g),
  },
  six: {
    name: '식스 타겟', cat: 'click', tag: '정적 클릭', metric: 'kill', mode: 'timed',
    desc: '작은 타겟 6개가 동시에. 정확하게 하나씩, 효율적인 순서로 처리하세요.',
    create: (g) => new Six(g),
  },
  spider: {
    name: '센터 리턴 플릭', cat: 'click', tag: '플릭', metric: 'kill', mode: 'timed',
    desc: '중앙 타겟과 바깥 타겟이 번갈아 나옵니다. 크게 플릭하고 다시 중앙으로.',
    create: (g) => new Spider(g),
  },
  micro: {
    name: '마이크로 플릭', cat: 'click', tag: '미세 조정', metric: 'kill', mode: 'timed',
    desc: '작은 타겟이 직전 위치 근처에 생깁니다. 손목의 미세 조정 연습.',
    create: (g) => new Micro(g),
  },
  flick: {
    name: '와이드 플릭', cat: 'click', tag: '플릭', metric: 'kill', mode: 'timed',
    desc: '넓은 범위에 하나씩 나타나는 타겟을 빠르게 플릭. 빠를수록 보너스.',
    create: (g) => new Flick(g),
  },
  motion: {
    name: '무빙 클릭', cat: 'click', tag: '동적 클릭', metric: 'kill', mode: 'timed',
    desc: '움직이는 타겟 3개를 클릭으로 처리하세요. 움직임을 읽고 쏘는 연습.',
    create: (g) => new Motion(g),
  },
  strafe: {
    name: '스트레이프 트래킹', cat: 'track', tag: '반응 트래킹', metric: 'track', mode: 'timed', hold: true,
    desc: '좌우 AD 무빙하고 가끔 멈추거나 점프하는 타겟을 꾹 눌러 추적하세요.',
    create: (g) => new Strafe(g),
  },
  tracking: {
    name: '스무스 트래킹', cat: 'track', tag: '정밀 트래킹', metric: 'track', mode: 'timed', hold: true,
    desc: '꾹 누른 채 부드럽게 움직이는 타겟을 따라가세요. 체력이 다 닳으면 처치.',
    create: (g) => new Tracking(g),
  },
  switching: {
    name: '타겟 스위칭', cat: 'switch', tag: '추적 + 전환', metric: 'track', mode: 'timed', hold: true,
    desc: '움직이는 타겟 3개. 하나를 추적해서 처치하면 바로 다음 타겟으로 전환.',
    create: (g) => new Switching(g),
  },
  rise: {
    name: '라이징 타겟', cat: 'switch', tag: '빠른 전환', metric: 'rise', mode: 'timed',
    desc: '바닥에서 떠오르는 타겟들을 천장에 닿기 전에 처리하세요. 점점 빨라집니다.',
    create: (g) => new Rise(g),
  },
  precision: {
    name: '정밀 사격', cat: 'click', tag: '원거리 정밀', metric: 'kill', mode: 'timed',
    desc: '멀리 있는 타겟이 점점 작아지다 사라집니다. 사라지기 전에 정확하게.',
    create: (g) => new Precision(g),
  },
  reaction: {
    name: '반응속도', cat: 'reaction', tag: '반응', metric: 'reaction', mode: 'rounds',
    desc: '타겟이 나타나는 순간 바로 쏘세요. 10라운드. 미리 쏘면 감점!',
    create: (g) => new Reaction(g),
  },
};

// 인기 에임 트레이닝 루틴 구성을 참고한 루틴 (과제는 이 게임의 풍선 버전)
export const ROUTINES = [
  {
    id: 'popular5', name: '인기 워밍업 5종', icon: '🔥', featured: true,
    desc: '에임 트레이너에서 가장 많이 추천되는 조합. 그리드 → 식스 → 센터 리턴 → 마이크로 → 스트레이프 트래킹.',
    steps: [['grid', 60], ['six', 60], ['spider', 60], ['micro', 60], ['strafe', 60]],
  },
  {
    id: 'quick', name: '랭크 전 3분 워밍업', icon: '⏱️',
    desc: '발로란트 랭크 전 워밍업으로 자주 쓰이는 그리드 · 마이크로 · 스트레이프 트래킹 3종 압축판.',
    steps: [['grid', 60], ['micro', 60], ['strafe', 60]],
  },
  {
    id: 'basics', name: '에임 베이직', icon: '🎯',
    desc: '미세 조정과 플릭을 중심으로 한 기본기 루틴. 작은 동작에서 큰 동작, 원거리 정밀까지.',
    steps: [['micro', 60], ['spider', 60], ['flick', 60], ['precision', 60]],
  },
  {
    id: 'balanced', name: '밸런스 벤치마크', icon: '📊',
    desc: '벤치마크식 3대 분류(클릭 · 트래킹 · 타겟 전환)를 골고루. 약점 파악용.',
    steps: [['six', 60], ['motion', 60], ['tracking', 60], ['strafe', 60], ['switching', 60]],
  },
];

// 약점별 추천 루틴
ROUTINES.push(
  {
    id: 'trackfocus', name: '트래킹 집중', icon: '🌀',
    desc: '부드러운 추적, 반응 추적, 추적 전환을 차례로. 트래킹이 약할 때 추천.',
    steps: [['tracking', 60], ['strafe', 60], ['switching', 60]],
  },
  {
    id: 'switchfocus', name: '타겟 전환 집중', icon: '🔀',
    desc: '여러 타겟 사이를 빠르게 옮겨 다니는 연습. 전환이 약할 때 추천.',
    steps: [['switching', 60], ['rise', 60], ['motion', 60]],
  }
);
export const RECOMMEND = { click: 'basics', track: 'trackfocus', switch: 'switchfocus', reaction: 'quick' };

// 벤치마크: 고정 시드 · 보통 난이도 · 45초 (반응속도는 10라운드)
export const BENCHMARK = {
  duration: 45,
  difficulty: 'normal',
  steps: ['six', 'motion', 'spider', 'micro', 'strafe', 'tracking', 'switching', 'reaction'],
};

/** 커스텀 시나리오를 SCENARIOS에 등록 (id: custom-xxxx) */
export function registerCustom(cfg) {
  const c = sanitizeCustom(cfg);
  const id = 'custom-' + c.id;
  SCENARIOS[id] = {
    name: c.name, custom: true, cfg: c, cat: 'custom', tag: c.type === 'track' ? '트래킹' : '클릭',
    metric: c.type === 'track' ? 'track' : 'kill', mode: 'timed', hold: c.type === 'track',
    desc: '', create: (g) => new Custom(g, c),
  };
  return id;
}
export function unregisterCustom(id) {
  if (SCENARIOS[id]?.custom) delete SCENARIOS[id];
}

export { EYE_HEIGHT };
