(() => {
  const { MINERALS, TAU, clamp, lerp, smooth, randomSource } = globalThis.HongcangWeather;
  const FILM_END = 16;
  const scene = document.getElementById("scene");
  const lake = document.getElementById("lake");
  const skip = document.getElementById("skip");
  const soundButton = document.getElementById("sound");
  const replay = document.getElementById("replay");
  const colophon = document.getElementById("colophon");
  const seal = document.getElementById("seal");
  const legend = document.getElementById("legend");
  const hint = document.getElementById("hint");
  const tray = document.getElementById("tray");
  const announcement = document.getElementById("announcement");
  const captions = [...document.querySelectorAll(".caption")];
  const ending = document.getElementById("ending");
  const endWords = "待春而见", springWords = "春在心间";
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const painting = new globalThis.HongcangPainting(document.getElementById("painting"));
  const sound = new globalThis.HongcangSound();
  const random = randomSource(90027);
  const capture = new URLSearchParams(location.search).has("qa");

  function glyphs(element, text = element.textContent) {
    if (element.getAttribute("aria-label") !== text) element.setAttribute("aria-label", text);
    const spans = Array.from(text.replaceAll(" ", ""), char => {
      const cell = document.createElement("span");
      cell.className = "glyph";
      cell.setAttribute("aria-hidden", "true");
      cell.textContent = char;
      return cell;
    });
    element.replaceChildren(...spans);
    return spans;
  }

  const title = glyphs(document.getElementById("title"));
  const date = glyphs(document.getElementById("date"));
  const verse = glyphs(document.getElementById("verse"));
  let last = glyphs(ending, endWords);
  const wells = MINERALS.map(([name, color]) => {
    const well = document.createElement("li");
    well.style.setProperty("--mineral", color);
    well.setAttribute("aria-label", name + "，未收集");
    well.dataset.collected = "false";
    tray.append(well);
    return well;
  });

  const game = {
    age: 0, wind: 0, raised: 0, reunionReflection: 0, reunionAt: null, returning: false,
    reduced: motion.matches, cracks: [], flights: [], stars: [], collected: new Set(),
    pending: new Set(), light: { present: false, x: 0, y: 0, rx: 90, ry: 90 },
  };
  let film = 0;
  let playing = false;
  let ready = false;
  let rect, pointer = null, target = null, touchLinger = 0;
  let animation = 0, previous = null, held = capture;
  let requestedLayout = null, layoutRevision = 0;

  function faded(element, alpha, blur = 0) {
    const value = String(Math.round(alpha * 1000) / 1000);
    if (element.style.opacity !== value) element.style.opacity = value;
    const filter = blur ? "blur(" + blur.toFixed(2) + "px)" : "";
    if (element.style.filter !== filter) element.style.filter = filter;
  }

  function accessible(element, show) {
    const hidden = show ? "false" : "true";
    if (element.getAttribute("aria-hidden") !== hidden) element.setAttribute("aria-hidden", hidden);
  }

  function captionsAt(time) {
    const entries = [[2, 6], [6, 10], [10, 13]];
    captions.forEach((caption, index) => {
      const [begin, end] = entries[index];
      const alpha = smooth(begin, begin + .8, time) * (1 - smooth(end, end + .8, time));
      faded(caption, alpha, alpha > 0 && alpha < 1 ? 3.1 * (1 - alpha) : 0);
      accessible(caption, alpha >= .5);
    });
  }

  function letteringAt(time) {
    captionsAt(time);
    const present = time >= 13;
    faded(colophon, Number(present));
    accessible(colophon, present);
    if (present) {
      title.forEach((glyph, index) => {
        const start = 13 + index * .38;
        const alpha = smooth(start, start + .60, time);
        faded(glyph, alpha, 4.8 * (1 - alpha));
      });
      for (const [group, start, step] of [[date, 13.64, .030], [verse, 14.02, .098], [last, 14.50, .094]]) {
        group.forEach((glyph, index) => {
          const begin = start + index * step;
          const alpha = smooth(begin, begin + .45, time);
          faded(glyph, alpha, 2.7 * (1 - alpha));
        });
      }
      faded(seal, smooth(15.2, 15.54, time));
    }
    for (const [element, start, complete] of [[legend, 13.18, 14.88], [tray, 14.88, 16], [hint, 15.29, 16]]) {
      const value = smooth(start, complete, time);
      faded(element, value);
      accessible(element, value >= .5);
    }
  }

  function announce(message) {
    announcement.textContent = message;
  }

  function refill() {
    game.pending.clear();
    game.collected.clear();
    wells.forEach((well, index) => {
      well.dataset.collected = "false";
      well.setAttribute("aria-label", MINERALS[index][0] + "，未收集");
    });
  }

  function setEnding(text) {
    if (ending.getAttribute("aria-label") !== text) last = glyphs(ending, text);
  }

  function resetGame() {
    game.age = 0;
    game.wind = 0;
    game.raised = 0;
    game.reunionAt = null;
    game.returning = false;
    game.reunionReflection = 0;
    game.cracks = [];
    game.flights = [];
    game.stars = [];
    game.light.present = false;
    target = null;
    pointer = null;
    touchLinger = 0;
    scene.dataset.lit = "false";
    refill();
    setEnding(endWords);
    painting.weather?.reset();
  }

  function enterPlay(focus = false) {
    film = FILM_END;
    if (!playing) {
      playing = true;
      scene.dataset.mode = "play";
      skip.hidden = true;
      lake.tabIndex = 0;
      accessible(lake, true);
      painting.weather?.reset();
      announce("雪湖，移过暖光，收集雪中的七色。");
    }
    if (focus) {
      lake.focus({ preventScroll: true });
      if (lake.matches(":focus-visible") && !target && painting.layout) {
        const { width, height } = painting.layout;
        placeLight(width * .56, height * .37, true);
      }
    }
    requestFrame();
  }

  function start() {
    if (!ready) return;
    resetGame();
    previous = null;
    if (game.reduced) {
      enterPlay();
    } else {
      playing = false;
      film = 0;
      scene.dataset.mode = "film";
      skip.hidden = false;
      lake.tabIndex = -1;
      accessible(lake, false);
    }
    requestFrame();
  }

  function finishBand(band) {
    game.pending.delete(band);
    if (game.collected.has(band)) return;
    game.collected.add(band);
    wells[band].dataset.collected = "true";
    wells[band].setAttribute("aria-label", MINERALS[band][0] + "，已收集");
    sound.chime(band);
    if (game.collected.size === MINERALS.length) {
      game.reunionAt = game.age;
      game.returning = false;
      setEnding(springWords);
      announce("七色归来，春在心间。");
      sound.rainbow();
    } else {
      announce("已收集" + MINERALS[band][0] + "，共" + game.collected.size + "色。");
    }
  }

  function collect(flake) {
    const { x, y, band, phase } = flake;
    if (game.reunionAt !== null || game.pending.has(band) || game.collected.has(band)) {
      game.stars.push({ x, y, age: 0, radius: 7 });
      return;
    }
    painting.weather.release(flake);
    if (game.reduced) {
      finishBand(band);
      return;
    }
    const well = wells[band].getBoundingClientRect();
    const end = fromClient(well.left + well.width / 2, well.top + well.height / 2);
    game.pending.add(band);
    game.flights.push({
      x, y, endX: end.x, endY: end.y, band, age: 0,
      arc: 34 + band * 3, angle: phase, duration: .53,
    });
  }

  function tapIce(x, y) {
    const { width, height, waterline, treeRoot } = painting.layout;
    if (y < waterline || y > height * .93 || (x < width * .235 && y > treeRoot - 23)) return;
    const count = 3 + Math.floor(random() * 4);
    const rotate = random() * TAU;
    const scale = painting.portrait ? .86 : 1;
    const branches = Array.from({ length: count }, (_, index) => {
      const direction = rotate + index * TAU / count + (random() - .5) * .44;
      const length = (40 + random() * 80) * scale;
      const points = [[x, y]];
      for (let step = 1; step <= 7; step++) {
        const [px, py] = points[step - 1];
        const bend = direction + (random() - .5) * .74;
        const stride = length / 7;
        points.push([px + Math.cos(bend) * stride, py + Math.sin(bend) * stride]);
      }
      return points;
    });
    game.cracks.push({ branches, band: Math.floor(random() * 7), age: game.reduced ? .17 : .001 });
  }

  function advanceGame(dt) {
    game.age += dt;
    if (touchLinger && game.age >= touchLinger) {
      touchLinger = 0;
      target = null;
      game.light.present = false;
    }
    if (target) {
      const travel = game.reduced ? 1 : 1 - Math.exp(-dt / .043);
      game.light.x = lerp(game.light.x, target.x, travel);
      game.light.y = lerp(game.light.y, target.y, travel);
    }
    game.wind *= Math.exp(-dt / .34);
    painting.weather.update(dt, game.light, game.wind, game.reduced);
    for (const crack of game.cracks) crack.age += dt;
    game.cracks = game.cracks.filter(crack => crack.age < 3);
    for (const star of game.stars) star.age += dt;
    game.stars = game.stars.filter(star => star.age < .48);
    game.flights = game.flights.filter(flight => {
      flight.age += dt;
      if (flight.age < flight.duration) return true;
      game.stars.push({ x: flight.endX, y: flight.endY, age: 0, radius: 10 });
      finishBand(flight.band);
      return false;
    });
    if (game.reunionAt !== null) {
      const age = game.age - game.reunionAt;
      game.reunionReflection = game.reduced
        ? Number(age < 8) : smooth(0, 2, age) * (1 - smooth(8, 9.05, age));
      game.raised = game.reduced
        ? Number(age < 8) : smooth(0, .61, age) * (1 - smooth(8, 8.65, age));
      if (age >= 8 && !game.returning) {
        game.returning = true;
        refill();
        setEnding(endWords);
        announce("虹藏于雪，可以重新收集七色。");
      }
      if (age >= 9.05 || (game.reduced && age >= 8)) game.reunionAt = null;
    }
  }

  function draw() {
    painting.render(film, game);
    letteringAt(film);
    sound.weather(film, !document.hidden);
  }

  function tick(now) {
    animation = 0;
    if (!ready || document.hidden) return;
    const elapsed = previous === null ? 0 : Math.max(0, (now - previous) / 1000);
    previous = now;
    if (!held) {
      if (!playing) {
        film = Math.min(FILM_END, film + elapsed);
        if (film >= FILM_END) enterPlay();
      }
      if (playing) advanceGame(Math.min(.1, elapsed));
    }
    draw();
    const animated = !game.reduced || game.cracks.length || game.stars.length
      || game.reunionAt !== null || Boolean(touchLinger);
    if (!held && animated) requestFrame();
    else previous = null;
  }

  function requestFrame() {
    if (ready && !animation && !document.hidden) animation = requestAnimationFrame(tick);
  }

  function updateSize() {
    rect = scene.getBoundingClientRect();
    painting.resize(rect.width, rect.height);
    const reach = Math.max(painting.portrait ? 38 : 46, rect.width * (90 / 1440));
    game.light.rx = reach / painting.scaleX;
    game.light.ry = reach / painting.scaleY;
  }

  async function resize() {
    const size = scene.getBoundingClientRect();
    if (!size.width || !size.height) return;
    const portrait = size.width / size.height < 1.05;
    if (requestedLayout === portrait) {
      if (ready && painting.portrait === portrait) {
        updateSize();
        requestFrame();
      }
      return;
    }
    const revision = ++layoutRevision;
    requestedLayout = portrait;
    if (animation) cancelAnimationFrame(animation);
    animation = 0;
    previous = null;
    const config = await painting.useLayout(portrait);
    if (revision !== layoutRevision) return;
    const first = !ready;
    painting.setLayout(config);
    updateSize();
    if (game.flights.length) {
      game.flights.forEach(flight => finishBand(flight.band));
      game.flights = [];
    }
    game.cracks = [];
    game.stars = [];
    game.light.present = false;
    target = pointer = null;
    if (document.fonts) await document.fonts.ready;
    if (revision !== layoutRevision) return;
    ready = true;
    if (first) {
      start();
      playSound();
    } else requestFrame();
  }

  function fromClient(x, y) {
    return {
      x: clamp((x - rect.left) / painting.scaleX, 0, painting.layout.width),
      y: clamp((y - rect.top) / painting.scaleY, 0, painting.layout.height),
    };
  }

  function placeLight(x, y, immediate = false) {
    target = { x, y };
    const snap = immediate || game.reduced || !game.light.present;
    game.light.present = true;
    if (snap) {
      Object.assign(game.light, target);
      painting.weather.update(0, game.light, game.wind, game.reduced);
    }
    requestFrame();
  }

  function removeLight() {
    if (pointer) return;
    target = null;
    game.light.present = false;
    scene.dataset.lit = "false";
    if (game.reduced) painting.weather.update(0, game.light, 0, true);
    requestFrame();
  }

  function actionAt(point, touch = false) {
    const hit = painting.weather.hit(point.x, point.y, painting.scaleX, painting.scaleY, touch);
    if (hit) collect(hit);
    else tapIce(point.x, point.y);
    requestFrame();
  }

  const observer = new ResizeObserver(() => resize().catch(() => {
    document.getElementById("load-error").hidden = false;
    announce("画卷暂未展开，请刷新重试。");
  }));
  observer.observe(scene);

  lake.addEventListener("pointerdown", event => {
    if (!playing || event.button !== 0 || !event.isPrimary) return;
    const point = fromClient(event.clientX, event.clientY);
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
    lake.setPointerCapture(event.pointerId);
    touchLinger = 0;
    placeLight(point.x, point.y, event.pointerType === "touch");
  });

  lake.addEventListener("pointermove", event => {
    if (!playing || !event.isPrimary || (event.pointerType === "touch" && !pointer)) return;
    if (event.pointerType !== "touch") touchLinger = 0;
    const point = fromClient(event.clientX, event.clientY);
    if (pointer?.id === event.pointerId && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 8) {
      pointer.dragged = true;
    }
    if (target && !game.reduced) {
      const push = clamp((point.x - target.x) * 3.65, -106, 106);
      game.wind = lerp(game.wind, push, .64);
    }
    placeLight(point.x, point.y);
    const hit = painting.weather.hit(point.x, point.y, painting.scaleX, painting.scaleY, false);
    scene.dataset.lit = String(Boolean(hit));
  });

  lake.addEventListener("pointerup", event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const touch = event.pointerType === "touch";
    const point = fromClient(event.clientX, event.clientY);
    if (!pointer.dragged) {
      if (touch) placeLight(point.x, point.y, true);
      actionAt(point, touch);
    }
    pointer = null;
    if (touch) touchLinger = game.age + .40;
    requestFrame();
  });
  function cancelPointer(event) {
    if (pointer?.id !== event.pointerId) return;
    pointer = null;
    removeLight();
  }

  lake.addEventListener("pointercancel", cancelPointer);
  lake.addEventListener("lostpointercapture", cancelPointer);
  lake.addEventListener("pointerleave", removeLight);

  lake.addEventListener("keydown", event => {
    if (!playing) return;
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const direction = directions[event.key];
    if (!direction && !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    resumeSound(event);
    const { width, height } = painting.layout;
    if (!target) placeLight(width * .56, height * .37, true);
    if (!direction) {
      actionAt(target, true);
      return;
    }
    const [dx, dy] = direction;
    let score = Infinity, next = null;
    for (const flake of painting.weather.snow) {
      if (!flake.visible) continue;
      const x = flake.x - target.x, y = flake.y - target.y;
      const forward = x * dx + y * dy;
      if (forward <= 7) continue;
      const distance = forward + 2.1 * Math.abs(x * dy - y * dx);
      if (distance < score) { score = distance; next = flake; }
    }
    const point = next || {
      x: clamp(target.x + dx * .04 * width, 0, width),
      y: clamp(target.y + dy * .04 * height, 0, height),
    };
    placeLight(point.x, point.y, true);
  });

  function playSound(fromGesture = false) {
    if (!sound.enabled) return;
    sound.play(fromGesture).catch(() => {
      if (fromGesture && sound.enabled) announce("声音暂时不可用。");
    });
    sound.weather(film, !document.hidden);
  }

  function resumeSound(event) {
    if (event.isTrusted && sound.context?.state !== "running" && !soundButton.contains(event.target)) {
      playSound(true);
    }
  }

  document.addEventListener("click", resumeSound, true);
  lake.addEventListener("pointerup", resumeSound, true);
  replay.addEventListener("click", start);
  skip.addEventListener("click", () => enterPlay(true));
  soundButton.addEventListener("click", () => {
    const enabled = sound.toggle();
    soundButton.setAttribute("aria-pressed", String(enabled));
    announce(enabled ? "声音已开启。" : "声音已关闭。");
    if (enabled) playSound(true);
  });

  motion.addEventListener("change", () => {
    game.reduced = motion.matches;
    if (game.reduced) {
      game.flights.forEach(flight => finishBand(flight.band));
      game.flights = [];
      if (ready) enterPlay();
    }
    requestFrame();
  });

  document.addEventListener("visibilitychange", () => {
    previous = null;
    sound.weather(film, !document.hidden);
    if (document.hidden && animation) {
      cancelAnimationFrame(animation);
      animation = 0;
    } else requestFrame();
  });

  if (capture) {
    globalThis.hongcangQA = {
      get ready() { return ready; },
      seek(time) {
        held = true;
        resetGame();
        film = clamp(time, 0, FILM_END);
        if (film === FILM_END) enterPlay();
        else {
          playing = false;
          scene.dataset.mode = "film";
          skip.hidden = false;
          lake.tabIndex = -1;
          accessible(lake, false);
        }
        if (playing) advanceGame(0);
        draw();
      },
      step(seconds) {
        if (playing) {
          const step = 1 / 60;
          for (let left = seconds; left > 0; left -= step) advanceGame(Math.min(step, left));
        } else {
          film = Math.min(FILM_END, film + seconds);
          if (film >= FILM_END) {
            enterPlay();
            advanceGame(0);
          }
        }
        draw();
      },
      inspect() {
        const { scaleX, scaleY, weather, layout } = painting;
        return {
          playing, film, reduced: game.reduced, flights: game.flights.length, cracks: game.cracks.length,
          raised: game.raised, reflection: game.reunionReflection, wind: game.wind,
          soundCreated: Boolean(sound.context), soundEnabled: sound.enabled,
          soundState: sound.context?.state ?? "uninitialized",
          collected: [...game.collected], portrait: painting.portrait,
          waterline: layout.waterline * scaleY, width: painting.canvas.width, height: painting.canvas.height,
          snow: weather.snow.filter(flake => flake.visible).map(flake => ({
            x: rect.left + flake.x * scaleX, y: rect.top + flake.y * scaleY,
            band: flake.band, lit: flake.inside, alpha: flake.alpha,
          })),
        };
      },
    };
  }
})();
