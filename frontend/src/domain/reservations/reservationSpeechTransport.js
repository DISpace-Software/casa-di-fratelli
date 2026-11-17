const endpoint = '/api/admin/reservations/voice';

export async function getReservationSpeechCapabilities(request, baseUrl, signal) {
  const response = await request(`${baseUrl}${endpoint}/capabilities`, { signal, cache: 'no-store' });
  if (!response.ok) return { enabled: false, languages: [] };
  const result = await response.json();
  return { enabled: result.enabled === true, languages: Array.isArray(result.languages) ? result.languages : [] };
}

export async function transcribeReservationAudio(request, baseUrl, { blob, language, field, signal }) {
  const body = new FormData();
  const type = blob.type.split(';')[0];
  const extension = type === 'audio/mp4' ? 'm4a' : type === 'audio/ogg' ? 'ogg' : type === 'audio/wav' ? 'wav' : 'webm';
  body.append('audio', blob, `dictation.${extension}`);
  body.append('language', language.split('-')[0]);
  body.append('field', field);
  const response = await request(`${baseUrl}${endpoint}/transcribe`, { method: 'POST', body, signal, cache: 'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error('Reservation speech request failed');
    error.code = result.code || (response.status === 401 ? 'unauthorized' : 'recognition-unavailable');
    throw error;
  }
  if (typeof result.text !== 'string' || !result.text.trim()) {
    const error = new Error('No speech recognized');
    error.code = 'no-speech';
    throw error;
  }
  return result.text.trim();
}
