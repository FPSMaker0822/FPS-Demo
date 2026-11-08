// HUD, 크로스헤어, 플로팅 텍스트
import * as THREE from '../vendor/three.module.min.js';

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
    this.set('score', String(Math.round(s.score)));
    this.set('acc', s.shots ? `${Math.round((s.hits / s.shots) * 100)}%` : '—');
    this.set('streak', game.def.hold ? `${s.pops}개` : String(s.streak));
  }

  message(text, cls = '', dur = 0) {
    const token = ++this.msgToken;
    this.el.msg.textContent = text;
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
    void h.offsetWidth;
    h.classList.add('on');
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
