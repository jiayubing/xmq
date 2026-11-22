(() => {
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.50, 1174.66];

  class Soundscape {
    enabled = true;
    context = null;
    lastWeather = -1;

    toggle() {
      this.enabled = !this.enabled;
      if (this.context) {
        this.master.gain.setTargetAtTime(this.enabled ? .53 : 0, this.context.currentTime, .055);
      }
      return this.enabled;
    }

    async play(fromGesture) {
      if (!this.enabled) return;
      if (!this.context) this.create();
      // Autoplay may leave the context suspended until a trusted interaction.
      if (fromGesture && this.context.state !== "running") await this.context.resume();
    }

    create() {
      const context = new AudioContext();
      this.context = context;
      this.master = context.createGain();
      this.master.gain.value = .53;
      this.master.connect(context.destination);

      const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
      const samples = buffer.getChannelData(0);
      const noise = context.createBufferSource();
      let pink = 0;
      for (let index = 0; index < samples.length; index++) {
        const white = Math.random() * 2 - 1;
        pink = .86 * pink + .14 * white;
        samples[index] = .68 * white + .32 * pink;
      }
      noise.buffer = buffer;
      noise.loop = true;
      this.rain = this.ambience(noise, "bandpass", 2250, .48);
      this.wind = this.ambience(noise, "lowpass", 410, .61);
      noise.start();
    }

    ambience(source, type, frequency, q) {
      const filter = this.context.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = q;
      const gain = this.context.createGain();
      gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(this.master);
      return gain;
    }

    weather(time, visible = true) {
      if (!this.context) return;
      const frost = Math.round(Math.max(0, Math.min(1, (time - 2.5) / 5)) * 32) / 32;
      const key = visible ? frost : -2;
      if (key === this.lastWeather) return;
      this.lastWeather = key;
      const now = this.context.currentTime;
      this.rain.gain.setTargetAtTime(visible ? .25 * (1 - frost) : 0, now, .18);
      this.wind.gain.setTargetAtTime(visible ? .16 * frost : 0, now, .23);
    }

    chime(index, offset = 0, strength = 1) {
      if (!this.context || !this.enabled) return;
      const time = this.context.currentTime + offset;
      for (const [ratio, volume, duration] of [[1, .17, .61], [2.74, .024, .26]]) {
        const tone = this.context.createOscillator();
        const envelope = this.context.createGain();
        tone.type = "sine";
        tone.frequency.value = NOTES[index] * ratio;
        envelope.gain.setValueAtTime(.0001, time);
        envelope.gain.exponentialRampToValueAtTime(volume * strength, time + .012);
        envelope.gain.exponentialRampToValueAtTime(.0001, time + duration);
        tone.connect(envelope).connect(this.master);
        tone.start(time);
        tone.stop(time + duration + .018);
        tone.onended = () => { tone.disconnect(); envelope.disconnect(); };
      }
    }

    rainbow() {
      NOTES.forEach((_, index) => this.chime(index, .11 + index * .091, .78));
    }
  }

  globalThis.HongcangSound = Soundscape;
})();
