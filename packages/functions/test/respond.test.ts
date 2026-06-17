import { describe, it, expect } from 'vitest';
import { ok, fail } from '../src/lib/respond.js';
import { AppError } from '@currency/core';

describe('ok()', () => {
  it('returns statusCode 200', () => {
    const res = ok({ foo: 'bar' });
    expect(res.statusCode).toBe(200);
  });

  it('serializes the body as JSON', () => {
    const res = ok({ result: '100.00' });
    expect(JSON.parse(res.body as string)).toEqual({ result: '100.00' });
  });

  it('includes security headers', () => {
    const res = ok({});
    expect(res.headers?.['X-Content-Type-Options']).toBe('nosniff');
    expect(res.headers?.['Referrer-Policy']).toBe('no-referrer');
    expect(res.headers?.['Strict-Transport-Security']).toContain('max-age=');
    expect(res.headers?.['Content-Security-Policy']).toBeDefined();
    expect(res.headers?.['Cache-Control']).toBe('no-store');
  });

  it('includes CORS header', () => {
    const res = ok({}, 'http://localhost:3000');
    expect(res.headers?.['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
  });

  it('CORS for non-allowlisted origin does not echo it back', () => {
    const res = ok({}, 'https://evil.com');
    expect(res.headers?.['Access-Control-Allow-Origin']).not.toBe('https://evil.com');
  });
});

describe('fail()', () => {
  it('uses AppError httpStatus for the status code', () => {
    const err = new AppError('INVALID_AMOUNT', 400, 'bad amount');
    const res = fail(err);
    expect(res.statusCode).toBe(400);
  });

  it('serializes error body as {error:{code,message}}', () => {
    const err = new AppError('MISSING_PARAM', 400, 'missing from');
    const res = fail(err);
    const body = JSON.parse(res.body as string) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('MISSING_PARAM');
    expect(body.error.message).toBe('missing from');
  });

  it('non-AppError → 500 INTERNAL with generic message (no stack trace)', () => {
    const res = fail(new Error('internal stuff'));
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body as string) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL');
    // Must not leak internal error message
    expect(body.error.message).not.toContain('internal stuff');
    // Must not have a stack field
    expect(Object.keys(body.error)).not.toContain('stack');
  });

  it('includes security headers on error responses', () => {
    const res = fail(new AppError('INTERNAL', 500, 'oops'));
    expect(res.headers?.['X-Content-Type-Options']).toBe('nosniff');
  });
});
