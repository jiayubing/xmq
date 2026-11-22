'use strict';

const photos = window.MIANJIZI_PHOTOS;
const $ = (selector) => document.querySelector(selector);
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const smallDesk = matchMedia('(max-width: 710px)');
const tabs = [...document.querySelectorAll('[role="tab"]')];
const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function element(tag, className, content) {
  const node = document.createElement(tag);
  node.className = className;
  if (content !== undefined) node.textContent = content;
  if (tag === 'button') node.type = 'button';
  return node;
}

function photoFrame(photo, lazy = false) {
  const frame = element('span', 'photo-frame');
  frame.style.setProperty('--position', photo.pos);
  frame.style.setProperty('--zoom', photo.zoom);
  const image = element('img', '');
  image.alt = photo.title;
  image.draggable = false;
  if (lazy) image.loading = 'lazy';
  image.decoding = 'async';
  image.src = photo.src;
  frame.append(image);
  return frame;
}

function flip(card, state = !card.classList.contains('is-flipped')) {
  card.classList.toggle('is-flipped', state);
  card.setAttribute('aria-pressed', String(state));
  card.querySelector('.polaroid-front, .note-front').setAttribute('aria-hidden', String(state));
  card.querySelector('.polaroid-back, .note-back').setAttribute('aria-hidden', String(!state));
  const front = card.querySelector('.photo-caption, .note-front > span:last-child');
  const back = card.querySelector('.photo-note, .note-back > span:last-child');
  card.setAttribute('aria-label', (state ? back : front).innerText.replace(/\n/g, '，'));
}

function polaroid(photo, onDesk = false, index = 0) {
  const card = element('button', onDesk ? 'polaroid desk-photo' : 'polaroid');
  card.setAttribute('aria-label', photo.title);
  card.setAttribute('aria-pressed', 'false');
  const inner = element('span', 'polaroid-inner');
  const front = element('span', 'polaroid-face polaroid-front');
  front.append(photoFrame(photo), element('span', 'photo-caption', photo.title));
  if (onDesk) {
    const colors = ['#e4b17583', '#d98ca58f', '#9fb29099', '#b09bc892'];
    card.style.setProperty('--tape', colors[index % colors.length]);
    front.append(element('span', 'tape'));
    if (index === 1) {
      const svg = 'http://www.w3.org/2000/svg';
      const heart = document.createElementNS(svg, 'svg');
      const shape = document.createElementNS(svg, 'path');
      heart.setAttribute('class', 'heart-sticker');
      heart.setAttribute('viewBox', '0 0 24 24');
      heart.setAttribute('aria-hidden', 'true');
      shape.setAttribute('d', 'M12 21C10 19 2 14 2 8a5.25 5.25 0 0 1 10-2.25A5.25 5.25 0 0 1 22 8c0 6-8 11-10 13Z');
      heart.append(shape);
      front.append(heart);
    }
    card.setAttribute('aria-describedby', 'desk-help');
  }
  const back = element('span', 'polaroid-face polaroid-back');
  back.setAttribute('aria-hidden', 'true');
  back.append(element('span', 'photo-note', photo.note), element('span', 'flip-cue', '翻回'));
  inner.append(front, back);
  card.append(inner);
  return card;
}

// A table holds one spread. The card editor uses the whole album.
const desktopSlots = [
  [1, 16.3, 19.2, 24.6, -12], [20.4, 9.7, 25.8, 29.6, -5],
  [48.3, 3.2, 20.1, 22.3, 10], [50.1, 28.2, 19.5, 21.1, -9],
  [3.6, 58.8, 19.4, 21.8, -8], [25.5, 57.4, 21.5, 23.3, 5],
  [51.3, 58.3, 21.7, 22.4, -5], [76.5, 57.3, 19.3, 23.1, 8],
];
const mobileSlots = [
  [4.5, 7, 38, 44, -6], [57.5, 4, 38, 45, 5],
  [4.5, 59, 38, 44, 4], [57.5, 57, 38, 45, -5],
];
const stage = $('.desk-stage');
const deskPhotos = $('.desk-photos');
const deskNumber = $('.desk-number');
const deskNext = $('.next-desk');
const deskReset = $('.reset-desk');
const scatter = $('.scatter-desk');
let batchSize = smallDesk.matches ? mobileSlots.length : desktopSlots.length;
let batchCount = Math.max(1, Math.ceil(photos.length / batchSize));
let batch = 0;
let cards = [];
let topCard = 1;
let stageWidth = 0;
let stageHeight = 0;

