(() => {
  const { Weather, MINERALS, TAU, clamp, lerp, smooth, sparkle } = globalThis.HongcangWeather;
  const art = globalThis.hongcangArt;
  const images = new Map();
  const unravelAt = time => clamp((time - 2.5) / 3.5) ** .87;

  function loadImage(spec) {
    const [url, x, y, width, height] = spec;
    if (!images.has(url)) {
      const image = new Image();
      image.src = url;
      images.set(url, image.decode().then(() => ({ image, x, y, width, height })));
    }
    return images.get(url);
  }

  async function loadSet(specs) {
    return Object.fromEntries(await Promise.all(
      Object.entries(specs).map(async ([key, spec]) => [key, await loadImage(spec)]),
    ));
  }

  function strokeOutline([points, root, tip, [r, g, b, alpha]]) {
    const [x, y] = points[0];
    const left = [], right = [];
    for (let index = 0; index < points.length; index++) {
      const [px, py] = points[index];
      const before = points[Math.max(0, index - 1)];
      const after = points[Math.min(index + 1, points.length - 1)];
      const dx = after[0] - before[0], dy = after[1] - before[1];
      const radius = lerp(root, tip, index / (points.length - 1)) / 2;
      const normal = radius / (Math.hypot(dx, dy) || 1);
      left.push([px - x - dy * normal, py - y + dx * normal]);
      right.push([px - x + dy * normal, py - y - dx * normal]);
    }
    const path = new Path2D();
    path.moveTo(...left[0]);
    for (const point of left.slice(1)) path.lineTo(...point);
    for (const point of right.reverse()) path.lineTo(...point);
    path.closePath();
    return { path, x, y, alpha: alpha / 255, rgb: "rgb(" + r + "," + g + "," + b + ")" };
  }

  const strokes = art.bow.strokes.map(strokeOutline);

  class Painting {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: false });
      this.iceBuffer = document.createElement("canvas");
      this.rainbowBuffer = document.createElement("canvas");
      this.rainbowBuffer.width = 1440;
      this.rainbowBuffer.height = 558;
      this.layout = null;
    }

    async useLayout(portrait) {
      const layout = portrait ? art.portrait : art.wide;
      const [layers, bow] = await Promise.all([loadSet(layout.images), loadSet(art.bow.images)]);
      return { layout, layers, bow, portrait };
    }

    setLayout(config) {
      Object.assign(this, config);
      this.weather = new Weather(this.layout, this.portrait);
      this.iceBuffer.width = this.layout.width;
      this.iceBuffer.height = Math.ceil(this.layout.height - this.layout.waterline + 24);
      const skyTop = this.portrait ? .369 * this.layout.height : 151;
      this.bowScaleX = this.layout.width / 1440;
      this.bowScaleY = (this.layout.waterline - skyTop) / (558 - 151);
      this.bowOffsetY = skyTop - 151 * this.bowScaleY;
    }

    resize(width, height) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.max(1, Math.round(width * dpr));
      this.canvas.height = Math.max(1, Math.round(height * dpr));
      this.scaleX = width / this.layout.width;
      this.scaleY = height / this.layout.height;
    }

    draw(asset, alpha = 1, offsetX = 0, offsetY = 0) {
      if (alpha <= 0) return;
      this.ctx.globalAlpha = alpha;
      this.ctx.drawImage(asset.image, asset.x + offsetX, asset.y + offsetY, asset.width, asset.height);
      this.ctx.globalAlpha = 1;
    }

    backdrop(time) {
      const a = this.layers;
      if (time < 6) { this.draw(a.wet); return; }
      if (time < 7.2) {
        this.draw(a.wet);
        this.draw(a.snowLight, smooth(6, 7.2, time));
      } else if (time < 8.5) {
        this.draw(a.snowLight);
        this.draw(a.snowHalf, smooth(7.2, 8.5, time));
      } else if (time < 10) {
        this.draw(a.snowHalf);
        this.draw(a.snowDeep, smooth(8.5, 10, time));
      } else if (time < 12) {
        this.draw(a.snowDeep);
        const coverage = smooth(10, 12, time);
        this.freezeFromBanks(coverage);
      } else if (time < 13) {
        this.draw(a.partial);
        this.draw(a.ice, smooth(12, 13, time));
      } else {
        this.draw(a.ice);
      }
    }

    freezeFromBanks(coverage) {
      const { width, height, waterline, boat } = this.layout;
      const edge = Math.floor(waterline - 24);
      const mask = this.iceBuffer.getContext("2d");
      const bufferHeight = this.iceBuffer.height;
      const reach = 1 - coverage;
      mask.clearRect(0, 0, width, bufferHeight);
      mask.drawImage(this.layers.partial.image, 0, -edge);
      mask.save();
      mask.globalCompositeOperation = "destination-out";
      mask.translate(boat[0], boat[1] - edge + 10);
      mask.scale(width * lerp(.001, .95, reach), height * lerp(.002, .68, reach));
      const opening = mask.createRadialGradient(0, 0, .72, 0, 0, 1);
      opening.addColorStop(0, "#fff");
      opening.addColorStop(1, "rgba(255,255,255,0)");
      mask.fillStyle = opening;
      mask.fillRect(-1, -1, 2, 2);
      mask.restore();
      this.ctx.drawImage(this.iceBuffer, 0, edge);

      // Only the lake closes from the banks; the sky and mist grade together.
      const ctx = this.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, width, edge);
      ctx.clip();
      this.draw(this.layers.partial, coverage);
      ctx.restore();
    }

    cloudDrift(time) {
      if (time <= 6 || time >= 10) return;
      const t = smooth(6, 10, time);
      const { width, height } = this.layout;
      const ctx = this.ctx;
      const alpha = .093 * Math.sin(Math.PI * t);
      for (const [x, y, widthPart, thickness] of [[.33, .38, .34, .032], [.72, .32, .24, .042]]) {
        ctx.save();
        ctx.translate(x * width, (y - t * .15) * height);
        ctx.scale(widthPart * width, thickness * height);
        const vapor = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        vapor.addColorStop(0, "rgba(204,218,222," + alpha + ")");
        vapor.addColorStop(1, "rgba(204,218,222,0)");
        ctx.fillStyle = vapor;
        ctx.fillRect(-1, -1, 2, 2);
        ctx.restore();
      }
    }

    mapFlurry(x, y, anchored) {
      if (this.portrait && !anchored) {
        return [x * this.bowScaleX, (.22 + .32 * (y - 151) / (558 - 151)) * this.layout.height];
      }
      return [x * this.bowScaleX, y * this.bowScaleY + this.bowOffsetY];
    }

    arc(time) {
      if (time <= .6 || time >= 6) return;
      const [start, span] = art.bow.angles;
      const left = (Math.PI - start - span) / TAU;
      const right = (Math.PI - start) / TAU;
      const center = (left + right) / 2;
      const width = right - left;
      const show = smooth(.6, 2.2, time);
      const fray = unravelAt(time);
      const half = width * (1 - fray) / 2;
      const lo = time < 2.5 ? left - .025 : center - half - .009;
      const hi = time < 2.5 ? left + width * show + .009 : center + half + .009;
      const feather = Math.min((hi - lo) * .38, .011);
      const mask = this.rainbowBuffer.getContext("2d");
      const [cx, cy] = art.bow.geometry;
      mask.clearRect(0, 0, 1440, this.rainbowBuffer.height);
      const blend = smooth(2.59, 4.15, time);
      mask.save();
      if (typeof mask.createConicGradient !== "function") {
        mask.beginPath();
        mask.moveTo(cx, cy);
        mask.arc(cx, cy, 800, lo * TAU - Math.PI, hi * TAU - Math.PI);
        mask.closePath();
        mask.clip();
      }
      for (const [asset, alpha] of [[this.bow.rainbow, 1 - blend], [this.bow.frayed, blend]]) {
        if (!alpha) continue;
        mask.globalAlpha = alpha;
        mask.drawImage(asset.image, asset.x, asset.y, asset.width, asset.height);
      }
      mask.globalAlpha = 1;
      if (typeof mask.createConicGradient === "function") {
        const veil = mask.createConicGradient(-Math.PI, cx, cy);
        veil.addColorStop(0, "transparent");
        veil.addColorStop(lo, "transparent");
        veil.addColorStop(lo + feather, "#fff");
        veil.addColorStop(hi - feather, "#fff");
        veil.addColorStop(hi, "transparent");
        veil.addColorStop(1, "transparent");
        mask.globalCompositeOperation = "destination-in";
        mask.fillStyle = veil;
        mask.fillRect(0, 0, 1440, this.rainbowBuffer.height);
      }
      mask.restore();
      this.ctx.globalAlpha = 1 - smooth(5.03, 6, time);
      this.ctx.drawImage(this.rainbowBuffer, 0, this.bowOffsetY,
        1440 * this.bowScaleX, this.rainbowBuffer.height * this.bowScaleY);
      this.ctx.globalAlpha = 1;
    }

    reflectedFeet(time) {
      if (time <= .6 || time >= 4.33) return;
      const ctx = this.ctx;
      const { width, height } = this.layout;
      const recede = 1 - smooth(2.68, 4.33, time);
      for (const [side, start, end] of [[0, .83, 1.16], [1, 1.86, 2.23]]) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(side * width / 2, 0, width / 2, height);
        ctx.clip();
        this.draw(this.layers.waterRainbow, smooth(start, end, time) * recede);
        ctx.restore();
      }
    }

    strands(time) {
      if (time <= 2.5 || time >= 6.2) return;
      const ctx = this.ctx;
      const drift = time - 4.5;
      const [cx, cy] = art.bow.geometry;
      const [, span] = art.bow.angles;
      const peel = (unravelAt(time) - unravelAt(4.5)) * .37 * span;
      ctx.save();
      ctx.translate(0, this.bowOffsetY);
      ctx.scale(this.bowScaleX, this.bowScaleY);
      strokes.forEach(({ path, x, y, alpha, rgb }, index) => {
        const start = 2.51 + (index % 11) * .075;
        const show = smooth(start, start + .72, time);
        const fade = 1 - smooth(4.80 + (index % 5) * .095, 6.2, time);
        if (!show || !fade) return;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(x < cx ? peel : -peel);
        ctx.translate(x - cx + drift * (14 + index % 8), y - cy + drift * (9 + index % 7));
        ctx.rotate(drift * ((index % 9) - 4) * .013);
        const length = lerp(.27, 1, show);
        ctx.scale(length, length);
        ctx.globalAlpha = alpha * show * fade;
        ctx.fillStyle = rgb;
        ctx.fill(path);
        ctx.restore();
      });
      ctx.restore();
    }

    foreground(time, wind, gameTime, raised, reduced) {
      const ctx = this.ctx;
      const a = this.layers;
      const cold = smooth(6, 9.25, time);
      this.draw(a.bank, 1 - cold);
      this.draw(a.snowBank, cold);
      ctx.save();
      const sway = reduced ? 0 : wind * .00011 + Math.sin(gameTime * 2.6) * Math.min(.003, Math.abs(wind) * .00006);
      ctx.transform(1, 0, sway, 1, -this.layout.treeRoot * sway, 0);
      this.draw(a.trees);
      this.draw(a.frost, cold);
      ctx.restore();
      const freeze = smooth(10.64, 12.05, time);
      if (freeze < 1) this.draw(a.boat, 1 - freeze, 0, reduced ? 0 : Math.sin(time * 1.71) * .62 * (1 - freeze));
      if (raised < 1) this.draw(a.icedBoat, freeze * (1 - raised));
      if (raised) this.draw(a.raisedBoat, raised);
    }

    spot(light) {
      if (!light.present) return;
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(light.x, light.y);
      ctx.scale(light.rx, light.ry);
      const warmth = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      warmth.addColorStop(0, "rgba(255,232,205,.45)");
      warmth.addColorStop(.52, "rgba(255,232,205,.27)");
      warmth.addColorStop(.83, "rgba(255,232,205,.075)");
      warmth.addColorStop(1, "rgba(255,232,205,0)");
      ctx.fillStyle = warmth;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }

    effects(game) {
      const ctx = this.ctx;
      for (const crack of game.cracks) {
        const fade = 1 - smooth(.21, 3, crack.age);
        const drawn = game.reduced ? 1 : smooth(0, .16, crack.age);
        for (const branch of crack.branches) {
          const count = Math.max(1, Math.ceil((branch.length - 1) * drawn));
          for (let index = 0; index < count; index++) {
            const [x, y] = branch[index];
            const [xx, yy] = branch[index + 1];
            if (yy < this.layout.waterline - 1) continue;
            const taper = 1 - index / branch.length;
            ctx.lineWidth = .58 + .63 * taper;
            ctx.strokeStyle = "#9fb0b8";
            ctx.globalAlpha = .73 * fade * taper;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(xx, yy);
            ctx.stroke();
            ctx.strokeStyle = MINERALS[(index + crack.band) % 7][1];
            ctx.lineWidth = .57;
            ctx.globalAlpha = .14 * fade * taper;
            ctx.beginPath();
            ctx.moveTo(x, y - .7);
            ctx.lineTo(xx, yy - .7);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
      for (const star of game.stars) {
        const decay = 1 - smooth(0, .48, star.age);
        sparkle(ctx, star.x, star.y, star.radius * lerp(.67, 1.2, 1 - decay), decay, .31);
      }
      for (const fly of game.flights) {
        const t = clamp(fly.age / fly.duration);
        const arc = Math.sin(Math.PI * t) * fly.arc;
        this.weather.paintCrystal(ctx, this.weather.mineralSprites[fly.band],
          lerp(fly.x, fly.endX, t), lerp(fly.y, fly.endY, t) - arc, lerp(15, 8, t), fly.angle + 2.2 * t);
      }
    }

    render(time, game) {
      const layout = this.layout, ctx = this.ctx;
      ctx.setTransform(this.canvas.width / layout.width, 0, 0, this.canvas.height / layout.height, 0, 0);
      this.backdrop(time);
      this.cloudDrift(time);
      this.arc(time);
      this.reflectedFeet(time);
      this.draw(this.layers.iceRainbow, game.reunionReflection);
      this.foreground(time, game.wind, game.age, game.raised, game.reduced);
      if (time < 16) {
        this.weather.rainAt(ctx, time);
        this.weather.winterAt(ctx, time);
        this.strands(time);
        this.weather.coloredAt(ctx, time, art.bow, (x, y, anchored) => this.mapFlurry(x, y, anchored));
      } else {
        this.spot(game.light);
        this.weather.game(ctx);
        this.effects(game);
      }
    }
  }

  globalThis.HongcangPainting = Painting;
})();
