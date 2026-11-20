/**
 * VioletAudioEngine — 《今夜，局部紫色流星雨》纯 Web Audio 声音引擎
 * 零外部音频文件依赖，支持 PC 与移动端浏览器。
 *
 * 包含 5 层实时合成音色：
 * 1. 绒感钢琴 + 八音盒夜曲循环（EbMaj9 -> Cm9 -> AbMaj9 -> Bb6/9）
 * 2. 柔焦星雨氛围白噪底（随伞开合平滑呼吸）
 * 3. 开伞 / 合伞丝绸物理音效 + 锁扣微鸣
 * 4. 转伞微风与五声音阶风铃星光音
 * 5. 流星落水立体声水滴清音 + 许愿星璀璨和弦
 *
 * 使用示例：
 *   const audio = new VioletAudioEngine();
 *   button.addEventListener('click', () => audio.toggle()); // 必须在用户点击手势内启动
 *   audio.playOpen();
 *   audio.playClose();
 *   audio.playStarSplash(0.2); // pan: -1(左) ~ 1(右)
 *   audio.playWishLaunch();
 *   audio.playWishImpact(0);
 *   // 每帧动画循环调用：
 *   audio.updateContinuous({ dt, openVal, omega, rainActive });
 */
(function (global) {
  'use strict';

  function midiToHz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  // Eb Major 9 -> Cm9 -> Ab Major 9 -> Bb6/9 温柔夜曲织体（共 32 拍，约 74 BPM）
  const SCORE = [
    // Bar 1: Ebmaj9
    { step: 0,  notes: [51, 58, 67], vel: 0.42, dur: 3.4, box: false },
    { step: 2,  notes: [65],         vel: 0.28, dur: 2.2, box: false },
    { step: 4,  notes: [70],         vel: 0.30, dur: 2.4, box: false },
    { step: 6,  notes: [74],         vel: 0.34, dur: 2.8, box: true  },
    { step: 7,  notes: [70],         vel: 0.22, dur: 1.8, box: false },

    // Bar 2: Cm9
    { step: 8,  notes: [48, 55, 63], vel: 0.40, dur: 3.4, box: false },
    { step: 10, notes: [62],         vel: 0.26, dur: 2.2, box: false },
    { step: 12, notes: [67],         vel: 0.30, dur: 2.4, box: false },
    { step: 14, notes: [70],         vel: 0.33, dur: 2.8, box: true  },
    { step: 15, notes: [75],         vel: 0.24, dur: 2.2, box: true  },

    // Bar 3: Abmaj9
    { step: 16, notes: [44, 51, 60], vel: 0.42, dur: 3.4, box: false },
    { step: 18, notes: [58],         vel: 0.26, dur: 2.2, box: false },
    { step: 20, notes: [67],         vel: 0.30, dur: 2.6, box: false },
    { step: 22, notes: [72],         vel: 0.32, dur: 2.8, box: true  },
    { step: 23, notes: [70],         vel: 0.22, dur: 1.9, box: false },

    // Bar 4: Bb6/9
    { step: 24, notes: [46, 53, 62], vel: 0.38, dur: 3.4, box: false },
    { step: 26, notes: [60],         vel: 0.25, dur: 2.2, box: false },
    { step: 28, notes: [65],         vel: 0.29, dur: 2.6, box: false },
    { step: 30, notes: [67],         vel: 0.28, dur: 2.8, box: true  },
    { step: 31, notes: [74],         vel: 0.20, dur: 2.6, box: true  }
  ];

  // 高音五声音阶（风铃与流星落水用，任何音叠加都极和谐）
  const PENTATONIC_HIGH = [75, 77, 79, 82, 84, 86, 87, 89, 91];

  class VioletAudioEngine {
    constructor(options = {}) {
      this.ctx = null;
      this.enabled = false;
      this.musicEnabled = options.musicEnabled !== undefined ? options.musicEnabled : true;
      this.masterVolume = options.masterVolume !== undefined ? options.masterVolume : 0.78;

      this.masterGain = null;
      this.dryBus = null;
      this.wetBus = null;
      this.musicFilter = null;
      this.rainGain = null;
      this.rainFilter = null;
      this.noiseBuffer = null;

      // Sequencer & cooldown timers
      this._stepDur = 0.41; // ~73 BPM eighth-note pulse
      this._seqAcc = 0;
      this._seqStep = 0;
      this._lastSplashAt = 0;
      this._lastChimeAt = 0;
    }

    /** 初始化音频图（需在点击/触摸事件中调用） */
    init() {
      if (this.ctx) return;
      const AudioCtx = global.AudioContext || global.webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      this.ctx = ctx;

      // Master compressor -> master gain -> destination
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 18;
      comp.ratio.value = 4;
      comp.attack.value = 0.01;
      comp.release.value = 0.25;

      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = 0.0001;

      comp.connect(this.masterGain);
      this.masterGain.connect(ctx.destination);

      // Dry + Lush Hall Reverb Bus
      this.dryBus = ctx.createGain();
      this.dryBus.gain.value = 0.72;
      this.dryBus.connect(comp);

      const convolver = ctx.createConvolver();
      convolver.buffer = this._createReverbIR(ctx, 2.7, 2.4);

      const reverbLP = ctx.createBiquadFilter();
      reverbLP.type = 'lowpass';
      reverbLP.frequency.value = 3400;

      this.wetBus = ctx.createGain();
      this.wetBus.gain.value = 0.44;
      this.wetBus.connect(convolver);
      convolver.connect(reverbLP);
      reverbLP.connect(comp);

      // Warm global filter for piano/music box (opens up when umbrella opens!)
      this.musicFilter = ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 1600;
      this.musicFilter.connect(this.dryBus);
      this.musicFilter.connect(this.wetBus);

      // Shared soft pink-ish noise buffer
      this.noiseBuffer = this._createSoftNoiseBuffer(ctx, 3.0);

      // Continuous gentle starlight rain shimmer bed
      const rainSrc = ctx.createBufferSource();
      rainSrc.buffer = this.noiseBuffer;
      rainSrc.loop = true;

      this.rainFilter = ctx.createBiquadFilter();
      this.rainFilter.type = 'bandpass';
      this.rainFilter.frequency.value = 1850;
      this.rainFilter.Q.value = 0.7;

      this.rainGain = ctx.createGain();
      this.rainGain.gain.value = 0.0001;

      rainSrc.connect(this.rainFilter);
      this.rainFilter.connect(this.rainGain);
      this.rainGain.connect(this.dryBus);
      this.rainGain.connect(this.wetBus);
      rainSrc.start();
    }

    /** 开启声音 */
    async enable() {
      this.init();
      if (!this.ctx) return false;
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      this.enabled = true;
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(this.masterVolume, now, 0.12);
      return true;
    }

    /** 关闭声音 */
    disable() {
      this.enabled = false;
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(0.0001, now, 0.08);
    }

    /** 切换开关 */
    async toggle() {
      if (this.enabled) {
        this.disable();
        return false;
      }
      return await this.enable();
    }

    /** 切换钢琴夜曲开关（可只留雨声风铃） */
    setMusicEnabled(flag) {
      this.musicEnabled = !!flag;
    }

    /** 重置乐句起点（配合“重播开场”同步起音） */
    resetPhrase() {
      this._seqStep = 0;
      this._seqAcc = 0;
    }

    /** 撑伞物理音效：轻柔丝绸撑开 + 伞扣清脆微鸣 */
    playOpen() {
      if (!this.enabled || !this.ctx) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;

      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 1.6;
      filter.frequency.setValueAtTime(340, now);
      filter.frequency.exponentialRampToValueAtTime(1250, now + 0.34);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.11, now + 0.14);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

      src.connect(filter);
      filter.connect(g);
      g.connect(this.dryBus);
      g.connect(this.wetBus);
      src.start(now);
      src.stop(now + 0.46);

      // Subtle crystal click-chime when umbrella blooms open
      this._playCelestaTone(midiToHz(82), now + 0.22, 1.3, 0.075, 0);
      this._playCelestaTone(midiToHz(87), now + 0.29, 1.5, 0.06, 0.18);
    }

    /** 合伞物理音效：轻缓收拢滑落 */
    playClose() {
      if (!this.enabled || !this.ctx) return;
      const ctx = this.ctx;
      const now = ctx.currentTime;

      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 1.8;
      filter.frequency.setValueAtTime(1050, now);
      filter.frequency.exponentialRampToValueAtTime(240, now + 0.36);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.09, now + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.40);

      src.connect(filter);
      filter.connect(g);
      g.connect(this.dryBus);
      g.connect(this.wetBus);
      src.start(now);
      src.stop(now + 0.45);

      // Soft warm muted resolution tone
      this._playFeltPianoTone(midiToHz(58), now + 0.12, 1.6, 0.07, 0);
    }

    /** 普通流星落水清音（自动节流 + 立体声声像） */
    playStarSplash(pan = 0) {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      if (now - this._lastSplashAt < 0.24) return;
      if (Math.random() > 0.55) return; // keep sparse & serene
      this._lastSplashAt = now;

      const midi = PENTATONIC_HIGH[Math.floor(Math.random() * PENTATONIC_HIGH.length)];
      const hz = midiToHz(midi);
      const ctx = this.ctx;

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      // Tiny water-droplet upward chirp
      osc.frequency.setValueAtTime(hz * 0.96, now);
      osc.frequency.exponentialRampToValueAtTime(hz, now + 0.045);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.032, now + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

      const out = this._createPanner(ctx, clamp(pan, -0.75, 0.75));
      osc.connect(g);
      g.connect(out);
      out.connect(this.dryBus);
      out.connect(this.wetBus);

      osc.start(now);
      osc.stop(now + 0.46);
    }

    /** 许愿星起落轻吟 */
    playWishLaunch() {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      [79, 82, 86, 89].forEach((m, i) => {
        this._playCelestaTone(midiToHz(m), now + i * 0.055, 1.1, 0.055, -0.25 + i * 0.16);
      });
    }

    /** 许愿星坠入水洼：温暖璀璨的 Maj9 晶莹和弦 */
    playWishImpact(pan = 0) {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const chord = [67, 70, 74, 77, 82]; // G4, Bb4, D5, F5, Bb5 (EbMaj9 upper shimmer)
      chord.forEach((m, i) => {
        this._playCelestaTone(
          midiToHz(m),
          now + i * 0.032,
          2.6,
          0.068 - i * 0.006,
          clamp(pan + (i - 2) * 0.14, -0.8, 0.8)
        );
      });
    }

    /** 每帧更新：驱动夜曲音序器、星雨底噪与转伞风铃 */
    updateContinuous({ dt, openVal = 0, omega = 0, rainActive = false }) {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;

      // 1. Modulate starlight rain shimmer bed
      const targetRain = rainActive && openVal > 0.35
        ? clamp(0.022 + Math.abs(omega) * 0.008, 0.02, 0.055)
        : 0.004;
      this.rainGain.gain.setTargetAtTime(targetRain, now, 0.25);
      this.rainFilter.frequency.setTargetAtTime(1500 + Math.abs(omega) * 240, now, 0.2);

      // 2. Modulate piano warmth with umbrella open state
      const targetCutoff = 900 + openVal * 1500;
      this.musicFilter.frequency.setTargetAtTime(targetCutoff, now, 0.22);

      // 3. Spin wind chimes when umbrella rotates briskly
      const absW = Math.abs(omega);
      if (openVal > 0.45 && absW > 1.35 && now - this._lastChimeAt > Math.max(0.11, 0.36 - absW * 0.04)) {
        this._lastChimeAt = now;
        const m = PENTATONIC_HIGH[Math.floor(Math.random() * PENTATONIC_HIGH.length)];
        this._playCelestaTone(
          midiToHz(m),
          now,
          1.35,
          clamp(0.028 + absW * 0.007, 0.028, 0.068),
          (Math.random() - 0.5) * 1.1
        );
      }

      // 4. Gentle felt-piano & music-box sequencer
      if (this.musicEnabled) {
        this._seqAcc += dt;
        while (this._seqAcc >= this._stepDur) {
          this._seqAcc -= this._stepDur;
          this._triggerScoreStep(this._seqStep, now);
          this._seqStep = (this._seqStep + 1) % 32;
        }
      }
    }

    _triggerScoreStep(step, now) {
      const evt = SCORE.find(s => s.step === step);
      if (!evt) return;
      evt.notes.forEach((m, idx) => {
        const humanOffset = idx * 0.024 + Math.random() * 0.012;
        const pan = clamp(((m - 62) / 28) * 0.55, -0.55, 0.55);
        if (evt.box) {
          this._playCelestaTone(midiToHz(m), now + humanOffset, evt.dur, evt.vel * 0.22, pan);
        } else {
          this._playFeltPianoTone(midiToHz(m), now + humanOffset, evt.dur, evt.vel * 0.28, pan);
        }
      });
    }

    _playFeltPianoTone(hz, startTime, dur, gainPeak, pan) {
      const ctx = this.ctx;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'triangle';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(hz, startTime);
      osc2.frequency.setValueAtTime(hz * 2, startTime);

      const g1 = ctx.createGain();
      const g2 = ctx.createGain();
      g1.gain.setValueAtTime(0.0001, startTime);
      g1.gain.linearRampToValueAtTime(gainPeak, startTime + 0.022);
      g1.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

      g2.gain.setValueAtTime(0.0001, startTime);
      g2.gain.linearRampToValueAtTime(gainPeak * 0.22, startTime + 0.018);
      g2.gain.exponentialRampToValueAtTime(0.0001, startTime + Math.min(dur * 0.45, 0.9));

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1600, startTime);
      lp.frequency.exponentialRampToValueAtTime(520, startTime + dur * 0.7);

      const out = this._createPanner(ctx, pan);
      osc1.connect(g1);
      osc2.connect(g2);
      g1.connect(lp);
      g2.connect(lp);
      lp.connect(out);
      out.connect(this.musicFilter);

      osc1.start(startTime);
      osc2.start(startTime);
      osc1.stop(startTime + dur + 0.06);
      osc2.stop(startTime + dur + 0.06);
    }

    _playCelestaTone(hz, startTime, dur, gainPeak, pan) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const over = ctx.createOscillator();
      osc.type = 'sine';
      over.type = 'sine';
      osc.frequency.setValueAtTime(hz, startTime);
      over.frequency.setValueAtTime(hz * 3.0, startTime); // glassy music-box shimmer

      const g1 = ctx.createGain();
      const g2 = ctx.createGain();
      g1.gain.setValueAtTime(0.0001, startTime);
      g1.gain.linearRampToValueAtTime(gainPeak, startTime + 0.01);
      g1.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

      g2.gain.setValueAtTime(0.0001, startTime);
      g2.gain.linearRampToValueAtTime(gainPeak * 0.14, startTime + 0.008);
      g2.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.22);

      const out = this._createPanner(ctx, pan);
      osc.connect(g1);
      over.connect(g2);
      g1.connect(out);
      g2.connect(out);
      out.connect(this.musicFilter);

      osc.start(startTime);
      over.start(startTime);
      osc.stop(startTime + dur + 0.06);
      over.stop(startTime + 0.26);
    }

    _createPanner(ctx, pan) {
      if (typeof ctx.createStereoPanner === 'function') {
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        return p;
      }
      return ctx.createGain();
    }

    _createSoftNoiseBuffer(ctx, seconds) {
      const len = Math.floor(ctx.sampleRate * seconds);
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = buf.getChannelData(ch);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < len; i++) {
          const white = Math.random() * 2 - 1;
          // Smooth pink-tinted noise
          b0 = 0.997 * b0 + white * 0.029;
          b1 = 0.985 * b1 + white * 0.032;
          b2 = 0.950 * b2 + white * 0.048;
          data[i] = (b0 + b1 + b2 + white * 0.12) * 0.45;
        }
      }
      return buf;
    }

    _createReverbIR(ctx, duration, decay) {
      const len = Math.floor(ctx.sampleRate * duration);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          const t = i / len;
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
        }
      }
      return ir;
    }
  }

  global.VioletAudioEngine = VioletAudioEngine;
})(window);
