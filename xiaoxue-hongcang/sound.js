(() => {
  const NOTES = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];
  const VOLUME = .56;
  const SILENCE = .0001;

  class Soundscape {
    enabled = true;
    context = null;
    visible = true;
    acknowledged = false;
    nextDrop = 0;
    nextGust = 0;

    toggle() {
      this.enabled = !this.enabled;
      if (!this.enabled) this.acknowledged = false;
      this.updateVolume();
      return this.enabled;
    }

    updateVolume() {
      if (this.context) this.master.gain.setTargetAtTime(
        this.enabled && this.visible ? VOLUME : 0, this.context.currentTime, .034,
      );
    }

    async play(fromGesture) {
      if (!this.enabled) return;
      if (!this.context) this.create();
      if (!fromGesture) return;
      // Resume directly within the trusted gesture, before any asynchronous work.
      if (this.context.state !== "running") await this.context.resume();
      if (this.enabled && !this.acknowledged && this.context.state === "running") {
        this.acknowledged = true;
        this.chime(0, .012, .52);
      }
    }

    create() {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      const context = new Context();
      this.master = context.createGain();
      this.master.gain.value = this.visible ? VOLUME : 0;
      this.master.connect(context.destination);
      this.context = context;
    }

    voice(frequency, time, { volume, duration, attack = .02, glide = 1 }) {
      const tone = this.context.createOscillator();
      const envelope = this.context.createGain();
      tone.type = "sine";
      tone.frequency.setValueAtTime(frequency, time);
      tone.frequency.exponentialRampToValueAtTime(frequency * glide, time + duration);
      envelope.gain.setValueAtTime(SILENCE, time);
      envelope.gain.exponentialRampToValueAtTime(volume, time + attack);
      envelope.gain.exponentialRampToValueAtTime(SILENCE, time + duration);
      tone.connect(envelope).connect(this.master);
      tone.start(time);
      tone.stop(time + duration + .015);
      tone.onended = () => { tone.disconnect(); envelope.disconnect(); };
    }

    weather(film, visible = true) {
      if (this.visible !== visible) {
        this.visible = visible;
        this.updateVolume();
      }
      if (!visible || !this.enabled || this.context?.state !== "running") return;
      const { smooth } = globalThis.HongcangWeather;
      const now = this.context.currentTime;
      const rain = 1 - smooth(2.65, 5.4, film);
      if (rain > .035 && now >= this.nextDrop) {
        this.nextDrop = now + .10 + Math.random() * .29;
        const frequency = 570 + Math.random() * 580;
        const volume = rain * (.018 + Math.random() * .024);
        this.voice(frequency, now + .012, { volume, duration: .09, attack: .006, glide: .81 });
        this.voice(frequency * 1.67, now + .012, { volume: volume * .24, duration: .056, attack: .004, glide: .92 });
      }
      const wind = smooth(4.1, 6.9, film) * (1 - smooth(9.5, 13, film));
      if (wind > .035 && now >= this.nextGust) {
        this.nextGust = now + 1.65 + Math.random() * 1.15;
        const volume = wind * .039;
        this.voice(196, now + .02, { volume, duration: 1.65, attack: .40, glide: .97 });
        this.voice(293.66, now + .13, { volume: volume * .48, duration: 1.35, attack: .52, glide: .97 });
      }
    }

    chime(index, offset = 0, strength = 1) {
      if (!this.enabled || !this.visible || this.context?.state !== "running") return;
      const time = this.context.currentTime + offset;
      const note = NOTES[index];
      this.voice(note, time, { volume: .132 * strength, duration: .75, attack: .024 });
      this.voice(note * 2.012, time, { volume: .021 * strength, duration: .31, attack: .016 });
    }

    rainbow() {
      NOTES.forEach((_, index) => this.chime(index, .07 + index * .118, .72));
    }
  }

  globalThis.HongcangSound = Soundscape;
})();
