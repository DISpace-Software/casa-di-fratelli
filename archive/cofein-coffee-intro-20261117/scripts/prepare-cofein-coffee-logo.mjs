// Rasterize the existing outlined restaurant mark for the curved ceramic decal.
// Usage: node script OUTPUT.png SHARP_MODULE
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [output, sharpModule] = process.argv.slice(2);
assert(output && sharpModule, 'Provide output PNG and Sharp module path');
const { default: sharp } = await import(pathToFileURL(path.resolve(sharpModule)).href);
const source = fileURLToPath(new URL('../frontend/public/cofein/brand/cofein-lockup.svg', import.meta.url));
await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
await sharp(source).resize({ width: 2048 }).png().toFile(output);
console.log(JSON.stringify({ source, output: path.resolve(output), lettering: 'existing menu outlines, no substituted font' }));
