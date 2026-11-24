(() => {
  "use strict";

  const WIDTH = 1280, HEIGHT = 800, RESOLUTION = 2;
  const color = {
    blue: "#1D4ED8",
    headlineRed: "#E8502B",
    orange: "#E8502B",
    seal: "#A92D1B",
    yellow: "#F4D348",
    paleYellow: "#FFEB98",
    paper: "#F5F6F0",
    dot: "#DAE0E9",
    receipt: "#FFFEF5",
    ink: "#272423",
  };
  const chinese = '"Noto Sans SC", "Noto Sans CJK SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Heiti SC", sans-serif';
  const mono = '"Courier New", monospace';

  function setFont(ctx, weight, size, family = chinese) {
    ctx.font = `${weight} ${size}px ${family}`;
  }

  function text(ctx, message, x, y, options = {}) {
    const { size = 18, weight = 400, fill = color.ink, align = "left", maxWidth, family, outline = 0 } = options;
    const value = String(message ?? "");
    setFont(ctx, weight, size, family);
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = fill;
    if (outline) {
      ctx.lineWidth = outline;
      ctx.lineJoin = "round";
      ctx.strokeStyle = fill;
      if (maxWidth) ctx.strokeText(value, x, y, maxWidth);
      else ctx.strokeText(value, x, y);
    }
    if (maxWidth) ctx.fillText(value, x, y, maxWidth);
    else ctx.fillText(value, x, y);
  }

  function rect(ctx, x, y, w, h, fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  }

  function line(ctx, x1, y1, x2, y2, stroke, thickness = 1, dash = []) {
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash(dash);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = thickness;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  function angled(ctx, x, y, degrees, draw) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(degrees * Math.PI / 180);
    draw();
    ctx.restore();
  }

  function polygon(ctx, points, fill) {
    ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function dot(ctx, x, y, radius, fill) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function positionParts(value) {
    const percentage = n => typeof n === "number" ? `${Math.abs(n) <= 1 ? n * 100 : n}%` : String(n);
    if (Array.isArray(value)) return value.map(percentage);
    if (value && typeof value === "object") return [value.x ?? "50%", value.y ?? "50%"].map(percentage);
    const parts = (typeof value === "string" ? value.trim() : "").split(/\s+/).filter(Boolean);
    if (!parts.length) return ["50%", "50%"];
    if (parts.length === 1) return /^(top|bottom)$/i.test(parts[0]) ? ["50%", parts[0]] : [parts[0], "50%"];
    if (/^(top|bottom)$/i.test(parts[0]) || /^(left|right)$/i.test(parts[1])) return [parts[1], parts[0]];
    return parts;
  }

  function positionOffset(token, space, fallback = 0.5) {
    token = typeof token === "string" ? token.toLowerCase() : token;
    if (token === "left" || token === "top") return 0;
    if (token === "right" || token === "bottom") return space;
    if (token === "center") return space / 2;
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)%$/.test(token || "")) return space * parseFloat(token) / 100;
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)px$/.test(token || "")) return parseFloat(token);
    return space * fallback;
  }

  function drawCover(ctx, image, x, y, w, h, position, zoom = 1, origin) {
    const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
    if (!(iw > 0 && ih > 0)) return;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale, dh = ih * scale;
    const [xp, yp] = positionParts(position);
    const [ox, oy] = positionParts(origin || position);
    const dx = positionOffset(xp, w - dw);
    const dy = positionOffset(yp, h - dh);
    const zx = positionOffset(ox, w), zy = positionOffset(oy, h);
    const magnification = Math.max(1, Math.min(1.8, Number(zoom) || 1));
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.translate(x + zx, y + zy);
    ctx.scale(magnification, magnification);
    ctx.drawImage(image, dx - zx, dy - zy, dw, dh);
    ctx.restore();
  }

  function drawBackground(ctx) {
    rect(ctx, 0, 0, WIDTH, HEIGHT, color.paper);
    const tile = document.createElement("canvas");
    tile.width = tile.height = 10;
    const tileCtx = tile.getContext("2d");
    tileCtx.fillStyle = color.dot;
    tileCtx.fillRect(4, 4, 2, 2);
    const pattern = ctx.createPattern(tile, "repeat");
    if (pattern && typeof pattern.setTransform === "function") {
      pattern.setTransform(new DOMMatrix().scale(0.5));
      rect(ctx, 0, 0, WIDTH, 734, pattern);
    } else {
      ctx.fillStyle = color.dot;
      for (let y = 2; y < 734; y += 5) for (let x = 2; x < WIDTH; x += 5) ctx.fillRect(x, y, 1, 1);
    }
  }

  function drawMasthead(ctx) {
    text(ctx, "邪恶面剂子出没档案", 55, 53, { size: 18, weight: 800, fill: color.blue, outline: 0.35 });
    dot(ctx, 1138, 47, 3.2, color.orange);
    text(ctx, "仍在出没", 1225, 53, { size: 18, weight: 800, fill: color.blue, align: "right", outline: 0.35 });
    line(ctx, 56, 75, 1226, 75, color.blue, 2);

    text(ctx, "可爱", 49, 215, { size: 113, weight: 900, fill: color.blue, maxWidth: 231, outline: 2.2 });
    text(ctx, "通缉中", 49, 332, { size: 113, weight: 900, fill: color.headlineRed, maxWidth: 330, outline: 2.2 });
  }

  function drawPortrait(ctx, entry, image) {
    rect(ctx, 403, 123, 490, 570, color.yellow);
    rect(ctx, 416, 110, 490, 570, color.blue);
    drawCover(ctx, image, 426, 120, 470, 550, entry.pos, entry.zoom, entry.origin);
    angled(ctx, 441, 592, -2.8, () => {
      const name = String(entry.label || "邪恶面剂子");
      setFont(ctx, 900, 40);
      const w = Math.max(122, Math.min(422, Math.ceil(ctx.measureText(name).width + 31)));
      rect(ctx, 0, 0, w, 68, color.yellow);
      text(ctx, name, 16, 49, { size: 40, weight: 900, fill: "#103EB5", outline: 0.6, maxWidth: w - 32 });
    });
  }

  function drawWitness(ctx, image, entry) {
    angled(ctx, 53, 486, -6, () => {
      rect(ctx, 6, 7, 260, 218, "#1D4ED82B");
      rect(ctx, 0, 0, 260, 218, color.blue);
      rect(ctx, 2, 2, 256, 214, color.receipt);
      if (image) {
        drawCover(ctx, image, 10, 10, 240, 174, entry?.thumbPos || entry?.pos, entry?.thumbZoom ?? entry?.zoom, entry?.origin);
      } else {
        rect(ctx, 10, 10, 240, 174, "#EDEFEA");
        line(ctx, 32, 33, 228, 33, "#B6C5EC", 1, [3, 4]);
        line(ctx, 32, 158, 228, 158, "#B6C5EC", 1, [3, 4]);
        text(ctx, "目击影像待补", 130, 103, { size: 18, weight: 600, fill: "#5772A7", align: "center" });
      }
      text(ctx, "其他目击记录", 10, 205, { size: 16, weight: 800, fill: color.blue, outline: 0.27 });
    });
  }

  function drawBarcode(ctx, x, y, w, h, seedText) {
    let seed = 971531;
    for (const ch of String(seedText || "")) seed = (Math.imul(seed, 31) + ch.codePointAt(0)) >>> 0;
    function next() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed >>> 24;
    }
    let left = 0;
    while (left < w - 0.7) {
      const bar = [0.8, 1, 1.2, 1.65, 2.1, 3.1][next() % 6];
      rect(ctx, x + left, y, Math.min(bar, w - left), h, color.ink);
      left += bar + [0.85, 1.15, 2.2, 3.15][next() % 4];
    }
  }

  function drawReceipt(ctx, entry) {
    const rows = Array.isArray(entry.crimes) ? entry.crimes : [];
    const paperW = 282, paperH = 390;
    angled(ctx, 945, 142, 4.1, () => {
      ctx.save();
      ctx.shadowColor = "rgba(26, 29, 37, 0.22)";
      ctx.shadowBlur = 22;
      ctx.shadowOffsetX = 5;
      ctx.shadowOffsetY = 9;
      rect(ctx, 0, 0, paperW, paperH, color.receipt);
      ctx.restore();
      const edge = [[0, paperH - 2], [paperW, paperH - 2]];
      for (let x = paperW; x >= 0; x -= 6) edge.push([x, paperH + (Math.round(x / 6) % 2 ? 2 : 8)]);
      polygon(ctx, edge, color.receipt);
      for (let y = 1.5; y < paperH; y += 3.2) line(ctx, 0, y, paperW, y, "#F1ECE0", 0.66);
      text(ctx, "可爱罪证", 19, 61, { size: 35, weight: 900, outline: 0.6 });
      text(ctx, "目击小票", 20, 85, { size: 15 });
      line(ctx, 20, 103, 263, 103, "#817568", 1.9, [6, 4]);
      const shownRows = rows.length <= 6 ? rows : [...rows.slice(0, 5), { text: `其余 ${rows.length - 5} 项`, count: "…" }];
      const interval = Math.min(36, 137 / Math.max(1, shownRows.length - 1));
      const fontSize = shownRows.length > 4 ? 16 : 18;
      shownRows.forEach((row, i) => {
        const name = typeof row === "string" ? row : row?.text;
        const count = typeof row === "string" ? 1 : row?.count ?? 1;
        const baseline = 138 + i * interval;
        text(ctx, name, 20, baseline, { size: fontSize, maxWidth: 196 });
        text(ctx, count === "…" ? count : `×${count}`, 262, baseline, { size: 17, weight: 700, align: "right", family: mono });
      });
      line(ctx, 20, 271, 263, 271, "#817568", 1.9, [6, 4]);
      text(ctx, "合计", 20, 308, { size: 16 });
      text(ctx, entry.total ?? rows.reduce((sum, row) => sum + (Number(row?.count) || 1), 0), 260, 309, { size: 23, weight: 900, align: "right", maxWidth: 183, outline: 0.38 });
      drawBarcode(ctx, 33, 331, 214, 31, [entry.title, ...rows.map(row => row?.text || row)].join("/"));
    });
    angled(ctx, 1035, 145, -4.4, () => {
      polygon(ctx, [[0, 0], [102, 0], [99, 7], [102, 16], [99, 22], [1, 21], [4, 15], [2, 7]], "#F4E084");
      for (let y = 3; y <= 19; y += 3) line(ctx, 5, y, 98, y, "#F4DA75", 0.55);
    });
  }

  function drawSeal(ctx, label) {
    angled(ctx, 942, 582, -4, () => {
      ctx.save();
      ctx.strokeStyle = "#1D4ED877";
      ctx.lineWidth = 1.75;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(0, 0, 269, 119);
      ctx.restore();
    });
    angled(ctx, 968, 605, -7, () => {
      rect(ctx, 4, 4, 216, 80, color.orange);
      rect(ctx, 0, 0, 216, 80, "#B6321B");
      rect(ctx, 4, 4, 208, 72, color.paleYellow);
      text(ctx, "盖章", 108, 27, { size: 14, fill: color.seal, align: "center" });
      text(ctx, label || "可爱成立", 108, 60, { size: 31, weight: 900, fill: color.seal, align: "center", maxWidth: 187, outline: 0.45 });
    });
  }

  function normalizeStamp(stamp) {
    return stamp && typeof stamp === "object" ? stamp : { text: String(stamp ?? "") };
  }

  function drawStamps(ctx, stamps) {
    const slots = [[19, 15, -9], [80, 17, 8], [79, 82, -8], [20, 77, 7], [50, 67, -4]];
    ctx.save();
    ctx.beginPath();
    ctx.rect(426, 120, 470, 550);
    ctx.clip();
    stamps.map(normalizeStamp).filter(stamp => stamp.text).slice(-slots.length).forEach((stamp, i) => {
      const [fallbackX, fallbackY, fallbackAngle] = slots[i];
      const x = Number.isFinite(stamp.x) ? stamp.x : fallbackX;
      const y = Number.isFinite(stamp.y) ? stamp.y : fallbackY;
      const angle = Number.isFinite(stamp.angle) ? stamp.angle : fallbackAngle;
      const fill = stamp.color === "blue" || stamp.color === "cobalt" ? color.blue
        : (typeof stamp.color === "string" && typeof CSS !== "undefined" && CSS.supports("color", stamp.color) ? stamp.color : color.headlineRed);
      angled(ctx, 426 + x * 4.7, 120 + y * 5.5, angle, () => {
        const label = String(stamp.text);
        setFont(ctx, 900, 24);
        const w = Math.min(164, Math.max(92, Math.ceil(ctx.measureText(label).width + 24)));
        const left = -w / 2;
        rect(ctx, left, -20, w, 41, "rgba(255, 244, 226, 0.31)");
        ctx.globalAlpha = 0.91;
        ctx.strokeStyle = fill;
        ctx.lineWidth = 2;
        ctx.strokeRect(left + 1.25, -18.75, w - 2.5, 38.5);
        ctx.lineWidth = 0.8;
        ctx.strokeRect(left + 4, -16, w - 8, 33);
        text(ctx, label, 0, 9, { size: 24, weight: 900, fill, align: "center", maxWidth: w - 16, outline: 0.45 });
      });
    });
    ctx.restore();
  }

  function drawFooter(ctx, status) {
    rect(ctx, 0, 734, 1280, 66, color.blue);
    text(ctx, "可爱通缉令", 56, 775, { size: 19, weight: 900, fill: "#FFFDF2", outline: 0.35 });
    text(ctx, `最后目击：${status || "正在看镜头"}`, 1225, 775, { size: 19, weight: 900, fill: "#FFFDF2", align: "right", maxWidth: 492, outline: 0.35 });
  }

  function readableImage(source) {
    return source && ((source.naturalWidth > 0 && source.naturalHeight > 0) ||
      (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap && source.width > 0));
  }

  async function decodeImage(candidate) {
    if (!candidate) return null;
    if (readableImage(candidate)) return candidate;
    const image = typeof candidate === "string" ? new Image() : candidate;
    if (typeof candidate === "string") image.src = candidate;
    if (typeof image.decode !== "function") return null;
    try {
      await image.decode();
      return readableImage(image) ? image : null;
    } catch {
      return readableImage(image) ? image : null;
    }
  }

  function witnessSource(candidate) {
    // File-origin images may load but taint Canvas; packaged data URIs do not.
    const candidates = [candidate?.exportThumb, candidate?.thumb, candidate?.exportSrc, candidate?.src];
    return candidates.find(source => typeof source === "string" && source &&
      (location.protocol !== "file:" || /^(data:|blob:)/i.test(source)));
  }

  async function exportWantedPoster({ entry = {}, image, stamps = [], witness, witnessEntry } = {}) {
    const explicitWitnessSource = typeof witness === "string" ? witness : witness?.currentSrc || witness?.src;
    const mayDrawExplicit = location.protocol !== "file:" || !explicitWitnessSource || /^(data:|blob:)/i.test(explicitWitnessSource);
    const [portrait, explicitWitness] = await Promise.all([
      decodeImage(image || entry.exportSrc || entry.src),
      decodeImage(mayDrawExplicit ? witness : null),
      document.fonts?.ready ?? Promise.resolve(),
    ]);
    if (!portrait) throw new Error("主图尚未加载，暂时无法导出海报。");
    const witnessCandidate = witnessEntry || (witness && typeof witness === "object" && !(witness instanceof Element) ? witness : null);
    const witnessPhoto = explicitWitness || await decodeImage(witnessSource(witnessCandidate));
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH * RESOLUTION;
    canvas.height = HEIGHT * RESOLUTION;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("浏览器无法生成海报画布。");
    ctx.scale(RESOLUTION, RESOLUTION);
    if ("lang" in ctx) ctx.lang = "zh-CN";
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    drawBackground(ctx);
    drawMasthead(ctx);
    drawWitness(ctx, witnessPhoto, witnessCandidate);
    drawPortrait(ctx, entry, portrait);
    drawStamps(ctx, Array.isArray(stamps) ? stamps : []);
    drawReceipt(ctx, entry);
    drawSeal(ctx, entry.stamp);
    drawFooter(ctx, entry.status || entry.sighting || entry.title);
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob(
          blob => blob ? resolve(blob) : reject(new Error("海报未生成，请重试。")),
          "image/png"
        );
      } catch {
        reject(new Error("浏览器不允许从当前照片来源导出。请使用本地照片，再试一次。"));
      }
    });
  }

  window.exportWantedPoster = exportWantedPoster;
})();
