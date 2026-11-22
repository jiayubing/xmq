/* Original score and synthesized sound for 小雪. All times are seconds. */
(function (global) {
  'use strict';

  const BEAT = 60 / 72;
  const LOOP = BEAT * 16;
  const MIN_GAIN = 0.0001;
  const CHIMES = [77, 79, 81, 84, 86, 89, 91];
  const HARMONY = [[41, 48, 57, 64, 67], [38, 45, 53, 60, 64],
    [46, 53, 57, 60, 62], [48, 55, 57, 64, 74]];
  // Eighth-note steps. Melody grows with the plum and leaves air for the poem.
  const SCORE = [
    [0, [41, 53, 60], .37, 2.5], [2, [65], .24, 1.9],
    [4, [69, 72], .51, 2.8], [5, [77], .28, 1.8, true],
    [6, [79], .28, 1.7, true], [7, [72], .31, 1.6],
    [8, HARMONY[1], .42, 3.2], [10, [69, 77], .32, 1.9],
    [11, [81], .28, 1.7, true], [12, [76], .31, 2.0], [14, [72, 74], .30, 2.2],
    [16, HARMONY[2], .30, 3.3], [18, [77], .25, 2.4],
    [20, [81, 84], .23, 2.8, true], [22, [74], .26, 1.8],
    [24, HARMONY[3], .33, 3.3], [26, [74, 79], .22, 2.0],
    [28, [76], .26, 2.4], [30, [72], .21, 2.0, true]
  ];

  const hz = midi => 440 * 2 ** ((midi - 69) / 12);
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  function holdGain(gain, time) {
    if (typeof gain.cancelAndHoldAtTime === 'function') {
      gain.cancelAndHoldAtTime(time);
    } else {
      const value = gain.value;
      gain.cancelScheduledValues(time);
      gain.setValueAtTime(value, time);
    }
  }

  class SnowAudioEngine {
    constructor() {
      this.ctx = null;
      this.enabled = false;
      this.hidden = false;
      this.voices = new Set();
      this.lastHover = -Infinity;
      this.lastClick = -Infinity;
      this.lastBell = -Infinity;
      this.nextUpdate = 0;
      this.cues = [];
    }

    init() {
      if (this.ctx) return true;
      const Audio = global.AudioContext || global.webkitAudioContext;
      if (!Audio) return false;
      const ctx = this.ctx = new Audio();
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.dry = ctx.createGain();
      this.dry.gain.value = .80;
      this.wet = ctx.createGain();
      this.wet.gain.value = .37;
      this.hallImpulse = this.makeImpulse();
      this.hallTone = this.filter('lowpass', 3800);
      this.tone = this.filter('lowpass', 6400);
      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -19;
      this.compressor.knee.value = 21;
      this.compressor.ratio.value = 3.2;
      this.compressor.attack.value = .008;
      this.compressor.release.value = .24;
      this.dry.connect(this.tone);
      this.hallTone.connect(this.tone);
      this.resetHall();
      this.tone.connect(this.compressor).connect(this.master).connect(ctx.destination);

      this.music = this.filter('lowpass', 1250);
      this.route(this.music, .7);
      this.noise = this.makeNoise();
      this.windFilter = this.filter('bandpass', 530, .56);
      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0;
      const wind = ctx.createBufferSource();
      wind.buffer = this.noise;
      wind.loop = true;
      wind.connect(this.windFilter).connect(this.windGain);
      this.route(this.windGain, .22);
      wind.start();
      return true;
    }

    filter(type, cutoff, q = .55) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = cutoff;
      filter.Q.value = q;
      return filter;
    }

    resetHall() {
      if (this.hall) {
        this.wet.disconnect(this.hall);
        this.hall.disconnect();
      }
      this.hall = this.ctx.createConvolver();
      this.hall.buffer = this.hallImpulse;
      this.wet.connect(this.hall).connect(this.hallTone);
    }

    route(node, send) {
      const reverbSend = this.ctx.createGain();
      reverbSend.gain.value = send;
      node.connect(this.dry);
      node.connect(reverbSend).connect(this.wet);
      return reverbSend;
    }

    makeNoise() {
      const length = Math.floor(this.ctx.sampleRate * 4);
      const buffer = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        let low = 0, mid = 0, high = 0;
        for (let i = 0; i < length; i++) {
          const white = Math.random() * 2 - 1;
          low = .997 * low + white * .027;
          mid = .976 * mid + white * .037;
          high = .899 * high + white * .068;
          data[i] = (low + mid + high + white * .13) * .53 *
            Math.min(1, i / 1500, (length - 1 - i) / 1500);
        }
      }
      return buffer;
    }

    makeImpulse() {
      const rate = this.ctx.sampleRate;
      const length = Math.floor(rate * 2.6);
      const ir = this.ctx.createBuffer(2, length, rate);
      for (let channel = 0; channel < 2; channel++) {
        const data = ir.getChannelData(channel);
        let damp = 0;
        for (let i = Math.floor(rate * .017); i < length; i++) {
          const white = Math.random() * 2 - 1;
          damp = .62 * damp + .38 * white;
          data[i] = (white * .28 + damp * .72) * (1 - i / length) ** 3.2 *
            Math.min(1, (i / rate - .017) / .045);
        }
        [.024, .037, .053, .076, .111].forEach((delay, i) => {
          const index = Math.floor((delay + channel * .003) * rate);
          data[index] += .68 / (i + 1);
          data[index + 1] += .23 / (i + 1);
        });
      }
      return ir;
    }

    async enable() {
      if (!this.init()) return false;
      clearTimeout(this.suspendTimer);
      // An autoplay request can stay pending until a later gesture retries resume().
      const request = this.enableRequest = {};
      await this.ctx.resume();
      if (this.enableRequest !== request) return false;
      this.enabled = this.ctx.state === 'running';
      this.setMaster();
      return this.enabled;
    }

    disable() {
      this.enableRequest = null;
      this.enabled = false;
      if (!this.ctx) return;
      this.setMaster();
      this.clearVoices();
      clearTimeout(this.suspendTimer);
      this.suspendTimer = setTimeout(() => {
        if (!this.enabled) void this.ctx.suspend().catch(() => {});
      }, 260);
    }

    setMaster() {
      if (!this.master) return;
      const now = this.ctx.currentTime;
      holdGain(this.master.gain, now);
      this.master.gain.setTargetAtTime(this.enabled && !this.hidden ? .84 : 0, now, .045);
    }

    setHidden(hidden) {
      this.hidden = hidden;
      this.setMaster();
      if (hidden && this.ctx) this.clearVoices();
    }

    clearVoices() {
      const now = this.ctx.currentTime;
      for (const voice of this.voices) {
        const stop = now < voice.start ? now : now + .035;
        holdGain(voice.envelope.gain, now);
        voice.envelope.gain.setTargetAtTime(0, now, .008);
        voice.source.stop(Math.min(voice.end, stop));
      }
      this.voices.clear();
    }

    resetTimeline(time = 0, cues = []) {
      if (!this.enabled) return;
      this.clearVoices();
      if (this.origin !== undefined) this.resetHall();
      const now = this.ctx.currentTime;
      this.origin = now + .044 - time;
      this.cues = cues;
      this.cueIndex = cues.findIndex(cue => cue.at >= time - .0001);
      if (this.cueIndex < 0) this.cueIndex = cues.length;
      this.cycle = Math.floor(time / LOOP);
      this.scoreIndex = SCORE.findIndex(([step]) => this.cycle * LOOP + step * BEAT / 2 >= time - .0001);
      if (this.scoreIndex < 0) {
        this.scoreIndex = 0;
        this.cycle++;
      }
      this.nextUpdate = 0;
      this.lastBell = -Infinity;
      this.lastHover = -Infinity;
      this.lastClick = -Infinity;
      if (time > .22) {
        const next = this.cycle * LOOP + SCORE[this.scoreIndex][0] * BEAT / 2;
        if (next - time > .23) {
          const chord = HARMONY[Math.floor((time % LOOP) / (4 * BEAT))];
          this.pianoChord(chord.slice(1, 4), now + .045, 1.3, .12);
        }
      }
    }

    timelineTime() {
      if (!this.enabled || this.hidden || this.ctx.state !== 'running' || this.origin === undefined) return null;
      return Math.max(0, this.ctx.currentTime - this.origin);
    }

    updateContinuous({ time, wind = .3, opening = 0, pointer = 0 } = {}) {
      if (!this.enabled || this.hidden) return;
      const now = this.ctx.currentTime;
      if (now >= this.nextUpdate) {
        this.nextUpdate = now + .046;
        const gust = clamp(wind, 0, 1);
        this.windGain.gain.setTargetAtTime(.064 + gust * .18 + pointer * .11, now, .11);
        this.windFilter.frequency.setTargetAtTime(365 + gust * 620 + pointer * 460, now, .13);
        this.music.frequency.setTargetAtTime(1220 + clamp(opening, 0, 1) * 4160, now, .22);
      }
      if (this.origin === undefined || !Number.isFinite(time)) return;
      const horizon = now + .14;
      while (this.cueIndex < this.cues.length) {
        const cue = this.cues[this.cueIndex];
        const when = this.origin + cue.at;
        if (when > horizon) break;
        this.cueIndex++;
        if (when >= now - .10) this[cue.method](cue.pan, Math.max(now + .004, when), cue.detail);
      }
      while (true) {
        const [step, notes, velocity, duration, bell] = SCORE[this.scoreIndex];
        const when = this.origin + this.cycle * LOOP + step * BEAT / 2;
        if (when > horizon) break;
        if (when >= now - .14) {
          if (bell) {
            notes.forEach((note, i) => this.bell(note, Math.max(now + .004, when) + i * .023, duration, velocity * .18, .24));
          } else {
            this.pianoChord(notes, Math.max(now + .004, when), duration, velocity);
          }
        }
        this.scoreIndex++;
        if (this.scoreIndex === SCORE.length) {
          this.scoreIndex = 0;
          this.cycle++;
        }
      }
    }

    playSnowTouch(pan = 0, when = this.ctx?.currentTime) {
      if (!this.enabled) return;
      this.rustle(when, .27, .24, 1180, 690, pan, .056);
      this.rustle(when + .105, .17, .13, 1540, 820, pan + .12, .025);
    }

    playBlossomNote(pan = 0, when = this.ctx?.currentTime, detail = 0) {
      if (!this.enabled || when - this.lastBell < .145) return;
      this.lastBell = when;
      const note = CHIMES[detail % CHIMES.length];
      this.bell(note, when, 1.52, .061, pan, .974);
    }

    playBlessingChord(pan = 0, when = this.ctx?.currentTime) {
      if (!this.enabled) return;
      this.pianoChord([...HARMONY[2], 65], when, 3.7, .40);
      this.bell(77, when + .085, 2.45, .049, pan - .27);
      this.bell(84, when + .18, 2.6, .041, pan + .32);
    }

    playHover(pan, strength) {
      if (!this.enabled || this.hidden) return;
      const now = this.ctx.currentTime;
      if (now - this.lastHover < .47) return;
      this.lastHover = now;
      this.rustle(now, .48, .13 * strength, 920, 530, pan, .10);
      this.bell(CHIMES[Math.floor(Math.random() * CHIMES.length)], now + .055, 1.28, .035 * strength, pan, .98);
    }

    playClick(pan) {
      if (!this.enabled || this.hidden) return;
      const now = this.ctx.currentTime;
      if (now - this.lastClick < .17) return;
      this.lastClick = now;
      this.bell(81, now + .025, 1.54, .044, pan - .10);
      this.bell(84, now + .082, 1.77, .033, pan + .14);
    }

    panner(pan) {
      if (!this.ctx.createStereoPanner) return this.ctx.createGain();
      const node = this.ctx.createStereoPanner();
      node.pan.value = clamp(pan, -.85, .85);
      return node;
    }

    pianoChord(notes, when, duration, velocity) {
      notes.forEach((note, index) => {
        this.piano(note, when + index * .014, duration, velocity * (index === 0 ? .32 : .24),
          clamp((note - 60) / 43, -.47, .47));
      });
    }

    piano(note, when, duration, level, pan) {
      const felt = this.filter('lowpass', 1600 + hz(note) * .9);
      felt.frequency.setValueAtTime(felt.frequency.value, when);
      felt.frequency.exponentialRampToValueAtTime(470 + hz(note) * .72, when + duration * .68);
      felt.connect(this.music);
      const root = this.partial('triangle', hz(note), when, duration, level, .017, pan, felt);
      this.partial('sine', hz(note) * 1.0035, when, duration * .92, level * .43, .024, pan + .07, felt);
      this.partial('sine', hz(note) * 2.006, when, Math.min(.87, duration * .51), level * .27, .008, pan - .06, felt);
      root.addEventListener('ended', () => felt.disconnect(), { once: true });
    }

    bell(note, when, duration, level, pan, glide = 1) {
      const frequency = hz(note);
      this.partial('sine', frequency, when, duration, level, .008, pan, this.music, glide);
      this.partial('sine', frequency * 2.004, when, duration * .41, level * .24, .005, pan, this.music, glide);
      this.partial('sine', frequency * 3.011, when, .24, level * .105, .004, pan, this.music, glide);
    }

    partial(type, frequency, when, duration, level, attack, pan, destination, glide = 1) {
      const oscillator = this.ctx.createOscillator();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency * glide, when);
      if (glide !== 1) oscillator.frequency.exponentialRampToValueAtTime(frequency, when + .052);
      this.voice(oscillator, when, duration, level, attack, pan, destination);
      return oscillator;
    }

    rustle(when, duration, level, from, to, pan, attack) {
      const source = this.ctx.createBufferSource();
      source.buffer = this.noise;
      const filter = this.filter('bandpass', from, .65);
      filter.frequency.setValueAtTime(from, when);
      filter.frequency.exponentialRampToValueAtTime(to, when + duration * .78);
      source.connect(filter);
      this.voice(source, when, duration, level, attack, pan, null, filter, .18 + Math.random() * 2);
    }

    voice(source, start, duration, level, attack, pan, destination, input = source, offset) {
      const envelope = this.ctx.createGain();
      const end = start + duration + .018;
      const out = this.panner(pan);
      envelope.gain.setValueAtTime(MIN_GAIN, start);
      envelope.gain.linearRampToValueAtTime(Math.max(MIN_GAIN, level), start + attack);
      envelope.gain.exponentialRampToValueAtTime(MIN_GAIN, start + duration);
      input.connect(envelope).connect(out);
      const send = destination ? null : this.route(out, .38);
      if (destination) out.connect(destination);
      if (offset === undefined) source.start(start);
      else source.start(start, offset);
      source.stop(end);
      const voice = { source, envelope, start, end };
      this.voices.add(voice);
      source.onended = () => {
        this.voices.delete(voice);
        source.disconnect();
        if (input !== source) input.disconnect();
        envelope.disconnect();
        out.disconnect();
        send?.disconnect();
      };
    }
  }

  global.SnowAudioEngine = SnowAudioEngine;
})(window);
