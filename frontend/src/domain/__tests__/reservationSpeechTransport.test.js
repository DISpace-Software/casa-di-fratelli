import test from 'node:test';
import assert from 'node:assert/strict';
import { getReservationSpeechCapabilities, transcribeReservationAudio } from '../reservations/reservationSpeechTransport.js';

test('speech upload preserves MP4 bytes and browser multipart boundary with the selected field/language', async () => {
  const controller = new AbortController();
  const text = await transcribeReservationAudio(async (url, options) => {
    assert.equal(url, 'https://api.example.test/api/admin/reservations/voice/transcribe');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers, undefined);
    assert.equal(options.signal, controller.signal);
    assert.equal(options.body.get('field'), 'phone');
    assert.equal(options.body.get('language'), 'bg');
    const file = options.body.get('audio');
    assert.equal(file.name, 'dictation.m4a');
    assert.equal(file.type, 'audio/mp4;codecs=mp4a.40.2');
    assert.equal(await file.text(), 'synthetic-audio');
    return Response.json({ text: '  0888123456  ' });
  }, 'https://api.example.test', { blob: new Blob(['synthetic-audio'], { type: 'audio/mp4;codecs=mp4a.40.2' }), language: 'bg-BG', field: 'phone', signal: controller.signal });
  assert.equal(text, '0888123456');
});

test('speech capabilities fail closed and normalize untrusted capability data', async () => {
  assert.deepEqual(await getReservationSpeechCapabilities(async () => new Response('', { status: 404 }), ''), { enabled: false, languages: [] });
  assert.deepEqual(await getReservationSpeechCapabilities(async () => Response.json({ enabled: 'true', languages: 'bg' }), ''), { enabled: false, languages: [] });
});

test('speech errors preserve stable codes without exposing service response details', async () => {
  await assert.rejects(transcribeReservationAudio(async () => Response.json({ code: 'busy', detail: 'private service information' }, { status: 429 }), '', { blob: new Blob(['audio'], { type: 'audio/webm' }), language: 'bg', field: 'guestName' }), error => error.code === 'busy' && !error.message.includes('private'));
  await assert.rejects(transcribeReservationAudio(async () => Response.json({ text: ' ' }), '', { blob: new Blob(['audio']), language: 'bg', field: 'guestName' }), error => error.code === 'no-speech');
});
