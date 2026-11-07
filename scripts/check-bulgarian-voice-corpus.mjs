import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parseVoiceReservation } from '../frontend/src/domain/reservations/voiceReservation.js';
import { bulgarianVoiceConversations, corpusCategories, bookingKeys } from '../frontend/src/domain/__tests__/fixtures/bulgarianVoiceConversations.js';

const output = process.argv[2] || '/Users/macbookpro/casa-di-fratelli/output/casa-voice-1000-20261107';
const failures = [], categories = {}, failedIds = new Set();
let stepsChecked = 0;
function compare(item, actual, expected, phase) {
  if (isDeepStrictEqual(actual.fields, expected.fields) && isDeepStrictEqual([...actual.issues].sort(), [...expected.issues].sort()) && isDeepStrictEqual(actual.missing, expected.missing)) return;
  failures.push({ id: item.id, category: item.category, phase, transcript: phase === 'final' ? item.transcript : item.steps[Number(phase.slice(9)) - 1].transcript, now: item.now, expected, actual });
  failedIds.add(item.id);
}
for (const item of bulgarianVoiceConversations) {
  compare(item, parseVoiceReservation(item.transcript, new Date(item.now), { language: 'bg-BG' }), item.expected, 'final');
  for (const [index, step] of (item.steps || []).entries()) {
    stepsChecked++;
    compare(item, parseVoiceReservation(step.transcript, new Date(item.now), { language: 'bg-BG' }), { fields: step.fields, issues: [], missing: bookingKeys.filter(key => !step.fields[key]) }, `fragment-${index + 1}`);
  }
}
for (const [category, expectedTotal] of Object.entries(corpusCategories)) {
  const items = bulgarianVoiceConversations.filter(item => item.category === category);
  categories[category] = { total: items.length, expectedTotal, passed: items.filter(item => !failedIds.has(item.id)).length, failed: items.filter(item => failedIds.has(item.id)).length };
}
const report = {
  syntheticTextOnly: true, realMicrophoneTested: false, acousticAccuracyMeasured: false,
  expectedValuesFromParser: false, total: bulgarianVoiceConversations.length,
  uniqueTranscripts: new Set(bulgarianVoiceConversations.map(item => item.transcript)).size,
  uniqueTranscriptsAndClocks: new Set(bulgarianVoiceConversations.map(item => `${item.now}|${item.transcript}`)).size,
  passed: bulgarianVoiceConversations.length - failedIds.size, failed: failedIds.size,
  intermediateStepsChecked: stepsChecked, categories, failures,
};
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'corpus-report.json'), JSON.stringify(report, null, 2) + '\n');
await fs.writeFile(path.join(output, 'corpus-scenarios.json'), JSON.stringify(bulgarianVoiceConversations, null, 2) + '\n');
console.log(JSON.stringify({ ...report, failures: failures.slice(0, 3), report: path.join(output, 'corpus-report.json') }, null, 2));
if (report.failed || report.total !== 1000 || report.uniqueTranscripts !== 1000 || report.uniqueTranscriptsAndClocks !== 1000) process.exitCode = 1;
