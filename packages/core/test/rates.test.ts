import { describe, it, expect } from 'vitest';
import { cacheState, RATE_TTL_SECONDS, CURRENCY_TTL_SECONDS } from '../src/rates.js';

const BASE_ISO = '2026-06-17T12:00:00Z';
const BASE_MS = new Date(BASE_ISO).getTime();

describe('cacheState — rate TTL (3600s)', () => {
  it('returns "absent" when fetchedAt is null', () => {
    expect(cacheState(null, RATE_TTL_SECONDS, BASE_MS)).toBe('absent');
  });

  it('returns "fresh" when well within TTL', () => {
    // 1 second after fetchedAt — well within 3600s TTL
    const now = BASE_MS + 1000;
    expect(cacheState(BASE_ISO, RATE_TTL_SECONDS, now)).toBe('fresh');
  });

  it('returns "fresh" just under TTL boundary (1ms before expiry)', () => {
    const now = BASE_MS + RATE_TTL_SECONDS * 1000 - 1;
    expect(cacheState(BASE_ISO, RATE_TTL_SECONDS, now)).toBe('fresh');
  });

  it('returns "expired" at exact TTL boundary', () => {
    const now = BASE_MS + RATE_TTL_SECONDS * 1000;
    expect(cacheState(BASE_ISO, RATE_TTL_SECONDS, now)).toBe('expired');
  });

  it('returns "expired" well past TTL', () => {
    const now = BASE_MS + RATE_TTL_SECONDS * 1000 + 60000;
    expect(cacheState(BASE_ISO, RATE_TTL_SECONDS, now)).toBe('expired');
  });
});

describe('cacheState — currency TTL (86400s)', () => {
  it('returns "absent" when fetchedAt is null', () => {
    expect(cacheState(null, CURRENCY_TTL_SECONDS, BASE_MS)).toBe('absent');
  });

  it('returns "fresh" just under 24h', () => {
    const now = BASE_MS + CURRENCY_TTL_SECONDS * 1000 - 1;
    expect(cacheState(BASE_ISO, CURRENCY_TTL_SECONDS, now)).toBe('fresh');
  });

  it('returns "expired" at exactly 24h', () => {
    const now = BASE_MS + CURRENCY_TTL_SECONDS * 1000;
    expect(cacheState(BASE_ISO, CURRENCY_TTL_SECONDS, now)).toBe('expired');
  });
});
