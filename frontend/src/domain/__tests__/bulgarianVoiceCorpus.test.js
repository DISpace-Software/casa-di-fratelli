import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceReservation } from '../reservations/voiceReservation.js';
import { bulgarianVoiceConversations, corpusCategories, bookingKeys } from './fixtures/bulgarianVoiceConversations.js';

test('Bulgarian conversation corpus has exactly 1000 independently specified unique scenarios', () => {
  assert.equal(bulgarianVoiceConversations.length, 1000);
  assert.equal(new Set(bulgarianVoiceConversations.map(item => item.id)).size, 1000);
  assert.equal(new Set(bulgarianVoiceConversations.map(item => item.transcript)).size, 1000);
  assert.equal(new Set(bulgarianVoiceConversations.map(item => `${item.now}|${item.transcript}`)).size, 1000);
  assert.deepEqual(Object.fromEntries(Object.keys(corpusCategories).map(category => [category, bulgarianVoiceConversations.filter(item => item.category === category).length])), corpusCategories);
});

for (const category of Object.keys(corpusCategories)) {
  test(`Bulgarian conversation corpus: ${category}`, () => {
    const failures = [];
    for (const item of bulgarianVoiceConversations.filter(item => item.category === category)) {
      try {
        const result = parseVoiceReservation(item.transcript, new Date(item.now), { language: 'bg-BG' });
        assert.deepEqual(result.fields, item.expected.fields);
        assert.deepEqual([...result.issues].sort(), [...item.expected.issues].sort());
        assert.deepEqual(result.missing, item.expected.missing);
        for (const [index, step] of (item.steps || []).entries()) {
          const partial = parseVoiceReservation(step.transcript, new Date(item.now), { language: 'bg-BG' });
          assert.deepEqual(partial.fields, step.fields, `fragment ${index + 1}`);
          assert.deepEqual(partial.issues, [], `fragment ${index + 1}`);
          assert.deepEqual(partial.missing, bookingKeys.filter(key => !step.fields[key]));
        }
      } catch (error) { failures.push({ id: item.id, message: error.message }); }
    }
    assert.equal(failures.length, 0, JSON.stringify(failures.slice(0, 8), null, 2) + `\n${failures.length} failed in ${category}; run scripts/check-bulgarian-voice-corpus.mjs for full report.`);
  });
}