function place(card) {
  card.node.style.setProperty('--x', `${card.left}px`);
  card.node.style.setProperty('--y', `${card.top}px`);
  card.node.style.setProperty('--angle', `${card.angle}deg`);
  card.node.style.zIndex = card.layer;
}

function bound(card, left, top) {
  const angle = Math.abs(card.angle * Math.PI / 180);
  const extraX = Math.max(0, (card.width * Math.cos(angle) + card.height * Math.sin(angle) - card.width) / 2);
  const extraY = Math.max(0, (card.height * Math.cos(angle) + card.width * Math.sin(angle) - card.height) / 2);
  const inset = smallDesk.matches ? Math.min(12, stageWidth * .035) : 0;
  card.left = Math.min(Math.max(left, extraX + inset), stageWidth - card.width - extraX - inset);
  card.top = Math.min(Math.max(top, extraY + inset), stageHeight - card.height - extraY - inset);
  place(card);
}

function layoutDesk() {
  const width = stage.clientWidth;
  if (!width || width === stageWidth) return;
  const previousWidth = stageWidth;
  stageWidth = width;
  const mobile = smallDesk.matches;
  const slots = mobile ? mobileSlots : desktopSlots;
  const unit = width / 100;
  const [, lastTop, , lastHeight] = slots[Math.max(0, cards.length - 1)];
  const end = mobile
    ? Math.max(...slots.slice(0, Math.max(1, cards.length)).map(([, top, , height]) => top + height + 6))
    : Math.max(52, lastTop + lastHeight + 4);
  stage.style.height = mobile && !cards.length ? '' : `${Math.ceil(end * unit)}px`;
  stageHeight = stage.clientHeight;
  cards.forEach((card, index) => {
    const [left, top, sizing, height, rotation] = slots[index];
    const offsetX = previousWidth ? (card.left - card.homeX) * width / previousWidth : 0;
    const offsetY = previousWidth ? (card.top - card.homeY) * width / previousWidth : 0;
    card.node.classList.remove('is-settling');
    card.homeX = left * unit;
    card.homeY = top * unit;
    card.width = sizing * unit;
    card.height = height * unit;
    card.homeAngle = rotation;
    card.angle = rotation + (card.turn || 0);
    card.node.style.setProperty('--card-width', `${card.width}px`);
    card.node.style.setProperty('--card-height', `${card.height}px`);
    bound(card, card.homeX + offsetX, card.homeY + offsetY);
  });
}

function raise(card) {
  // Normalize layer order so a moved photo never obscures the desk controls.
  if (topCard >= 20) {
    [...cards].sort((a, b) => a.layer - b.layer).forEach((other, index) => {
      other.layer = index + 1;
      place(other);
    });
    topCard = cards.length;
  }
  card.layer = ++topCard;
}

function attachDrag(card) {
  const node = card.node;
  let drag;
  let ignoreClick = false;
  node.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    ignoreClick = false;
    drag = {
      id: event.pointerId, x: event.clientX, y: event.clientY, left: card.left, top: card.top,
      lastX: event.clientX, lastY: event.clientY, time: event.timeStamp, vx: 0, vy: 0,
    };
    node.setPointerCapture(event.pointerId);
  });
  node.addEventListener('pointermove', (event) => {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    if (!drag.moved) {
      drag.moved = true;
      raise(card);
      node.classList.remove('is-settling');
      node.classList.add('is-dragging');
    }
    const interval = Math.max(8, event.timeStamp - drag.time);
    drag.vx = (event.clientX - drag.lastX) / interval;
    drag.vy = (event.clientY - drag.lastY) / interval;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.time = event.timeStamp;
    bound(card, drag.left + dx, drag.top + dy);
  });
  function finish(event) {
    if (drag?.id !== event.pointerId) return;
    ignoreClick = Boolean(drag.moved);
    node.classList.remove('is-dragging');
    if (drag.moved && event.type === 'pointerup' && !motion.matches && event.timeStamp - drag.time < 85) {
      const glide = (speed) => Math.max(-50, Math.min(50, speed * 36));
      node.classList.add('is-settling');
      bound(card, card.left + glide(drag.vx), card.top + glide(drag.vy));
    }
    drag = undefined;
  }
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((event) => node.addEventListener(event, finish));
  node.addEventListener('click', (event) => {
    if (ignoreClick && event.detail) return;
    raise(card);
    place(card);
    flip(node);
    sound('paper');
  });
  node.addEventListener('keydown', (event) => {
    const direction = arrows[event.key];
    if (!direction) return;
    event.preventDefault();
    node.classList.remove('is-settling');
    raise(card);
    const step = event.shiftKey ? 20 : 7;
    bound(card, card.left + direction[0] * step, card.top + direction[1] * step);
  });
}

