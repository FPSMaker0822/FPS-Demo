// 게임 루프, 입력(포인터 락), 상태 머신
import * as THREE from '../vendor/three.module.min.js';
import { Balloon, Effects, rayHit, PALETTE } from './targets.js';
import { SCENARIOS, DIFFICULTY } from './scenarios.js';
import { EYE_HEIGHT } from './world.js';

const DEG = Math.PI / 180;
const TICK = 1 / 20; // 트래킹 사격 판정 간격
const MAX_PITCH = 89 * DEG;

export class Game {
  constructor({ world, sfx, hud, getSettings, onFinish, onPause, onResume, onLockFail }) {
    this.world = world;
    this.camera = world.camera;
    this.sfx = sfx;
    this.hud = hud;
    this.getSettings = getSettings;
    this.onFinish = onFinish;
    this.onPause = onPause;
    this.onResume = onResume;
    this.onLockFail = onLockFail;

    this.state = 'idle'; // idle | countdown | playing | paused | results
    this.targets = [];
    this.decor = [];
    this.effects = new Effects(world.scene, world.camera);
    this.yaw = 0;
    this.pitch = 0;
    this.dpc = 0.028; // 도/카운트
    this.holdAcc = 0;
    this.colorIndex = 0;
    this.idleT = 0;
    this.lockTime = 0;
    this._dir = new THREE.Vector3();

    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.held = new Set(); // 눌려 있는 발사 입력 (마우스 버튼/키)
    document.addEventListener('mousedown', (e) => {
      if (this.isFireMouse(e.button)) this.firePress('m' + e.button);
    });
    document.addEventListener('mouseup', (e) => this.fireRelease('m' + e.button));
    document.addEventListener('keyup', (e) => this.fireRelease('k' + e.code));
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('pointerlockchange', () => this.onLockChange());
    document.addEventListener('pointerlockerror', () => this.lockFailed());
    document.addEventListener('keydown', (e) => {
      if (this.captureKey) return;
      const fk = this.getSettings().fireKey;
      if (fk && fk.type === 'key' && e.code === fk.code && this.locked) {
        e.preventDefault();
        if (!e.repeat) this.firePress('k' + e.code);
        return;
      }
      if (e.code === 'KeyR' && (this.state === 'playing' || this.state === 'countdown')) this.restart();
    });
    document.addEventListener('contextmenu', (e) => {
      if (this.locked) e.preventDefault();
    });

    this.initDecor();
  }

  get locked() {
    return document.pointerLockElement === this.world.canvas;
  }

  get active() {
    return this.state === 'playing' || this.state === 'countdown';
  }

  // ───────────────────────── 포인터 락
  requestLock() {
    const el = this.world.canvas;
    const fallback = () => {
      try {
        const p2 = el.requestPointerLock();
        if (p2 && p2.catch) p2.catch(() => this.lockFailed());
      } catch {
        this.lockFailed();
      }
    };
    let p;
    try {
      // 마우스 가속(OS 포인터 정밀도)을 무시한 raw 입력 요청 (Chromium)
      p = el.requestPointerLock({ unadjustedMovement: true });
    } catch {
      fallback();
      return;
    }
    if (p && p.catch) {
      p.catch((err) => {
        if (err && err.name === 'NotSupportedError') fallback();
        else this.lockFailed();
      });
    }
  }

  lockFailed() {
    if (this.locked) return;
    if (this.active) this.pause();
    this.onLockFail?.();
  }

  onLockChange() {
    if (this.locked) {
      this.lockTime = performance.now();
      if (this.state === 'paused') {
        this.state = this.prevState;
        const pausedMs = performance.now() - this.pausedAt;
        this.scenario.onResume?.(pausedMs);
        this.onResume?.();
      }
    } else if (this.active) {
      this.pause();
    }
  }

  pause() {
    this.prevState = this.state;
    this.state = 'paused';
    this.pausedAt = performance.now();
    this.releaseAll();
    this.hud.setOnTarget(false);
    this.onPause?.();
  }

  resume() {
    this.sfx.ensure();
    this.requestLock();
  }

