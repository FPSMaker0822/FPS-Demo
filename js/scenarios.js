// 연습 시나리오 & 루틴 정의
import * as THREE from '../vendor/three.module.min.js';
import { EYE_HEIGHT } from './world.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDist = (a, b) => Math.hypot(a.yaw - b.yaw, a.pitch - b.pitch);

export const DIFFICULTY = {
  easy: { label: '쉬움', size: 1.3, speed: 0.75, life: 1.35 },
  normal: { label: '보통', size: 1, speed: 1, life: 1 },
  hard: { label: '어려움', size: 0.72, speed: 1.3, life: 0.75 },
};

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
    let p;
    do {
      p = { yaw: rand(-34, 34), pitch: rand(-8, 22) };
    } while (angDist(p, this.last) < 14);
    this.last = p;
    this.g.spawn({ position: this.g.dirPos(p.yaw, p.pitch, 18), radius: 0.55 * this.g.diff.size });
  }
  onShoot(hit) {
    if (!hit) return;
    const g = this.g;
    const kt = g.time - hit.spawnAt;
    g.stats.killTimes.push(kt);
    const bonus = Math.round(100 * clamp((1.2 - kt) / 0.9, 0, 1));
    g.pop(hit, 100 + bonus);
    this.spawn();
  }
}

