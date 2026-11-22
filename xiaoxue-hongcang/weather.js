(() => {
  const MINERALS = [
    ["朱", "#c8553d"], ["赭", "#d98b4a"], ["藤黄", "#e1b84f"], ["石绿", "#7fa88a"],
    ["石青", "#4f7fa3"], ["靛", "#3e4f7a"], ["紫", "#7d6a9b"],
  ];
  const TAU = Math.PI * 2;
  const SNOW_BOTTOM = .895;
  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
  const lerp = (a, b, amount) => a + (b - a) * amount;
  const smooth = (a, b, value) => {
    const t = clamp((value - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const wrap = (value, size) => ((value % size) + size) % size;

  function randomSource(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let bits = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      bits ^= bits + Math.imul(bits ^ (bits >>> 7), 61 | bits);
      return ((bits ^ (bits >>> 14)) >>> 0) / 4294967296;
    };
  }

  function crystalSprite(ink, colored = false, band = 0) {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.translate(size / 2, size / 2);
    const pigment = ctx.createRadialGradient(0, 0, 1, 0, 0, 29);
    pigment.addColorStop(0, ink);
    pigment.addColorStop(1, "transparent");
    ctx.fillStyle = pigment;
    ctx.globalAlpha = .19;
    ctx.fillRect(-32, -32, 64, 64);
    ctx.globalAlpha = 1;
    const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, 31);
    halo.addColorStop(0, "rgba(255,255,252,.52)");
    halo.addColorStop(.62, "rgba(255,250,239,.13)");
    halo.addColorStop(1, "rgba(255,250,239,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(-32, -32, 64, 64);
    ctx.lineCap = "round";
    for (let arm = 0; arm < 6; arm++) {
      ctx.save();
      ctx.rotate(arm * TAU / 6);
      if (colored) {
        ctx.strokeStyle = MINERALS[(band + 1 + (arm % 3)) % 7][1];
        ctx.lineWidth = 2.8;
        ctx.globalAlpha = .46;
        ctx.beginPath();
        ctx.moveTo(4, 2.2);
        ctx.lineTo(20, 2.2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3.0;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(22, 0);
      ctx.stroke();
      ctx.lineWidth = 2.15;
      ctx.beginPath();
      ctx.moveTo(17, -7);
      ctx.lineTo(11, 0);
      ctx.lineTo(17, 7);
      ctx.moveTo(21, -4.2);
      ctx.lineTo(17, 0);
      ctx.lineTo(21, 4.2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = "#fffefa";
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, TAU);
    ctx.fill();
    return canvas;
  }

  function sparkle(ctx, x, y, radius, alpha, angle = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;
    ctx.lineWidth = .7;
    ctx.strokeStyle = "#fffdf2";
    ctx.shadowColor = "rgba(190,142,89,.65)";
    ctx.shadowBlur = 2;
    ctx.beginPath();
    for (let arm = 0; arm < 6; arm++) {
      const a = arm * TAU / 6;
      const reach = radius * (arm % 3 === 0 ? 1 : .67);
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * reach, Math.sin(a) * reach);
    }
    ctx.stroke();
    ctx.restore();
  }

  class Weather {
    constructor(layout, portrait) {
      this.layout = layout;
      this.portrait = portrait;
      this.grain = portrait ? 1.13 : 1;
      const random = randomSource(portrait ? 2308 : 2305);
      const { width, height } = layout;
      this.rain = Array.from({ length: portrait ? 270 : 479 }, () => ({
        x: random() * (width + 75), y: random() * height * .84, rate: 93 + random() * 125,
        length: 6.2 + random() * 14.5,
      }));
      this.snow = [];
      const firstGroup = [[-.049, -.003], [-.015, -.051], [.027, .007], [-.021, .046], [.044, -.026]];
      const anchor = portrait ? [.53, .368] : [.5764, .3622];
      const count = portrait ? 132 : 126;
      for (const offset of firstGroup) {
        this.snow.push(this.flake(random, (anchor[0] + offset[0]) * width, (anchor[1] + offset[1]) * height));
      }
      while (this.snow.length < count) {
        const x = (random() * .976 + .012) * width;
        const y = (.059 + random() * .827) * height;
        if (this.reserved(x, y)) continue;
        if (this.snow.some(flake => (flake.x - x) ** 2 + (flake.y - y) ** 2 < 13 ** 2)) continue;
        this.snow.push(this.flake(random, x, y));
      }
      this.mineralSprites = MINERALS.map(([, color], index) => crystalSprite(color, true, index));
      this.introSprites = new Map();
      this.time = 0;
    }

    setScale(x, y) {
      const scale = Math.min(x, y);
      this.snowScale = this.portrait ? clamp(.76 / scale, 1, 2.6) : 1;
      this.revealScale = this.portrait ? clamp(.95 / scale, 1, 3.3) : 1;
    }

    reserved(x, y) {
      const { width, height } = this.layout;
      if (y < .11 * height && x < .19 * width) return true;
      return this.portrait
        ? x > .31 * width && x < .70 * width && y < .331 * height
        : x > .742 * width && x < .948 * width && y > .08 * height && y < .454 * height;
    }

    flake(random, x, y) {
      const depth = .58 * random() + .42 * y / this.layout.height;
      return {
        x, y, startX: x, startY: y, band: this.snow.length % 7, alpha: 0,
        diameter: (2 + 4 * depth ** 1.19) * this.grain, revealed: 10 + depth * 6,
        fall: (7 + 14 * depth) * this.grain, drift: 1.8 + 6.7 * random(),
        phase: random() * TAU,
      };
    }

    rainAt(ctx, time) {
      const strength = 1 - smooth(2.5, 4.95, time);
      if (!strength) return;
      const shorten = 1 - .67 * smooth(2.5, 4.65, time);
      const { width, height } = this.layout;
      const range = height * .85;
      ctx.save();
      ctx.strokeStyle = "#9aa3a6";
      ctx.lineWidth = 1 * this.grain;
      ctx.globalAlpha = .30 * strength;
      ctx.beginPath();
      for (const drop of this.rain) {
        const y = 9 + wrap(drop.y + time * drop.rate * (.56 + .44 * shorten), range);
        const x = -35 + wrap(drop.x - time * drop.rate * .27, width + 75);
        const length = drop.length * shorten * this.grain;
        ctx.moveTo(x, y);
        ctx.lineTo(x - length * .29, y + length);
      }
      ctx.stroke();
      ctx.restore();
    }

    whiteDrops(ctx, flakes) {
      if (!flakes.length) return;
      ctx.save();
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "rgba(184,194,199,.4)";
      ctx.lineWidth = this.grain * this.snowScale;
      ctx.beginPath();
      for (const [x, y, diameter] of flakes) {
        ctx.moveTo(x + diameter / 2, y);
        ctx.arc(x, y, diameter / 2, 0, TAU);
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    winterAt(ctx, time) {
      const alpha = smooth(5.55, 7.9, time);
      if (!alpha) return;
      const { width, height } = this.layout;
      const flakes = [];
      // At the handoff, the film and the interactive snow share the same positions.
      const elapsed = time - 16;
      for (const seed of this.snow) {
        const sway = (Math.sin(seed.phase + elapsed * .48) - Math.sin(seed.phase)) * 8;
        const x = wrap(seed.startX + sway, width);
        const y = wrap(seed.startY + elapsed * seed.fall * .53, height * SNOW_BOTTOM);
        if (this.reserved(x, y)) continue;
        flakes.push([x, y, seed.diameter * this.snowScale]);
      }
      ctx.save();
      ctx.globalAlpha = alpha;
      this.whiteDrops(ctx, flakes);
      ctx.restore();
    }

    coloredAt(ctx, time, bow, map) {
      if (time < 2.58 || time >= 10) return;
      const { height, waterline } = this.layout;
      const whitening = smooth(5.25, 6, time);
      bow.snow.forEach(([x, y, diameter, angle, pigment, strength], index) => {
        const show = smooth(2.58 + (index % 7) * .22, 4.12 + (index % 7) * .055, time);
        const retireAt = 7.15 + (index % 9) * .24;
        const alpha = show * (1 - smooth(retireAt, retireAt + .8, time)) * strength / 255;
        if (!alpha) return;
        const delta = time - 4.5;
        const side = Math.sin(index * 1.27);
        const px = x + delta * (12 + side * 25) + 6 * Math.sin(delta + index) * Math.abs(delta);
        const py = y + delta * (15 + (index % 9) * 3.9);
        const [xx, yy] = map(px, py, index < 7);
        const descent = smooth(height * .13, waterline - height * .02, yy);
        const tint = 1 - descent * whitening;
        const shade = Math.round(tint * 8) / 8;
        const key = pigment.join(",") + ":" + shade;
        if (!this.introSprites.has(key)) {
          const ink = [242, 246, 245].map((base, i) => Math.round(lerp(base, pigment[i], shade)));
          this.introSprites.set(key, crystalSprite("rgb(" + ink.join(",") + ")"));
        }
        const size = diameter * lerp(.56, 1, tint) * this.snowScale;
        ctx.globalAlpha = alpha;
        this.paintCrystal(ctx, this.introSprites.get(key), xx, yy, size, angle + delta * side * .32);
      });
      ctx.globalAlpha = 1;
    }

    reset() {
      this.time = 0;
      for (const seed of this.snow) {
        seed.x = seed.startX;
        seed.y = seed.startY;
        seed.alpha = 0;
        seed.visible = !this.reserved(seed.x, seed.y);
        seed.inside = false;
      }
    }

    release(seed) {
      const { width, height } = this.layout;
      seed.x = wrap(seed.x + (.37 + .027 * seed.band) * width, width);
      seed.y = height * (.029 + seed.band * .008);
      seed.alpha = 0;
      seed.inside = false;
      seed.visible = !this.reserved(seed.x, seed.y);
    }

    update(dt, light, wind, reduced) {
      const { width, height } = this.layout;
      if (!reduced) this.time += dt;
      const caught = [];
      for (const seed of this.snow) {
        if (!reduced && dt > 0) {
          seed.x = wrap(seed.x + dt * (wind + Math.sin(seed.phase + this.time * .87) * seed.drift), width);
          seed.y = wrap(seed.y + dt * seed.fall, height * SNOW_BOTTOM);
        }
        seed.visible = !this.reserved(seed.x, seed.y);
        seed.inside = false;
        if (!light.present || !seed.visible) continue;
        const distance = Math.hypot((seed.x - light.x) / light.rx, (seed.y - light.y) / light.ry);
        if (distance < 1) caught.push([distance, seed]);
      }
      caught.sort((a, b) => a[0] - b[0]);
      caught.slice(0, 6).forEach(([, seed]) => { seed.inside = true; });
      for (const seed of this.snow) {
        if (reduced) seed.alpha = Number(seed.inside);
        else seed.alpha = clamp(seed.alpha + (seed.inside ? dt / .12 : -dt / .6));
      }
    }

    paintCrystal(ctx, sprite, x, y, diameter, rotation) {
      const span = diameter * 64 / 44;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.drawImage(sprite, -span / 2, -span / 2, span, span);
      ctx.restore();
    }

    game(ctx) {
      const ordinary = [];
      for (const seed of this.snow) {
        if (!seed.visible) continue;
        if (seed.alpha < .035) {
          ordinary.push([seed.x, seed.y, seed.diameter * this.snowScale]);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = seed.alpha;
        const size = seed.revealed * this.revealScale;
        this.paintCrystal(ctx, this.mineralSprites[seed.band], seed.x, seed.y, size, seed.phase + this.time * .20);
        sparkle(ctx, seed.x + .69 * size, seed.y - .57 * size, 3.7 * this.grain * this.snowScale, seed.alpha, .25);
        ctx.restore();
      }
      this.whiteDrops(ctx, ordinary);
    }

    hit(x, y, xScale, yScale, touch) {
      let result = null;
      let nearest = touch ? 22 : 11;
      for (const seed of this.snow) {
        if (!seed.visible || (!seed.inside && seed.alpha < .27)) continue;
        const distance = Math.hypot((seed.x - x) * xScale, (seed.y - y) * yScale);
        if (distance < nearest) {
          nearest = distance;
          result = seed;
        }
      }
      return result;
    }
  }

  globalThis.HongcangWeather = { Weather, MINERALS, TAU, clamp, lerp, smooth, randomSource, sparkle };
})();