  // ───────────────────────── 입력
  onMouseMove(e) {
    if (!this.locked || !this.active) return;
    const mx = e.movementX || 0, my = e.movementY || 0;
    // 일부 브라우저가 락 직후 큰 값을 한 번 보내는 문제 방지
    if (performance.now() - this.lockTime < 80 && (Math.abs(mx) > 150 || Math.abs(my) > 150)) return;
    const d = this.dpc * DEG;
    this.yaw -= mx * d;
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch - my * d));
    this.applyCamera();
  }

  isFireMouse(button) {
    if (button === 0) return true;
    const fk = this.getSettings().fireKey;
    return !!fk && fk.type === 'mouse' && fk.button === button;
  }

  firePress(id) {
    if (!this.locked || this.held.has(id)) return;
    const wasHeld = this.held.size > 0;
    this.held.add(id);
    if (wasHeld) return; // 이미 다른 입력으로 누르고 있음
    this.holdAcc = TICK; // 누르는 즉시 첫 판정
    this.shoot();
  }

  fireRelease(id) {
    this.held.delete(id);
  }

  releaseAll() {
    this.held.clear();
  }

  get mouseDown() {
    return this.held.size > 0;
  }

  applyCamera() {
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  // ───────────────────────── 시작/종료
  begin(scenarioId, { duration = 60, difficulty = 'normal', routineText = '' } = {}) {
    this.clearTargets();
    this.clearDecor();
    this.hud.clearFloats();
    this.scenarioId = scenarioId;
    this.def = SCENARIOS[scenarioId];
    this.duration = duration;
    this.difficulty = difficulty;
    this.diff = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.routineText = routineText;
    this.stats = {
      shots: 0, hits: 0, misses: 0, score: 0, streak: 0, maxStreak: 0,
      killTimes: [], reactionTimes: [], expired: 0, falseStarts: 0, pops: 0,
    };
    this.time = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.camera.position.set(0, EYE_HEIGHT, 0);
    this.applyCamera();
    this.scenario = this.def.create(this);
    this.state = 'countdown';
    this.countdown = 3;
    this.lastCount = 0;
    this.releaseAll();
    this.hud.setScenario(this.def.name, routineText);
    this.hud.message('');
    this.hud.show(true);
    this.hud.update(this);
  }

  restart() {
    this.begin(this.scenarioId, { duration: this.duration, difficulty: this.difficulty, routineText: this.routineText });
    if (!this.locked) this.requestLock();
  }

  finish() {
    if (!this.active) return;
    this.state = 'results';
    this.releaseAll();
    this.clearTargets();
    this.hud.message('');
    this.hud.setOnTarget(false);
    this.hud.show(false);
    this.sfx.chime();
    this.initDecor();
    if (this.locked) document.exitPointerLock();
    this.onFinish?.(this.buildResult());
  }

  quit() {
    this.state = 'idle';
    this.releaseAll();
    this.clearTargets();
    this.hud.show(false);
    this.hud.message('');
    this.initDecor();
    if (this.locked) document.exitPointerLock();
  }

  buildResult() {
    const s = this.stats;
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    return {
      scenarioId: this.scenarioId,
      name: this.def.name,
      metric: this.def.metric,
      mode: this.def.mode,
      difficulty: this.difficulty,
      duration: this.def.mode === 'rounds' ? null : this.duration,
      score: Math.max(0, Math.round(s.score)),
      accuracy: s.shots ? s.hits / s.shots : 0,
      shots: s.shots,
      hits: s.hits,
      maxStreak: s.maxStreak,
      avgKill: avg(s.killTimes),
      kills: s.killTimes.length,
      avgReaction: avg(s.reactionTimes),
      bestReaction: s.reactionTimes.length ? Math.min(...s.reactionTimes) : null,
      expired: s.expired,
      falseStarts: s.falseStarts,
      pops: s.pops,
      date: Date.now(),
    };
  }

  // ───────────────────────── 시나리오용 헬퍼
  /** 정면(-Z) 기준 yaw(오른쪽 +), pitch(위 +) 각도로 위치 계산 */
  dirPos(yawDeg, pitchDeg, dist) {
    const y = yawDeg * DEG, p = pitchDeg * DEG;
    return new THREE.Vector3(
      Math.sin(y) * Math.cos(p) * dist,
      EYE_HEIGHT + Math.sin(p) * dist,
      -Math.cos(y) * Math.cos(p) * dist
    );
  }

  nextColor() {
    const c = this.getSettings().balloonColor;
    if (c && c !== 'rainbow') return c;
    return PALETTE[this.colorIndex++ % PALETTE.length];
  }

  spawn(opts) {
    // 풍선이 바닥에 박히지 않도록 최소 높이 보장
    const r = opts.radius ?? 0.6;
    const minY = r * 1.25 + 0.8;
    if (opts.position.y < minY) opts.position.y = minY;
    const b = new Balloon(this.world.scene, { color: this.nextColor(), ...opts });
    b.spawnAt = this.time;
    this.targets.push(b);
    return b;
  }

  remove(b) {
    if (b.dead) return;
    b.dispose();
    this.targets = this.targets.filter((t) => t !== b);
  }

  pop(b, points, text) {
    this.effects.burst(b.position.clone(), b.color, b.hitRadius());
    this.sfx.pop(b.radius);
    this.addScore(points, b.position, text);
    this.remove(b);
  }

  expire(b, penalty = 0) {
    this.effects.burst(b.position.clone(), '#8891a8', b.radius, { count: 12, ring: false, speed: 0.4 });
    this.sfx.expire();
    this.stats.expired++;
    this.stats.streak = 0;
    this.addScore(-penalty);
    this.hud.float(b.position, this.camera, penalty ? `놓침 −${penalty}` : '놓침', 'bad');
    this.remove(b);
  }

  addScore(points, pos, text) {
    this.stats.score = Math.max(0, this.stats.score + points);
    if (pos) this.hud.float(pos, this.camera, text || `+${points}`, points >= 170 ? 'great' : '');
  }

  raycast() {
    this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(this._dir);
    return rayHit(this.camera.position, this._dir, this.targets);
  }

  shoot() {
    if (this.state !== 'playing' || this.def.hold) return;
    const hit = this.raycast();
    const r = this.scenario.onShoot?.(hit);
    if (r === 'skip') return;
    const s = this.stats;
    s.shots++;
    if (hit) {
      s.hits++;
      s.streak++;
      s.maxStreak = Math.max(s.maxStreak, s.streak);
      this.hud.hitmarker();
    } else {
      s.misses++;
      s.streak = 0;
      this.sfx.miss();
    }
  }

  tick() {
    const s = this.stats;
    const hit = this.raycast();
    s.shots++;
    if (hit) {
      s.hits++;
      if (s.shots % 2 === 0) this.sfx.tick();
    }
    this.scenario.onTick?.(hit, TICK);
  }

  clearTargets() {
    for (const b of this.targets) b.dispose();
    this.targets = [];
  }

  // ───────────────────────── 메뉴 배경 장식 풍선
  initDecor() {
    if (this.decor.length) return;
    for (let i = 0; i < 14; i++) {
      const b = new Balloon(this.world.scene, {
        position: new THREE.Vector3((Math.random() * 2 - 1) * 14, 1.5 + Math.random() * 14, -10 - Math.random() * 18),
        radius: 0.5 + Math.random() * 0.5,
        color: PALETTE[i % PALETTE.length],
      });
      b.data.speed = 0.5 + Math.random() * 0.7;
      this.decor.push(b);
    }
  }

  clearDecor() {
    for (const b of this.decor) b.dispose();
    this.decor = [];
  }

  // ───────────────────────── 매 프레임
  update(dt) {
    this.effects.update(dt);

    if (this.state === 'idle' || this.state === 'results') {
      this.idleT += dt;
      this.camera.position.set(0, EYE_HEIGHT, 0);
      this.camera.rotation.set(0.1 + Math.sin(this.idleT * 0.13) * 0.05, Math.sin(this.idleT * 0.07) * 0.35, 0, 'YXZ');
      for (const b of this.decor) {
        b.position.y += b.data.speed * dt;
        if (b.position.y > 16) {
          b.position.set((Math.random() * 2 - 1) * 14, 1.2, -10 - Math.random() * 18);
          b.age = 0; // 다시 나타나는 애니메이션
        }
        b.update(dt);
      }
      return;
    }

    if (!this.locked) return;

    if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n > 0 && n !== this.lastCount) {
        this.lastCount = n;
        this.hud.message(String(n), 'count');
        this.sfx.beep(520, 0.1);
      }
      if (this.countdown <= 0) {
        this.state = 'playing';
        this.hud.message('GO!', 'go', 0.45);
        this.sfx.beep(880, 0.16);
        this.scenario.start();
      }
    } else if (this.state === 'playing') {
      this.time += dt;
      if (this.def.hold) {
        if (this.mouseDown) {
          this.holdAcc += dt;
          while (this.holdAcc >= TICK && this.state === 'playing') {
            this.holdAcc -= TICK;
            this.tick();
          }
        }
        this.hud.setOnTarget(!!this.raycast());
      }
      this.scenario.update?.(dt);
      if (this.state !== 'playing') return;
      if (this.def.mode === 'timed' && this.time >= this.duration) {
        this.finish();
        return;
      }
    }

    for (const b of this.targets) b.update(dt);
    this.hud.update(this);
  }
}
