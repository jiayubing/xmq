(() => {
  'use strict';

  const el = (id) => document.getElementById(id);
  const entries = (window.MIANJIZI_PHOTOS || []).filter((entry) => entry && entry.src);
  const hero = el('hero');
  const heroImage = el('hero-image');
  const witness = el('witness');
  const witnessImage = el('witness-image');
  const receipt = el('receiptnote');
  const crimes = el('crimes');
  const total = el('total');
  const stamp = el('stamp');
  const stampOpinion = el('stamp-opinion');
  const stampCount = el('stamp-count');
  const ink = el('ink');
  const flash = el('flash');
  const previous = el('previous');
  const random = el('random');
  const archiveButton = el('archives');
  const exportButton = el('export');
  const sound = el('sound');
  const lastSeen = el('last-seen');
  const status = el('status');
  const archive = el('archive');
  const archiveList = el('archive-list');
  const archiveCount = el('archive-count');
  const archiveSearch = el('archive-search');
  const detail = el('detail');
  const detailImage = el('detail-image');
  const detailTitle = el('detail-title');
  const detailPrevious = el('detail-previous');
  const detailNext = el('detail-next');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const pad = (n) => String(n).padStart(2, '0');
  const wrap = (n) => (n + entries.length) % entries.length;
  const titleOf = (entry, index) => entry.title || `目击记录 ${pad(index + 1)}`;
  const sightingOf = (entry, index) => entry.lastSeen || entry.status || entry.sighting || titleOf(entry, index);
  const markVerb = '已盖章';
  const storageKey = 'mianjizi-wanted:stamps:v1';
  const stampColor = '#b72718';
  const inkPositions = [[74,79,-14], [77,12,11], [21,12,-9], [82,58,-7], [20,68,8]];
  let active = 0;
  let archiveButtons = [];
  let lastFlash = -Infinity;
  let exporting = false;
  let audioEnabled = false;
  let audioContext;
  let noise;
  let counts = {};
  let statusTimer;

  function announce(message, duration = 2500) {
    if (!status) return;
    clearTimeout(statusTimer);
    status.textContent = message;
    if (duration > 0) statusTimer = setTimeout(() => { status.textContent = ''; }, duration);
  }

  if (!entries.length) {
    announce('没有找到目击照片', 0);
    [hero, witness, previous, random, archiveButton, exportButton, stamp].forEach((button) => {
      if (button) button.disabled = true;
    });
    return;
  }

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) counts = saved;
  } catch {
    // Local files and private windows can prohibit storage; the gallery still works.
  }

  const stampKey = (index) => String(entries[index].id || entries[index].src).slice(-160);
  const countFor = (index) => Math.min(999999, Math.max(0, Math.floor(Number(counts[stampKey(index)]) || 0)));
  const totalStamps = () => entries.reduce((sum, _, index) => sum + countFor(index), 0);

  function stampData(index) {
    const entry = entries[index];
    const number = countFor(index);
    return Array.from({length: Math.min(number, inkPositions.length)}, (_, i) => {
      const order = number - Math.min(number, inkPositions.length) + i;
      const [x, y, angle] = inkPositions[order % inkPositions.length];
      return {text: entry.stamp || markVerb, color: order % 2 ? "#2146b3" : stampColor, x, y, angle};
    });
  }

  function renderInk(fresh = false) {
    const marks = stampData(active);
    const inkNodes = marks.map((mark, index) => {
      const node = document.createElement('span');
      node.className = index === marks.length - 1 && fresh ? 'ink-mark is-fresh' : 'ink-mark';
      node.textContent = mark.text;
      node.setAttribute('aria-hidden', 'true');
      node.style.setProperty('--ink-x', `${mark.x}%`);
      node.style.setProperty('--ink-y', `${mark.y}%`);
      node.style.setProperty('--ink-rotation', `${mark.angle}deg`);
      node.style.setProperty('--ink-color', mark.color);
      return node;
    });
    ink?.replaceChildren(...inkNodes);
    if (stampCount) {
      stampCount.textContent = String(countFor(active));
      stampCount.title = `本张盖章 ${countFor(active)} 次，全部档案共盖章 ${totalStamps()} 次`;
    }
  }

  function cropImage(image, entry, scale) {
    if (!image) return;
    let pos = entry.pos || '50% 50%';
    if (Array.isArray(pos)) {
      const percentage = (n) => typeof n === 'number' ? `${Math.abs(n) <= 1 ? n * 100 : n}%` : n;
      pos = pos.map(percentage).join(' ');
    }
    const zoom = Math.max(1, Math.min(1.8, Number(entry.zoom) || 1));
    image.style.objectPosition = pos;
    image.style.transformOrigin = pos;
    image.style.transform = scale && zoom > 1 ? `scale(${zoom})` : '';
  }

  function setImage(image, entry, index, {thumbnail = false} = {}) {
    if (!image) return;
    const source = (thumbnail && entry.thumb) || entry.src;
    if (thumbnail && source !== entry.src) {
      image.onerror = () => {
        image.onerror = null;
        image.src = entry.src;
      };
    }
    if (image.getAttribute('src') !== source) image.src = source;
    image.alt = `邪恶面剂子：${titleOf(entry, index)}`;
    cropImage(image, entry, !thumbnail);
  }

  function animate(node, className) {
    if (!node || reduceMotion.matches) return;
    node.classList.remove(className);
    // Restart the CSS animation even if the previous interaction is still finishing.
    void node.offsetWidth;
    node.classList.add(className);
  }

  function cameraFlash() {
    const now = performance.now();
    if (now - lastFlash < 420) return;
    lastFlash = now;
    animate(flash, 'flashing');
  }

  flash?.addEventListener('animationend', (event) => {
    if (event.target === flash) flash.classList.remove('flashing');
  });
  receipt?.addEventListener('animationend', (event) => {
    if (event.target === receipt) receipt.classList.remove('printing');
  });
  ink?.addEventListener('animationend', (event) => {
    if (event.target.classList.contains('ink-mark')) event.target.classList.remove('is-fresh');
  });

  function renderReceipt(entry) {
    const rows = Array.isArray(entry.crimes) ? entry.crimes.filter((crime) => crime && crime.text) : [];
    crimes?.replaceChildren(...rows.map((crime) => {
      const item = document.createElement('li');
      const label = document.createElement('span');
      const quantity = document.createElement('span');
      label.className = 'crime-text';
      label.textContent = crime.text;
      quantity.className = 'crime-count';
      quantity.textContent = `×${Number(crime.count) || 1}`;
      item.append(label, quantity);
      return item;
    }));
    if (total) total.textContent = String(entry.total ?? rows.reduce((sum, crime) => sum + (Number(crime.count) || 1), 0));
    if (stampOpinion) stampOpinion.textContent = entry.stamp || markVerb;
  }

  function renderDetail() {
    if (detail?.open) {
      const entry = entries[active];
      setImage(detailImage, entry, active);
      if (detailTitle) detailTitle.textContent = titleOf(entry, active);
    }
  }

  function render() {
    const entry = entries[active];
    const next = wrap(active + 1);
    setImage(heroImage, entry, active);
    setImage(witnessImage, entries[next], next);
    hero?.setAttribute('aria-label', `放大查看：${titleOf(entry, active)}`);
    witness?.setAttribute('aria-label', `下一张：${titleOf(entries[next], next)}`);
    if (lastSeen) lastSeen.textContent = sightingOf(entry, active);
    renderReceipt(entry);
    renderInk();
    renderDetail();
    archiveButtons.forEach(({button, index}) => {
      if (index === active) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
  }

  function navigate(index, {effects = true, effectSound = 'paper'} = {}) {
    const target = wrap(index);
    if (target === active) return;
    active = target;
    render();
    if (effects) {
      animate(receipt, 'printing');
      cameraFlash();
      playSound(effectSound);
    }
    announce(`第 ${active + 1} 张：${titleOf(entries[active], active)}`, 1500);
  }

  function goRandom() {
    if (entries.length < 2) return;
    navigate(active + 1 + Math.floor(Math.random() * (entries.length - 1)), {effectSound: 'shutter'});
  }

  previous?.addEventListener('click', () => navigate(active - 1));
  witness?.addEventListener('click', () => navigate(active + 1));
  random?.addEventListener('click', goRandom);

  if (entries.length < 2) {
    [witness, random, previous, detailPrevious, detailNext].forEach((button) => {
      if (button) button.disabled = true;
    });
  }

  stamp?.addEventListener('click', () => {
    counts[stampKey(active)] = Math.min(999999, countFor(active) + 1);
    try { localStorage.setItem(storageKey, JSON.stringify(counts)); } catch {}
    renderInk(true);
    playSound('stamp');
    announce(`${markVerb}，本张 ${countFor(active)} 次`);
  });

  function makeArchive() {
    if (!archiveList || archiveButtons.length) return;
    const fragment = document.createDocumentFragment();
    entries.forEach((entry, index) => {
      const title = titleOf(entry, index);
      const button = document.createElement('button');
      button.className = 'poster-thumb';
      button.type = 'button';
      button.setAttribute('aria-label', `打开第 ${index + 1} 张：${title}`);
      if (index === active) button.setAttribute('aria-current', 'true');
      const image = document.createElement('img');
      image.loading = 'lazy';
      image.decoding = 'async';
      setImage(image, entry, index, {thumbnail: true});
      image.alt = '';
      const caption = document.createElement('span');
      caption.className = 'thumb-caption';
      caption.textContent = `${pad(index + 1)}. ${title}`;
      button.append(image, caption);
      button.addEventListener('click', () => {
        archive.close();
        navigate(index);
      });
      archiveButtons.push({
        button, index, keywords: [
          pad(index + 1),
          title,
          entry.stamp,
          ...(Array.isArray(entry.crimes) ? entry.crimes.map((crime) => crime?.text) : [])
        ].filter(Boolean).join(' ').toLocaleLowerCase()
      });
      fragment.append(button);
    });
    archiveList.append(fragment);
  }

  function filterArchive() {
    const terms = (archiveSearch?.value || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    let visible = 0;
    for (const {button, keywords} of archiveButtons) {
      const match = terms.every((term) => keywords.includes(term));
      button.hidden = !match;
      button.style.display = match ? '' : 'none';
      if (match) visible++;
    }
    if (archiveCount) archiveCount.textContent = terms.length && visible === 0 ? '未找到档案' : `${visible} / ${entries.length}`;
  }

  function bindDialog(dialog, trigger) {
    if (!dialog) return;
    dialog.addEventListener('close', () => trigger?.focus({preventScroll: true}));
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
  }

  bindDialog(archive, archiveButton);
  bindDialog(detail, hero);

  archiveButton?.addEventListener('click', () => {
    if (!archive || archive.open) return;
    makeArchive();
    filterArchive();
    archive.showModal();
    (archive.querySelector('form button') || archiveSearch)?.focus({preventScroll: true});
  });
  archiveSearch?.addEventListener('input', filterArchive);

  hero?.addEventListener('click', () => {
    if (!detail || detail.open) return;
    setImage(detailImage, entries[active], active);
    if (detailTitle) detailTitle.textContent = titleOf(entries[active], active);
    detail.showModal();
    (detail.querySelector('[autofocus]') || detail.querySelector('form button') ||
      detail.querySelector('button'))?.focus({preventScroll: true});
    playSound('shutter');
  });
  detailPrevious?.addEventListener('click', () => navigate(active - 1, {effects: false}));
  detailNext?.addEventListener('click', () => navigate(active + 1, {effects: false}));

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        event.repeat || archive?.open || event.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    navigate(active + (event.key === 'ArrowLeft' ? -1 : 1), {effects: !detail?.open});
  });

  function loadExportImage(source) {
    // Make a dedicated image so changing the active record during export is race-free.
    const image = new Image();
    image.src = source;
    return image.decode().then(() => image);
  }

  exportButton?.addEventListener('click', async () => {
    if (exporting) return;
    if (typeof window.exportWantedPoster !== 'function') {
      announce('海报导出暂不可用');
      return;
    }
    const entry = entries[active];
    const exportEntry = {...entry, sighting: sightingOf(entry, active)};
    const nextEntry = entries[wrap(active + 1)];
    const nextSource = nextEntry.exportSrc || nextEntry.src;
    const includeWitness = location.protocol !== 'file:' || /^(data|blob):/.test(nextSource);
    const stamps = stampData(active);
    const filename = `邪恶面剂子-${pad(active + 1)}-通缉令.png`;
    exporting = true;
    exportButton.disabled = true;
    announce('正在生成海报…', 0);
    let url;
    try {
      const image = await loadExportImage(entry.exportSrc || entry.src);
      const blob = await window.exportWantedPoster({
        entry: exportEntry, image, stamps,
        witness: includeWitness ? nextSource : undefined,
        witnessEntry: includeWitness ? {...nextEntry, src: nextSource, thumb: undefined} : undefined
      });
      if (!(blob instanceof Blob) || !blob.size) throw new Error('empty poster');
      url = URL.createObjectURL(blob);
      const download = document.createElement('a');
      download.href = url;
      download.download = filename;
      document.body.append(download);
      download.click();
      download.remove();
      announce('海报已生成，已开始下载', 4200);
    } catch (error) {
      const localFileError = location.protocol === 'file:' && !entry.exportSrc && !entry.src.startsWith('data:');
      announce(localFileError ? '浏览器限制本地导出，请通过网页预览打开再试' : '没能生成海报，请再试一次', 5500);
    } finally {
      if (url) setTimeout(() => URL.revokeObjectURL(url), 30_000);
      exporting = false;
      exportButton.disabled = false;
    }
  });

  function updateSound() {
    if (!sound) return;
    sound.setAttribute('aria-pressed', String(audioEnabled));
    sound.title = audioEnabled ? '关闭音效' : '开启音效';
    sound.setAttribute('aria-label', sound.title);
    const label = sound.querySelector('[data-sound-label]');
    if (label) label.textContent = audioEnabled ? '音效开' : '音效关';
  }

  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio && sound) sound.disabled = true;
  sound?.addEventListener('click', () => {
    if (!Audio) return;
    if (audioEnabled) {
      audioEnabled = false;
      updateSound();
      announce('音效已关闭');
      return;
    }
    try {
      audioContext ||= new Audio();
      audioEnabled = true;
      updateSound();
      if (audioContext.state === 'suspended') audioContext.resume().then(() => playSound('paper')).catch(() => {});
      else playSound('paper');
      announce('音效已开启');
    } catch {
      audioEnabled = false;
      updateSound();
      announce('此浏览器无法播放音效');
    }
  });

  function playSound(kind) {
    if (!audioEnabled || !audioContext || audioContext.state !== 'running') return;
    const context = audioContext;
    const now = context.currentTime;
    if (!noise) {
      noise = context.createBuffer(1, Math.floor(context.sampleRate * 0.3), context.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    const rustle = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    rustle.buffer = noise;
    filter.type = 'bandpass';
    filter.frequency.value = {paper: 1500, shutter: 2200, stamp: 500}[kind];
    filter.Q.value = {paper: 0.6, shutter: 1.4, stamp: 0.8}[kind];
    const end = now + {paper: 0.14, shutter: 0.09, stamp: 0.17}[kind];
    envelope.gain.setValueAtTime(0.001, now);
    envelope.gain.exponentialRampToValueAtTime({paper: 0.13, shutter: 0.15, stamp: 0.19}[kind], now + 0.007);
    envelope.gain.exponentialRampToValueAtTime(0.001, end);
    rustle.connect(filter).connect(envelope).connect(context.destination);
    rustle.start(now);
    rustle.stop(end);

    if (kind === 'stamp') {
      const low = context.createOscillator();
      const decay = context.createGain();
      low.frequency.setValueAtTime(102, now);
      low.frequency.exponentialRampToValueAtTime(52, now + 0.12);
      decay.gain.setValueAtTime(0.12, now);
      decay.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      low.connect(decay).connect(context.destination);
      low.start(now);
      low.stop(now + 0.13);
    }
  }

  updateSound();
  render();
})();