function renderDesk() {
  const start = batch * batchSize;
  cards = photos.slice(start, start + batchSize).map((photo, index) => {
    const card = { node: polaroid(photo, true, index), layer: index + 1 };
    attachDrag(card);
    return card;
  });
  topCard = cards.length;
  deskPhotos.replaceChildren(...cards.map(({ node }) => node));
  stageWidth = 0;
  deskNext.hidden = deskNumber.hidden = batchCount === 1;
  deskNumber.textContent = batchCount > 1 ? `桌 ${batch + 1}·${batchCount}` : '';
  layoutDesk();
}

function resetDesk() {
  topCard = cards.length;
  cards.forEach((card, index) => {
    card.layer = index + 1;
    card.angle = card.homeAngle;
    card.turn = 0;
    card.node.classList.add('is-settling');
    flip(card.node, false);
    bound(card, card.homeX, card.homeY);
  });
  sound('paper');
}

scatter.disabled = deskReset.disabled = !photos.length;
$('.desk-empty').hidden = photos.length > 0;
deskReset.addEventListener('click', resetDesk);
deskNext.addEventListener('click', (event) => {
  batch = (batch + 1) % batchCount;
  renderDesk();
  if (smallDesk.matches && event.detail && stage.getBoundingClientRect().top < 0) {
    stage.scrollIntoView({ block: 'start', behavior: motion.matches ? 'auto' : 'smooth' });
  }
  sound('paper');
});
smallDesk.addEventListener('change', (event) => {
  const anchor = batch * batchSize;
  batchSize = event.matches ? mobileSlots.length : desktopSlots.length;
  batchCount = Math.max(1, Math.ceil(photos.length / batchSize));
  batch = Math.floor(anchor / batchSize);
  renderDesk();
});
scatter.addEventListener('click', () => {
  const mobile = smallDesk.matches;
  const distance = mobile ? stageWidth * .017 : Math.min(110, stageWidth * .105);
  const turn = mobile ? 2 : 12;
  cards.forEach((card) => {
    card.turn = (Math.random() * 2 - 1) * turn;
    card.angle = card.homeAngle + card.turn;
    card.node.classList.add('is-settling');
    bound(card, card.homeX + (Math.random() - .5) * 2 * distance, card.homeY + (Math.random() - .5) * distance);
  });
  sound('paper');
});

const gift = $('.gift-note');
gift.addEventListener('click', () => {
  flip(gift);
  sound('paper');
});
new ResizeObserver(() => requestAnimationFrame(layoutDesk)).observe(stage);
renderDesk();

const photoDialog = $('.photo-dialog');
const dialogPhoto = $('.dialog-photo');
const dialogFlip = $('.dialog-flip');
const fortune = $('.capsule-fortune');

function toggleDialogPhoto() {
  const card = dialogPhoto.firstElementChild;
  flip(card);
  dialogFlip.textContent = card.classList.contains('is-flipped') ? '看正面' : '看背面';
  sound('paper');
}

const machineButton = $('.machine-button');
dialogFlip.addEventListener('click', toggleDialogPhoto);
photoDialog.addEventListener('close', () => machineButton.focus({ preventScroll: true }));

function showCapsulePhoto(photo, message) {
  const card = polaroid(photo);
  card.addEventListener('click', toggleDialogPhoto);
  dialogPhoto.replaceChildren(card);
  dialogFlip.textContent = '看背面';
  fortune.textContent = message;
  photoDialog.showModal();
}

const machineArt = $('.machine-art');
const drawCount = $('.draw-count');
const fortunes = [
  '宜晒太阳，宜把最后一口甜留给自己。',
  '今天的好运藏得很浅，伸个懒腰就摸得到。',
  '路过暖洋洋的地方，可以慢走两步。',
  '事情等一等，先喝一口喜欢的东西。',
  '口袋空一点，才装得下突然冒出来的开心。',
];
let draws = 0;
let bag = [];
let drawing = false;
let shakeStart;
let skipMachineClick = false;
machineButton.disabled = photos.length === 0;

