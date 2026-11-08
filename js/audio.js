// WebAudio로 합성하는 효과음 (외부 파일 없음)

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.6;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.4);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.value = this.volume;
    return true;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  _gain(t, peak, dur) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.master);
    return g;
  }

  _noise(t, dur, filterType, freq, q, peak) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f).connect(this._gain(t, peak, dur));
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  _tone(t, type, f0, f1, dur, peak) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(this._gain(t, peak, dur));
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** 풍선 터지는 소리. size가 작을수록 높은 소리 */
  pop(size = 0.6) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const freq = (2600 / (0.5 + size)) * (0.9 + Math.random() * 0.2);
    this._noise(t, 0.13, 'bandpass', freq, 0.8, 0.9);
    this._noise(t, 0.04, 'highpass', 4000, 0.7, 0.35);
    this._tone(t, 'sine', 240, 60, 0.09, 0.45);
  }

  miss() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 'triangle', 320, 170, 0.08, 0.12);
  }

  shot() {
    if (!this.ctx) return;
    this._noise(this.ctx.currentTime, 0.025, 'highpass', 3500, 0.7, 0.1);
  }

  tick() {
    if (!this.ctx) return;
    this._tone(this.ctx.currentTime, 'sine', 1500, 1500, 0.03, 0.04);
  }

  expire() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 'sawtooth', 260, 80, 0.22, 0.06);
    this._noise(t, 0.2, 'lowpass', 600, 0.5, 0.2);
  }

  bad() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, 'square', 180, 140, 0.18, 0.08);
  }

  beep(freq = 660, dur = 0.12, vol = 0.22, delay = 0) {
    if (!this.ctx) return;
    this._tone(this.ctx.currentTime + delay, 'sine', freq, freq, dur, vol);
  }

  chime() {
    [660, 880, 1320].forEach((f, i) => this.beep(f, 0.18, 0.2, i * 0.09));
  }
}
