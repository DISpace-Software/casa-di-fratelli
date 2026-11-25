import { apiFetch as fetch } from '../../config/api';

export async function readErrorMessage(response, fallback) {
  const rawText = await response.text();

  try {
    const result = rawText ? JSON.parse(rawText) : null;
    return (typeof result === "string" ? result : result?.message) || rawText || fallback;
  } catch {
    return rawText || fallback;
  }
}

export async function fetchJsonOrEmpty(url, fallback, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, `Failed to load ${url}.`));
  }

  const rawText = await response.text();
  if (!rawText) return fallback;

  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error(`Invalid JSON from ${url}.`);
  }
}