async function drawCapsule() {
  if (drawing || !photos.length) return;
  drawing = true;
  machineButton.classList.add('is-shaking');
  sound('capsule');
  await Promise.allSettled(machineArt.getAnimations().map((animation) => animation.finished));
  machineButton.classList.remove('is-shaking');
  drawing = false;
  if (document.body.dataset.view !== 'desk') return;
  if (!bag.length) bag = photos.map((_, index) => index);
  const [index] = bag.splice(Math.floor(Math.random() * bag.length), 1);
  drawCount.hidden = false;
  drawCount.firstElementChild.textContent = String(++draws);
  const message = fortunes[Math.floor(Math.random() * fortunes.length)];
  showCapsulePhoto(photos[index], `第 ${draws} 颗 · ${message}`);
}

machineButton.addEventListener('click', (event) => {
  if (!skipMachineClick || event.detail === 0) void drawCapsule();
  skipMachineClick = false;
});
machineArt.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0) return;
  skipMachineClick = false;
  shakeStart = { id: event.pointerId, x: event.clientX };
  machineArt.setPointerCapture(event.pointerId);
});
machineArt.addEventListener('pointerup', (event) => {
  if (shakeStart?.id !== event.pointerId) return;
  if (Math.abs(event.clientX - shakeStart.x) >= 25) {
    skipMachineClick = true;
    void drawCapsule();
  }
  shakeStart = undefined;
});
machineArt.addEventListener('lostpointercapture', () => { shakeStart = undefined; });
machineArt.addEventListener('pointercancel', () => { shakeStart = undefined; });

const postcard = $('.postcard');
const postcardPhotos = $('.postcard-photos');
const pickDialog = $('.pick-dialog');
const pickPhotos = $('.pick-photos');
const topLine = $('#top-line');
const bottomLine = $('#bottom-line');
const cardStatus = $('.card-status');
const randomCard = $('.random-card');
const exportCard = $('.export-card');
const palettes = {
  cream: ['#f7e7cb', '#5f382b', '#b68d5d'],
  berry: ['#f5d9e0', '#652f48', '#b66c87'],
  sage: ['#e2ead7', '#364b35', '#829375'],
  dusk: ['#e8dff0', '#492f63', '#927ba7'],
};
const slotCount = 4;
let selection = Array.from({ length: slotCount }, (_, index) => photos[index] ? index : null);
let theme = 'cream';
let picking = 0;
let cardReady = false;
let exporting = false;

function renderCard() {
  if (cardReady) return;
  cardReady = true;
  for (let slot = 0; slot < slotCount; slot++) {
    const button = element('button', 'postcard-slot');
    button.addEventListener('click', () => showPicker(slot));
    postcardPhotos.append(button);
  }
  updateSlots();
  updatePhrases();
}

function updateSlots() {
  selection.forEach((index, slot) => {
    const photo = photos[index];
    const button = postcardPhotos.children[slot];
    button.replaceChildren(photo ? photoFrame(photo) : element('span', '', '＋'));
    button.disabled = !photos.length;
    button.setAttribute('aria-label', photo ? `第 ${slot + 1} 格：${photo.title}，更换照片` : `选择第 ${slot + 1} 格照片`);
  });
  randomCard.disabled = photos.length < slotCount;
  exportCard.disabled = exporting || selection.some((index) => index === null);
  cardStatus.textContent = photos.length < slotCount ? '相册里有四张照片后，就可以下载纪念卡。' : '';
}

function showPicker(slot) {
  picking = slot;
  $('#pick-heading').textContent = `选第 ${slot + 1} 格照片`;
  if (!pickPhotos.childElementCount) {
    pickPhotos.append(...photos.map((photo, index) => {
      const button = element('button', 'pick-photo');
      button.append(photoFrame(photo, true), element('span', '', photo.title));
      button.addEventListener('click', () => {
        const existing = selection.indexOf(index);
        if (existing !== -1) selection[existing] = selection[picking];
        selection[picking] = index;
        updateSlots();
        pickDialog.close();
        sound('shutter');
      });
      return button;
    }));
  }
  [...pickPhotos.children].forEach((button, index) => {
    button.setAttribute('aria-current', String(index === selection[slot]));
  });
  pickDialog.scrollTop = 0;
  pickDialog.showModal();
  pickPhotos.scrollTop = 0;
  sound('tap');
}

