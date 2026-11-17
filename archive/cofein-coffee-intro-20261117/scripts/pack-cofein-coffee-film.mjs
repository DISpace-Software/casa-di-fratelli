/** Convert locally rendered RGBA frames to bounded-size browser assets.
 * Usage: node scripts/pack-cofein-coffee-film.mjs INPUT OUTPUT SHARP_MODULE
 *   [--fade-start 0.86] [--fade-end 0.99] [--max-width-fraction 1.4]
 * INPUT contains 0021.png … and impacts.json exported from the same simulation.
 * The image processor is passed explicitly, like the browser QA toolchain.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const [input, output, sharpModule, ...options] = process.argv.slice(2);
if (!input || !output || !sharpModule) {
  throw new Error('Expected INPUT directory, OUTPUT directory and SHARP_MODULE path.');
}
const framing = { maxWidth: 1100, maxWidthFraction: 1.4, centerY: 0.42, maxHeightFraction: 0.8,
  fadeStart: 0.86, fadeEnd: 0.99 };
const edgeTreatment = { version: 1, method: 'product-cubic-smoothstep-alpha',
  coordinates: 'u=x/(width-1),v=y/(height-1)', top: 0.025, right: 0.035, bottom: 0.06, left: 0.035 };
const webpEncoding = { quality: 88, alphaQuality: 100, effort: 6 };
const encodingParams = { version: 2, format: 'webp', ...webpEncoding, edgeTreatment };

function softenFrameEdges(data, width, height) {
  if (width < 2 || height < 2 || data.length !== width * height * 4) {
    throw new Error('Edge treatment requires an RGBA image at least two pixels wide and high.');
  }
  const smoothstep = value => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  };
  const columns = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    const u = x / (width - 1);
    columns[x] = smoothstep(u / edgeTreatment.left) * smoothstep((1 - u) / edgeTreatment.right);
  }
  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    const row = smoothstep(v / edgeTreatment.top) * smoothstep((1 - v) / edgeTreatment.bottom);
    for (let x = 0; x < width; x++) {
      const alpha = (y * width + x) * 4 + 3;
      data[alpha] = Math.round(data[alpha] * columns[x] * row);
    }
  }
}

const optionKeys = { '--fade-start': 'fadeStart', '--fade-end': 'fadeEnd', '--max-width-fraction': 'maxWidthFraction' };
for (let index = 0; index < options.length; index++) {
  const separator = options[index].indexOf('=');
  const flag = separator < 0 ? options[index] : options[index].slice(0, separator);
  const inline = separator < 0 ? undefined : options[index].slice(separator + 1);
  const key = optionKeys[flag];
  const value = inline ?? options[++index];
  if (!key || value === undefined || value.trim() === '' || !Number.isFinite(Number(value))) {
    throw new Error(`Expected a finite numeric value for a supported framing option: ${flag}`);
  }
  framing[key] = Number(value);
}
if (!(framing.fadeStart >= 0 && framing.fadeStart < framing.fadeEnd && framing.fadeEnd <= 1)
  || !(framing.maxWidthFraction > 0)) {
  throw new Error('Require 0 <= fade-start < fade-end <= 1 and a positive max-width-fraction.');
}
const { default: sharp } = await import(pathToFileURL(path.resolve(sharpModule)).href);
const files = (await fs.readdir(input)).filter(name => /^\d+\.png$/.test(name)).sort();
if (files.length < 2) throw new Error('At least two real rendered frames are required.');
const frameNumbers = files.map(name => Number.parseInt(name, 10));
if (frameNumbers.some((frame, index) => index > 0 && frame !== frameNumbers[index - 1] + 1)) {
  throw new Error('Render frames must be contiguous and use zero-padded filenames.');
}
const physical = JSON.parse(await fs.readFile(path.join(input, 'impacts.json'), 'utf8'));
if (physical.frameRange?.first !== frameNumbers[0] || physical.frameRange?.last !== frameNumbers.at(-1)
  || !(physical.frameRange.fps > 0) || !physical.impacts?.length) {
  throw new Error('Physical impacts and rendered frames must share one non-empty timeline.');
}
const impacts = physical.impacts.map((impact, index) => {
  // Mantaflow spray supplies positions, not measured radii. Its optional small
  // apertures use the explicitly labelled visual diameter from the renderer.
  const volume = impact.volumeM3 ?? (impact.secondary ? impact.visualVolumeApproxM3 : undefined);
  if (![impact.at, impact.imageX, impact.imageY, volume].every(Number.isFinite)
    || impact.at < 0 || impact.at > 1 || volume <= 0
    || impact.imageX < 0 || impact.imageX > 1 || impact.imageY < 0 || impact.imageY > 1) {
    throw new Error(`Invalid or offscreen physical landing: ${impact.id}`);
  }
  return { id: impact.id, at: impact.at, imageX: impact.imageX, imageY: impact.imageY,
    mass: volume * 1000, seed: index + 1, secondary: Boolean(impact.secondary) };
});
const first = await sharp(path.join(input, files[0])).metadata();
if (!first.hasAlpha) throw new Error('The render must include alpha; black is not a transparency key.');
const publicPrefix = '/cofein/intro/film';
const variants = [];
for (const [id, width] of [['mobile', Math.min(720, first.width)], ['desktop', Math.min(1200, first.width)]]) {
  const directory = path.join(output, id);
  await fs.mkdir(directory, { recursive: true });
  const height = Math.round(first.height * width / first.width);
  const frames = new Array(files.length);
  let totalBytes = 0;
  const pending = files.entries();
  // Independent WebP encodes are CPU-bound. Four workers keep packing bounded
  // while preserving filename order and the exact same encoded asset inputs.
  const encodeFrames = async () => {
    for (const [index, name] of pending) {
      const source = path.join(input, name);
      const metadata = await sharp(source).metadata();
      if (metadata.width !== first.width || metadata.height !== first.height || !metadata.hasAlpha) {
        throw new Error(`Inconsistent render dimensions or alpha: ${name}`);
      }
      // Public files bypass Vite's asset hashing. A new render must not reuse a
      // previous film's browser/CDN cache entry after the next design iteration.
      const fingerprint = createHash('sha256').update(await fs.readFile(source))
        .update(JSON.stringify({ width, height, ...encodingParams })).digest('hex').slice(0, 12);
      const filename = `${String(index).padStart(4, '0')}-${fingerprint}.webp`;
      const { data, info } = await sharp(source).resize(width, height).ensureAlpha().raw()
        .toBuffer({ resolveWithObject: true });
      if (info.channels !== 4) throw new Error(`Expected resized RGBA pixels: ${name}`);
      // Remove the finite shadow-catcher image boundary offline. RGB and every
      // alpha value outside the four fixed edge bands remain unchanged here.
      softenFrameEdges(data, width, height);
      const result = await sharp(data, { raw: { width, height, channels: 4 } }).webp(webpEncoding)
        .toFile(path.join(directory, filename));
      frames[index] = `${publicPrefix}/${id}/${filename}`;
      totalBytes += result.size;
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, files.length) }, encodeFrames));
  variants.push({ id, width, height, frames, totalBytes });
}
const manifest = {
  version: 1, fps: physical.frameRange.fps, frameCount: files.length,
  // The film includes the settled pool. Fade it in place; moving the full
  // image would lift that pool off the floor. Actual contact timing is supplied
  // by the final simulation and can refine these explicit packing parameters.
  framing, edgeTreatment,
  variants, impacts,
};
await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ frameCount: files.length, framing, edgeTreatment,
  variants: variants.map(({ id, width, height, totalBytes }) => ({ id, width, height, totalBytes })),
  impactCount: impacts.length }, null, 2));
