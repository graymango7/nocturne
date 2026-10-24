// WebAudio로 즉석 합성하는 효과음 (외부 음원 파일 없음)
export class Sfx {
  constructor() { this.ctx = null; this.vol = 0.7; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.vol; this.master.connect(c.destination);
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    this.brown = buf;
    const wb = c.createBuffer(1, len, c.sampleRate), wd = wb.getChannelData(0);
    for (let i = 0; i < len; i++) wd[i] = Math.random() * 2 - 1;
    this.white = wb;
    // 바람
    const wind = c.createBufferSource(); wind.buffer = buf; wind.loop = true;
    this.windF = c.createBiquadFilter(); this.windF.type = 'lowpass'; this.windF.frequency.value = 420;
    this.windG = c.createGain(); this.windG.gain.value = 0.18;
    wind.connect(this.windF).connect(this.windG).connect(this.master); wind.start();
    // 밤 저음
    this.drone = c.createOscillator(); this.drone.frequency.value = 46; this.drone.type = 'sawtooth';
    const df = c.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 120;
    this.droneG = c.createGain(); this.droneG.gain.value = 0;
    this.drone.connect(df).connect(this.droneG).connect(this.master); this.drone.start();
    this.hbT = 0;
  }

  get ok() { return !!this.ctx; }

  tone(f, d = 0.15, type = 'sine', v = 0.2, f2 = null, delay = 0) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + d + 0.05);
  }

  noise(d = 0.2, v = 0.2, freq = 1000, q = 1, type = 'bandpass', white = true, delay = 0) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = white ? this.white : this.brown; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random()); s.stop(t + d + 0.05);
  }

  pick() { this.tone(660, 0.09, 'sine', 0.15, 990); this.tone(990, 0.12, 'sine', 0.1, 1320, 0.06); }
  craft() { [0, 0.08, 0.16].forEach((d, i) => this.noise(0.07, 0.25, 2500 + i * 400, 4, 'bandpass', true, d)); this.tone(520, 0.3, 'triangle', 0.12, 780, 0.22); }
  objective() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.13, null, i * 0.09)); }
  mission() { [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.14, null, i * 0.11)); }
  msg() { this.tone(1320, 0.07, 'sine', 0.08); this.tone(1760, 0.09, 'sine', 0.06, null, 0.07); }
  lever() { this.noise(0.18, 0.5, 300, 2, 'bandpass', true); this.tone(110, 0.2, 'square', 0.08, 60); }
  step(sprint) { this.noise(0.08, sprint ? 0.16 : 0.09, 350 + Math.random() * 200, 1.2, 'lowpass', false); }
  alarm() { this.tone(880, 0.25, 'square', 0.05); this.tone(660, 0.25, 'square', 0.05, null, 0.3); }
  hit() { this.noise(0.5, 0.7, 200, 0.7, 'lowpass', false); this.tone(90, 0.6, 'sawtooth', 0.2, 40); }
  flare() { this.noise(1.6, 0.25, 4000, 0.5, 'highpass', true); this.tone(300, 0.3, 'square', 0.06, 900); }
  power() { this.tone(80, 1.2, 'sawtooth', 0.15, 240); this.tone(240, 0.8, 'sine', 0.1, 480, 0.6); }
  screech(vol = 1) {
    if (!this.ok || vol < 0.03) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'square';
    o.frequency.setValueAtTime(1300, t); o.frequency.exponentialRampToValueAtTime(380, t + 0.7);
    o2.frequency.setValueAtTime(1370, t); o2.frequency.exponentialRampToValueAtTime(350, t + 0.7);
    f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25 * vol, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    o.connect(f); o2.connect(f); f.connect(g).connect(this.master);
    o.start(t); o2.start(t); o.stop(t + 0.9); o2.stop(t + 0.9);
  }

  // 울보의 긴 비명: 떨리는 고음이 길게 이어진다
  scream(vol = 1) {
    if (!this.ok || vol < 0.03) return;
    const c = this.ctx, t = c.currentTime, g = c.createGain(), f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 2;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3 * vol, t + 0.15);
    g.gain.setValueAtTime(0.3 * vol, t + 1.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    for (const [type, det] of [['sawtooth', 0], ['square', 13]]) {
      const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain();
      o.type = type; o.frequency.setValueAtTime(650 + det, t); o.frequency.linearRampToValueAtTime(1450 + det, t + 0.6); o.frequency.linearRampToValueAtTime(900 + det, t + 1.9);
      lfo.frequency.value = 11; lg.gain.value = 60; lfo.connect(lg).connect(o.frequency);
      o.connect(f); o.start(t); lfo.start(t); o.stop(t + 2); lfo.stop(t + 2);
    }
    f.connect(g).connect(this.master);
  }
  whimper() { this.tone(1600, 0.35, 'triangle', 0.12, 500); this.tone(1400, 0.3, 'triangle', 0.08, 450, 0.12); }
  stormWarn() { this.tone(55, 2.5, 'sawtooth', 0.12, 40); this.noise(3, 0.25, 300, 0.6, 'lowpass', false); }

  // 매 프레임: 밤 분위기 / 심장박동
  ambient(dt, night, danger, storm = 0) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.droneG.gain.setTargetAtTime(night * 0.05 + danger * 0.05, t, 1);
    this.windG.gain.setTargetAtTime(0.12 + night * 0.08 + storm * 0.4, t, 1);
    this.windF.frequency.setTargetAtTime(420 + storm * 900, t, 1);
    if (danger > 0.05) {
      this.hbT -= dt;
      if (this.hbT <= 0) { this.hbT = 1.0 - danger * 0.5; this.tone(55, 0.15, 'sine', 0.3 * danger + 0.05); this.tone(50, 0.15, 'sine', 0.25 * danger + 0.04, null, 0.18); }
    }
  }

  // 튜너 음: 두 오실레이터가 맞으면 맥놀이가 사라진다
  hum(on, f1 = 0, f2 = 0) {
    if (!this.ok) return;
    const c = this.ctx;
    if (on && !this.humO) {
      this.humO = [c.createOscillator(), c.createOscillator()]; this.humG = c.createGain(); this.humG.gain.value = 0.04;
      this.humO.forEach(o => { o.type = 'sine'; o.connect(this.humG); o.start(); });
      this.humG.connect(this.master);
    }
    if (!on && this.humO) { this.humO.forEach(o => o.stop()); this.humO = null; return; }
    if (this.humO) { this.humO[0].frequency.value = 180 + f1 * 90; this.humO[1].frequency.value = 180 + f2 * 90; }
  }
}