randomCard.addEventListener('click', () => {
  const choices = photos.map((_, index) => index);
  selection = Array.from({ length: slotCount }, () => choices.splice(Math.floor(Math.random() * choices.length), 1)[0]);
  updateSlots();
  cardStatus.textContent = '四连拍，换好了。';
  sound('shutter');
});

$('.palette').addEventListener('change', (event) => {
  theme = event.target.value;
  const [paper, ink, rule] = palettes[theme];
  postcard.style.setProperty('--card-paper', paper);
  postcard.style.setProperty('--card-ink', ink);
  postcard.style.setProperty('--card-rule', rule);
  sound('tap');
});

const phraseMetrics = document.createElement('canvas').getContext('2d');

function phraseSize(text) {
  phraseMetrics.font = `100px ${getComputedStyle(postcard).getPropertyValue('--hand')}`;
  const widthInEm = phraseMetrics.measureText(text).width / 100;
  return Math.min(4.6, 81 / Math.max(1, widthInEm, Array.from(text).length));
}

function updatePhrases() {
  [[topLine, $('.card-top')], [bottomLine, $('.card-bottom')]].forEach(([field, preview]) => {
    const text = field.value.trim();
    preview.textContent = text;
    preview.style.setProperty('--line-size', `${phraseSize(text)}cqi`);
  });
}

[topLine, bottomLine].forEach((field) => field.addEventListener('input', updatePhrases));

function drawCrop(context, image, photo, x, y, width, height) {
  const [px, py] = photo.pos.split(/\s+/).map((part) => parseFloat(part) / 100);
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  // Match the preview's object-fit, object-position and transform-origin.
  const scale = Math.max(width / iw, height / ih) * photo.zoom;
  const sw = width / scale;
  const sh = height / scale;
  context.drawImage(image, (iw - sw) * px, (ih - sh) * py, sw, sh, x, y, width, height);
}

exportCard.addEventListener('click', async () => {
  exporting = true;
  exportCard.disabled = true;
  cardStatus.textContent = '正在合成纪念卡…';
  const chosen = selection.map((index) => photos[index]);
  const images = [...postcardPhotos.querySelectorAll('img')];
  const phrases = [topLine.value.trim(), bottomLine.value.trim()];
  const [paper, ink, rule] = palettes[theme];
  try {
    await Promise.all(images.map((image) => image.decode()));
    await document.fonts.ready;
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 2400;
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';
    context.fillStyle = paper;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.lineWidth = 4;
    context.strokeStyle = rule;
    context.strokeRect(64, 64, 1792, 2272);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const hand = getComputedStyle(document.documentElement).getPropertyValue('--hand');
    const sun = new Path2D(postcard.querySelector('.postcard-sun path').getAttribute('d'));
    const sunSize = canvas.width * .053;
    context.save();
    context.translate((canvas.width - sunSize) / 2, canvas.height * .041);
    context.scale(sunSize / 24, sunSize / 24);
    context.lineWidth = 1.2;
    context.lineCap = 'round';
    context.stroke(sun);
    context.restore();
    context.fillStyle = ink;
    phrases.forEach((text, index) => {
      context.font = `${canvas.width * phraseSize(text) / 100}px ${hand}`;
      context.fillText(text, 960, canvas.height * (index ? .91 : .115), 1570);
    });
    images.forEach((image, index) => {
      drawCrop(context, image, chosen[index], 140 + (index % 2) * 844, 380 + Math.floor(index / 2) * 808, 796, 760);
    });
    const blob = await new Promise((resolve, reject) => canvas.toBlob((png) => {
      if (png) resolve(png);
      else reject(new Error('PNG encoding failed'));
    }, 'image/png'));
    const objectUrl = URL.createObjectURL(blob);
    const link = element('a', '');
    link.href = objectUrl;
    link.download = '太阳口袋-四格纪念卡.png';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    cardStatus.textContent = '纪念卡已生成。';
    sound('shutter');
  } catch (error) {
    cardStatus.textContent = error.name === 'SecurityError' && location.protocol === 'file:'
      ? '请从网站或本地网页服务器打开，再下载纪念卡。'
      : '纪念卡没合成成功，请等照片加载后再试。';
  } finally {
    exporting = false;
    exportCard.disabled = selection.some((index) => index === null);
  }
});

