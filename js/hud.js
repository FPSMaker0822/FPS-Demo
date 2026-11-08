// HUD, 크로스헤어, 플로팅 텍스트
import * as THREE from 'three';

export function drawCrosshair(canvas, ch, cssSize = 96) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssSize * dpr);
  canvas.height = Math.round(cssSize * dpr);
  canvas.style.width = cssSize + 'px';
  canvas.style.height = cssSize + 'px';
  const x = canvas.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, cssSize, cssSize);
  const c = cssSize / 2;
  const th = Math.max(1, Number(ch.thickness) || 1);
  const len = Math.max(0, Number(ch.length) || 0);
  const gap = Math.max(0, Number(ch.gap) || 0);
  const rects = [];
  if (len > 0) {
    rects.push([c - th / 2, c - gap - len, th, len]);
    rects.push([c - th / 2, c + gap, th, len]);
    rects.push([c - gap - len, c - th / 2, len, th]);
    rects.push([c + gap, c - th / 2, len, th]);
  }
  if (ch.dot) rects.push([c - th / 2, c - th / 2, th, th]);
  if (ch.outline) {
    x.fillStyle = 'rgba(0,0,0,0.85)';
    for (const [rx, ry, rw, rh] of rects) x.fillRect(rx - 1, ry - 1, rw + 2, rh + 2);
  }
  x.fillStyle = ch.color || '#2ef2b0';
  for (const [rx, ry, rw, rh] of rects) x.fillRect(rx, ry, rw, rh);
}

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.el = {
      name: $('hud-name'),
      time: $('hud-time'),
      timeLabel: $('hud-time-label'),
      score: $('hud-score'),
      acc: $('hud-acc'),
      streak: $('hud-streak'),
      msg: $('hud-msg'),
      hit: $('hitmarker'),
      floats: $('float-layer'),
      fps: $('fps'),
      routine: $('hud-routine'),
      crosshair: $('crosshair'),
      progress: $('hud-progress'),
      streakLabel: $('hud-streak-label'),
      center: document.querySelector('.hud-center'),
      accRing: $('hud-acc-ring'),
      hits: $('hud-hits'),
      combo: $('hud-combo'),
      feed: $('killfeed'),
      edge: $('edge-flash'),
    };
    this.cache = {};
    this.msgToken = 0;
    this._v = new THREE.Vector3();
  }

  show(v) {
    this.root.classList.toggle('hidden', !v);
  }

  set(key, value) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    this.el[key].textContent = value;
  }

  setScenario(name, routineText) {
    this.set('name', name);
    this.set('routine', routineText || '');
  }

  update(game) {
    const s = game.stats;
    if (!s) return;
    let frac;
    if (game.def.mode === 'rounds') {
      this.set('timeLabel', '라운드');
      this.set('time', game.scenario.progressText());
      frac = 1 - game.scenario.round / game.scenario.rounds;
    } else {
      this.set('timeLabel', '남은 시간');
      const left = game.state === 'countdown' ? game.duration : Math.max(0, game.duration - game.time);
      this.set('time', left.toFixed(1));
      frac = left / game.duration;
    }
    const w = `${(frac * 100).toFixed(1)}%`;
    if (this.cache.progress !== w) {
      this.cache.progress = w;
      this.el.progress.style.width = w;
    }
    this.set('streakLabel', game.def.hold ? '처치' : '연속');
    // 점수 카운트업
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this._t || now)) / 1000);
    this._t = now;
    if (this.shownScore === undefined || s.score < this.shownScore - 1e-6 && s.score === 0) this.shownScore = s.score;
    const diff = s.score - this.shownScore;
    this.shownScore = Math.abs(diff) < 1 ? s.score : this.shownScore + diff * Math.min(1, dt * 14);
    this.set('score', Math.round(this.shownScore).toLocaleString());
    const acc = s.shots ? s.hits / s.shots : 0;
    this.set('acc', s.shots ? `${Math.round(acc * 100)}` : '—');
    this.set('hits', `${s.hits} / ${s.shots}`);
    const off = (100.5 * (1 - acc)).toFixed(1);
    if (this.cache.ring !== off) {
      this.cache.ring = off;
      this.el.accRing.style.strokeDashoffset = off;
      this.el.accRing.style.stroke = acc >= 0.8 || !s.shots ? '' : acc >= 0.6 ? 'var(--gold)' : 'var(--danger)';
    }
    this.set('streak', game.def.hold ? String(s.pops) : String(s.streak));
    // 마지막 5초 경고
    const urgent = game.def.mode === 'timed' && game.state === 'playing' && game.duration - game.time <= 5;
    if (this.cache.urgent !== urgent) {
      this.cache.urgent = urgent;
      this.el.center.classList.toggle('urgent', urgent);
    }
    // 콤보
    const combo = game.def.hold ? 0 : s.streak;
    if (this.cache.combo !== combo) {
      const c = this.el.combo;
      if (combo >= 3) {
        c.innerHTML = `<b>${combo}</b>COMBO`;
        c.classList.add('on');
        c.classList.remove('pop');
        void c.offsetWidth;
        c.classList.add('pop');
      } else c.classList.remove('on');
      this.cache.combo = combo;
    }
  }

  reset() {
    this.shownScore = undefined;
    this.cache = {};
    this.el.feed.textContent = '';
    this.el.combo.classList.remove('on');
    this.el.center.classList.remove('urgent');
  }

  /** 오른쪽 킬피드 */
  feed(main, sub, color, cls = '') {
    const d = document.createElement('div');
    d.className = 'kf ' + cls;
    d.innerHTML = `<i style="background:${color}"></i><b>${main}</b>${sub ? `<span>${sub}</span>` : ''}`;
    this.el.feed.prepend(d);
    while (this.el.feed.children.length > 5) this.el.feed.lastChild.remove();
    setTimeout(() => d.remove(), 2400);
  }

  edgeFlash() {
    const e = this.el.edge;
    e.classList.remove('on');
    void e.offsetWidth;
    e.classList.add('on');
  }

  message(text, cls = '', dur = 0) {
    const token = ++this.msgToken;
    this.el.msg.textContent = text;
    this.el.msg.className = '';
    void this.el.msg.offsetWidth; // 애니메이션 재시작
    this.el.msg.className = cls;
    if (dur > 0) {
      setTimeout(() => {
        if (token === this.msgToken) {
          this.el.msg.textContent = '';
          this.el.msg.className = '';
        }
      }, dur * 1000);
    }
  }

  hitmarker(head = false) {
    const h = this.el.hit;
    h.classList.toggle('head', head);
    h.classList.remove('on');
    const ch = this.el.crosshair;
    ch.classList.remove('kick');
    void h.offsetWidth;
    h.classList.add('on');
    ch.classList.add('kick');
  }

  float(worldPos, camera, text, cls = '') {
    const v = this._v.copy(worldPos).project(camera);
    if (v.z > 1) return;
    const d = document.createElement('div');
    d.className = 'float ' + cls;
    d.textContent = text;
    d.style.left = ((v.x + 1) / 2) * window.innerWidth + 'px';
    d.style.top = ((1 - v.y) / 2) * window.innerHeight + 'px';
    this.el.floats.appendChild(d);
    setTimeout(() => d.remove(), 800);
  }

  clearFloats() {
    this.el.floats.textContent = '';
  }

  setCrosshair(ch) {
    drawCrosshair(this.el.crosshair, ch);
  }

  setOnTarget(on) {
    this.el.crosshair.classList.toggle('on-target', on);
  }

  showFps(on) {
    this.el.fps.classList.toggle('hidden', !on);
  }

  fps(v) {
    this.el.fps.textContent = `${v} FPS`;
  }
}
