// Join observed primary and optional spray landings from the same physical film.
// Usage: node script PRIMARY.json SPRAY.json OUTPUT.json
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const [primaryFile, sprayFile, outputFile] = process.argv.slice(2);
assert(primaryFile && sprayFile && outputFile, 'Provide primary, spray and output paths');
const primary = JSON.parse(await fs.readFile(primaryFile, 'utf8'));
const spray = JSON.parse(await fs.readFile(sprayFile, 'utf8'));
for (const key of ['first', 'last', 'fps']) {
  assert.equal(primary.frameRange?.[key], spray.frameRange?.[key], `Mismatched ${key} in impact exports`);
}
assert(Array.isArray(primary.impacts) && Array.isArray(spray.impacts), 'Both exports need an impacts array');
assert(primary.impacts.length > 0, 'An observed primary landing is required to feed the broad reveal');
assert(spray.impacts.every(impact => impact.secondary), 'Spray contacts must be labelled secondary');
const impacts = [...primary.impacts, ...spray.impacts].sort((a, b) => a.at - b.at);
assert.equal(new Set(impacts.map(impact => impact.id)).size, impacts.length, 'Impact IDs must be unique');
await fs.writeFile(outputFile, `${JSON.stringify({
  frameRange: primary.frameRange,
  coordinateConvention: primary.coordinateConvention,
  impacts,
  provenance: {
    primary: primaryFile, spray: sprayFile,
    primaryCount: primary.impacts.length, sprayCount: spray.impacts.length,
    primaryVolume: 'reconstructed liquid mesh',
    sprayVolume: 'explicit visual approximation from rendered diameter; positions and contacts from solver cache',
  },
}, null, 2)}\n`);
console.log(JSON.stringify({ primary: primary.impacts.length, spray: spray.impacts.length, output: outputFile }));