// ─────────────────────────────────────────────── 풍선 그리드 (3개 동시)
class Grid {
  constructor(g) {
    this.g = g;
    this.N = 5;
    this.spacing = 1.8;
    this.lastKill = 0;
  }
  cellPos(i) {
    const c = i % this.N, r = Math.floor(i / this.N);
    const half = (this.N - 1) / 2;
    return new THREE.Vector3((c - half) * this.spacing, 4 + (r - half) * this.spacing, -14);
  }
  start() {
    this.lastKill = this.g.time;
    for (let i = 0; i < 3; i++) this.spawn(-1);
  }
  spawn(exclude) {
    const used = new Set(this.g.targets.map((b) => b.data.cell));
    const free = [];
    for (let i = 0; i < this.N * this.N; i++) if (!used.has(i) && i !== exclude) free.push(i);
    const cell = free[Math.floor(Math.random() * free.length)];
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

// ─────────────────────────────────────────────── 마이크로 플릭
class Micro {
  constructor(g) {
    this.g = g;
    this.last = { yaw: 0, pitch: 6 };
  }
  start() {
    this.spawn();
  }
  spawn() {
    const a = Math.random() * Math.PI * 2;
    const d = rand(2.5, 7.5);
    this.last = {
      yaw: clamp(this.last.yaw + Math.cos(a) * d, -20, 20),
      pitch: clamp(this.last.pitch + Math.sin(a) * d, -4, 16),
    };
    this.g.spawn({ position: this.g.dirPos(this.last.yaw, this.last.pitch, 16), radius: 0.28 * this.g.diff.size, string: false });
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
    this.b = g.spawn({
      position: new THREE.Vector3(rand(-5, 5), rand(2, 5.5), -15),
      radius: 0.7 * g.diff.size,
      unique: true,
    });
    this.b.data.hp = 1;
    this.b.data.lit = 0;
    this.vx = 0;
    this.vy = 0;
    this.tvx = 0;
    this.tvy = 0;
    this.changeIn = 0;
  }
  update(dt) {
    const b = this.b;
    if (!b || b.dead) return;
    const maxV = 5.5 * this.g.diff.speed;
    this.changeIn -= dt;
    if (this.changeIn <= 0) {
      this.changeIn = rand(0.35, 1.1);
      let v = rand(-1, 1);
      if (Math.abs(v) < 0.35) v = Math.sign(v || 1) * 0.35;
      this.tvx = v * maxV;
      this.tvy = rand(-0.6, 0.6) * maxV * 0.5;
    }
    const k = Math.min(1, dt * 6);
    this.vx += (this.tvx - this.vx) * k;
    this.vy += (this.tvy - this.vy) * k;
    const p = b.position;
    p.x += this.vx * dt;
    p.y += this.vy * dt;
    if (p.x < -7.5 || p.x > 7.5) {
      p.x = clamp(p.x, -7.5, 7.5);
      this.vx *= -1;
      this.tvx *= -1;
    }
    if (p.y < 1.4 || p.y > 6.8) {
      p.y = clamp(p.y, 1.4, 6.8);
      this.vy *= -1;
      this.tvy *= -1;
    }
    b.data.lit = Math.max(0, b.data.lit - dt);
    b.material.emissiveIntensity = b.data.lit > 0 ? 0.55 : 0.1;
  }
  onTick(hit, dt) {
    const g = this.g;
    if (!hit || hit !== this.b) return;
    g.addScore(10);
    hit.data.lit = 0.1;
    hit.data.hp -= dt / 1.4;
    hit.inflate = 1 + (1 - hit.data.hp) * 0.35;
    if (hit.data.hp <= 0) {
      g.stats.pops++;
      g.pop(hit, 150);
      this.spawn();
    }
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
    this.g.hud.message('기다리세요…', 'wait');
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
    this.b = g.spawn({ position: g.dirPos(rand(-9, 9), rand(-3, 8), 15), radius: 0.6 * g.diff.size });
    this.shownAt = performance.now();
  }
  onShoot(hit) {
    const g = this.g;
    if (this.phase === 'wait') {
      g.stats.falseStarts++;
      g.addScore(-100);
      g.sfx.bad();
      g.hud.message('너무 빨라요! −100', 'bad', 0.9);
      this.timer = rand(1.2, 2.8);
      return 'skip';
    }
    if (this.phase !== 'show') return 'skip';
    if (!hit) return;
    const ms = performance.now() - this.shownAt;
    g.stats.reactionTimes.push(ms);
    const pts = 50 + Math.max(0, Math.round((700 - ms) * 1.5));
    g.pop(hit, pts, `${Math.round(ms)}ms`);
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
    let p, tries = 0;
    do {
      p = { yaw: rand(-20, 20), pitch: rand(-3, 12) };
      tries++;
    } while (tries < 20 && g.targets.some((b) => angDist(b.data.dir, p) < 8));
    const r0 = 0.5 * g.diff.size;
    const b = g.spawn({ position: g.dirPos(p.yaw, p.pitch, 26), radius: r0, string: false });
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
    const b = g.spawn({ position: new THREE.Vector3(x0, -1.2, rand(-19, -12)), radius: 0.6 * g.diff.size });
    b.data.x0 = x0;
    b.data.speed = (1.5 + Math.random() * 0.8 + g.time * 0.02) * g.diff.speed;
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
      if (b.position.y > 11) g.expire(b, 30);
    }
  }
  onShoot(hit) {
    if (!hit) return;
    const g = this.g;
    g.stats.killTimes.push(g.time - hit.spawnAt);
    const low = clamp(1 - hit.position.y / 11, 0, 1);
    g.pop(hit, 100 + Math.round(60 * low));
  }
}

export const SCENARIOS = {
  flick: {
    name: '풍선 플릭', icon: '🎈', tag: '플릭', metric: 'kill', mode: 'timed',
    desc: '넓은 범위에 하나씩 나타나는 풍선을 빠르게 플릭해서 터트리세요. 빠를수록 보너스.',
    create: (g) => new Flick(g),
  },
  grid: {
    name: '풍선 그리드', icon: '🟦', tag: '플릭 · 속도', metric: 'kill', mode: 'timed',
    desc: '5×5 격자 위 3개의 풍선. 하나를 터트리면 다른 칸에 새로 생깁니다. 연속 명중 보너스.',
    create: (g) => new Grid(g),
  },
  micro: {
    name: '마이크로 플릭', icon: '🎯', tag: '정밀 · 미세조정', metric: 'kill', mode: 'timed',
    desc: '작은 풍선이 직전 위치 근처에 생깁니다. 손목의 미세 조정을 연습하세요.',
    create: (g) => new Micro(g),
  },
  tracking: {
    name: '풍선 트래킹', icon: '🌀', tag: '트래킹', metric: 'track', mode: 'timed', hold: true,
    desc: '좌클릭을 꾹 누른 채 움직이는 풍선을 따라가세요. 계속 맞히면 부풀어 오르다 터집니다.',
    create: (g) => new Tracking(g),
  },
  reaction: {
    name: '반응속도', icon: '⚡', tag: '반응', metric: 'reaction', mode: 'rounds',
    desc: '풍선이 나타나는 순간 바로 쏘세요. 10라운드. 미리 쏘면 감점!',
    create: (g) => new Reaction(g),
  },
  precision: {
    name: '정밀 사격', icon: '🔭', tag: '정밀 · 원거리', metric: 'kill', mode: 'timed',
    desc: '멀리 있는 풍선이 점점 작아지다 사라집니다. 사라지기 전에 정확하게.',
    create: (g) => new Precision(g),
  },
  rise: {
    name: '풍선 상승', icon: '🎈', tag: '타겟 전환', metric: 'rise', mode: 'timed',
    desc: '바닥에서 떠오르는 풍선들을 천장에 닿기 전에 터트리세요. 점점 빨라집니다.',
    create: (g) => new Rise(g),
  },
};

export const ROUTINES = [
  {
    id: 'warmup', name: '데일리 워밍업', icon: '☀️',
    desc: '플릭 → 그리드 → 트래킹 → 마이크로. 게임 전 균형 잡힌 3분 워밍업.',
    steps: [['flick', 45], ['grid', 45], ['tracking', 45], ['micro', 45]],
  },
  {
    id: 'flickfocus', name: '플릭 집중', icon: '💥',
    desc: '큰 동작에서 미세 조정까지, 플릭을 단계적으로 다듬는 루틴.',
    steps: [['grid', 40], ['flick', 40], ['micro', 40], ['precision', 40]],
  },
  {
    id: 'reflex', name: '반응 & 추적', icon: '🧠',
    desc: '반응속도 10라운드 후 트래킹과 타겟 전환으로 마무리.',
    steps: [['reaction', 0], ['tracking', 60], ['rise', 60]],
  },
];

export { EYE_HEIGHT };