function selectView(tab) {
  const view = tab.getAttribute('aria-controls');
  const changed = view !== document.body.dataset.view;
  tabs.forEach((other) => {
    const active = other === tab;
    other.setAttribute('aria-selected', String(active));
    other.tabIndex = active ? 0 : -1;
    document.getElementById(other.getAttribute('aria-controls')).hidden = !active;
  });
  document.body.dataset.view = view;
  deskReset.hidden = view !== 'desk';
  if (view === 'card') renderCard();
  if (view === 'desk') layoutDesk();
  if (changed) sound('tap');
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectView(tab));
  tab.addEventListener('keydown', (event) => {
    let next;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      next = (index + arrows[event.key][0] + tabs.length) % tabs.length;
    } else return;
    event.preventDefault();
    selectView(tabs[next]);
    tabs[next].focus();
  });
});

if (location.protocol === 'file:') {
  $('.back-link').addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    location.href = '../index.html';
  });
}

const soundToggle = $('.sound-toggle');
const pentatonic = [523.25, 587.33, 659.25, 783.99, 880, 1046.5]; // C5, D5, E5, G5, A5, C6
const capsuleTiming = [0, .058, .122, .198, .262, .345];
let audio;
let lowpass;
let master;
let audible = false;
let startingAudio = false;

function tone(start, pitch, duration, level, { type = 'sine', attack = .004, endPitch = pitch } = {}) {
  const oscillator = audio.createOscillator();
  const envelope = audio.createGain();
  const end = start + duration;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(pitch, start);
  if (endPitch !== pitch) oscillator.frequency.exponentialRampToValueAtTime(endPitch, end);
  envelope.gain.setValueAtTime(.0001, start);
  envelope.gain.linearRampToValueAtTime(level, start + attack);
  envelope.gain.exponentialRampToValueAtTime(.0001, end);
  oscillator.connect(envelope).connect(lowpass);
  oscillator.start(start);
  oscillator.stop(end);
}

function mallet(start, pitch, duration, level, attack = .004) {
  tone(start, pitch, duration, level, { attack });
  tone(start, pitch * 2, duration * .55, level * .12, { attack });
}

function sound(kind) {
  if (!audible || audio.state !== 'running') return;
  const start = audio.currentTime + .005;
  switch (kind) {
    case 'paper':
      tone(start, 280, .045, .25, { type: 'triangle', endPitch: 150 });
      tone(start, 280, .045, .15, { endPitch: 150 });
      tone(start, 560, .027, .025, { endPitch: 300 });
      break;
    case 'tap':
      mallet(start, pentatonic[1], .04, .18);
      break;
    case 'shutter':
      tone(start, 740, .016, .23, { type: 'triangle', attack: .002, endPitch: 300 });
      tone(start + .03, 890, .016, .17, { type: 'triangle', attack: .002, endPitch: 420 });
      mallet(start + .052, pentatonic[5], .16, .15);
      break;
    case 'capsule':
      pentatonic.forEach((pitch, index) => {
        const duration = index === pentatonic.length - 1 ? .32 : .15 + index * .012;
        mallet(start + capsuleTiming[index], pitch, duration, index % 2 ? .18 : .22);
      });
      break;
    case 'music':
      [261.63, 392, 493.88, 587.33, 659.25].forEach((pitch, index) => { // Cmaj9
        mallet(start + index * .026, pitch, .58 + index * .028, index === 0 ? .20 : .14, .025);
      });
      break;
  }
}

soundToggle.addEventListener('click', async () => {
  if (startingAudio) return;
  if (audible) {
    audible = false;
    master.gain.setTargetAtTime(0, audio.currentTime, .015);
    soundToggle.setAttribute('aria-pressed', 'false');
    return;
  }
  startingAudio = true;
  try {
    if (!audio) {
      audio = new AudioContext();
      lowpass = audio.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 2600;
      lowpass.Q.value = -3;
      master = audio.createGain();
      master.gain.value = 0;
      lowpass.connect(master).connect(audio.destination);
    }
    await audio.resume();
    audible = true;
    master.gain.setTargetAtTime(.14, audio.currentTime, .015);
    soundToggle.setAttribute('aria-pressed', 'true');
    sound('music');
  } catch {
    audible = false;
  } finally {
    startingAudio = false;
  }
});
