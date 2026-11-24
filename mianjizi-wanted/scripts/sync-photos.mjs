import { readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const photoDir = join(root, 'photos');
const manifest = join(root, 'photos.js');
const header = '// 照片按数组顺序展示。新增照片后运行 node scripts/sync-photos.mjs。\n';
const imageExt = /\.(?:avif|gif|jpe?g|png|webp)$/iu;
const collator = new Intl.Collator('zh-Hans', { numeric: true, sensitivity: 'base' });
const byName = (a, b) => collator.compare(a, b) || (a > b ? 1 : a < b ? -1 : 0);
const withoutExtension = path => path.slice(0, -extname(path).length);
const photoUrl = path => 'photos/' + path.split('/').map(encodeURIComponent).join('/');

async function listImages(dir, { skipThumbs = false, optional = false } = {}) {
  const result = [];
  async function visit(directory, relativeDir = '') {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (optional && !relativeDir && error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || (skipThumbs && entry.name === 'thumbnails')) continue;
      const relativePath = relativeDir ? relativeDir + '/' + entry.name : entry.name;
      if (entry.isDirectory()) await visit(join(directory, entry.name), relativePath);
      else if (entry.isFile() && imageExt.test(entry.name)) result.push(relativePath);
    }
  }
  await visit(dir);
  return result.sort(byName);
}

function readPhotoPath(src) {
  if (typeof src !== 'string') return null;
  const path = src.replace(/^\.\//u, '');
  if (!path.startsWith('photos/')) return null;
  const parts = path.slice('photos/'.length).split('/').map(segment => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
  if (parts.some(segment => !segment || segment.startsWith('.') || segment === 'thumbnails' || /[\\/\u0000]/u.test(segment))) return null;
  const decoded = parts.join('/');
  return imageExt.test(decoded) ? decoded : null;
}

async function readManifest() {
  let original;
  try {
    original = await readFile(manifest, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { original: '', entries: [] };
    throw error;
  }
  const match = original.match(/^\s*(?:\/\/[^\n]*\n\s*)*window\.MIANJIZI_PHOTOS\s*=\s*(\[[\s\S]*\])\s*;?\s*$/u);
  if (!match) throw new Error('photos.js 的格式不正确，未改写文件。请保留 window.MIANJIZI_PHOTOS = […] 的结构。');
  let entries;
  try {
    entries = JSON.parse(match[1]);
  } catch {
    throw new Error('photos.js 的数组须使用 JSON 格式：使用双引号，最后一项没有逗号。未改写文件。');
  }
  const paths = new Set();
  for (const entry of entries) {
    const path = readPhotoPath(entry?.src);
    if (!path || paths.has(path)) throw new Error('photos.js 有无效或重复的照片路径，未改写文件。');
    paths.add(path);
  }
  return { original, entries };
}

async function sync() {
  const [{ original, entries }, files, thumbs] = await Promise.all([
    readManifest(),
    listImages(photoDir, { skipThumbs: true }),
    listImages(join(photoDir, 'thumbnails'), { optional: true })
  ]);
  const available = new Set(files);
  const previous = new Set(entries.map(entry => readPhotoPath(entry.src)));
  const retained = entries.filter(entry => available.has(readPhotoPath(entry.src)));
  const added = files.filter(path => !previous.has(path));
  const thumbFiles = new Set(thumbs);
  const thumbByStem = new Map();
  for (const thumb of thumbs) {
    const stem = withoutExtension(thumb);
    if (!thumbByStem.has(stem)) thumbByStem.set(stem, thumb);
  }
  const next = [
    ...retained,
    ...added.map(path => ({
      src: photoUrl(path),
      title: withoutExtension(path).split('/').at(-1),
      crimes: [
        { text: '刚刚出没', count: 1 },
        { text: '留下可爱证据', count: 1 },
        { text: '被镜头发现', count: 1 }
      ],
      stamp: '可爱成立',
      pos: '50% 36%',
      zoom: 1.06,
      total: '当场心软'
    }))
  ].map(entry => {
    // Explicit thumb values (and all other user fields) are left as entered.
    if (Object.hasOwn(entry, 'thumb')) return entry;
    const path = readPhotoPath(entry.src);
    const thumb = thumbFiles.has(path) ? path : thumbByStem.get(withoutExtension(path));
    return thumb ? { ...entry, thumb: photoUrl('thumbnails/' + thumb) } : entry;
  });

  const removed = entries.length - retained.length;
  if (!original || JSON.stringify(next) !== JSON.stringify(entries)) {
    const updated = `${header}window.MIANJIZI_PHOTOS = ${JSON.stringify(next, null, 2)};\n`;
    const temporary = `${manifest}.${process.pid}.tmp`;
    try {
      await writeFile(temporary, updated, { flag: 'wx' });
      await rename(temporary, manifest);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  console.log(`照片清单：${next.length} 张（新增 ${added.length}，移除 ${removed}）。`);
}

sync().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
