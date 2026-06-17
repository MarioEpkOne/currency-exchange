import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateItemCommand } from '@aws-sdk/client-dynamodb';

// Capture calls to DynamoDBClient.send via prototype spy.
// We must set up the spy before importing dynamo (which creates the client at module init).
// vitest hoists vi.mock, so we mock the modules here; the spy is set up in beforeEach.

vi.mock('@aws-sdk/lib-dynamodb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/lib-dynamodb')>();
  return {
    ...actual,
    DynamoDBDocumentClient: {
      ...actual.DynamoDBDocumentClient,
      from: vi.fn().mockReturnValue({ send: vi.fn().mockResolvedValue({}) }),
    },
  };
});

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { recordConversion, getStats } from '../src/lib/dynamo.js';

describe('recordConversion — no native-float precision loss', () => {
  let sendSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    sendSpy = vi.spyOn(DynamoDBClient.prototype, 'send').mockResolvedValue({} as never);
  });

  it('passes usdValue as { N: decimalString } — not through Number()', async () => {
    // 17 significant digits — a JS float would lose the last digit
    const highPrecisionUsd = '12345678901234.56';

    await recordConversion('EUR', highPrecisionUsd);

    expect(sendSpy).toHaveBeenCalledOnce();

    // Extract the UpdateItemCommand input from the captured call
    const command = sendSpy.mock.calls[0]?.[0] as UpdateItemCommand;
    const values = command.input.ExpressionAttributeValues ?? {};

    // :usd must be a raw DynamoDB { N: string } attribute — not a JS number
    expect(values[':usd']).toEqual({ N: highPrecisionUsd });
    expect(typeof values[':usd']).not.toBe('number');
  });

  it('exact decimal string is preserved unchanged in the :usd attribute', async () => {
    // Another high-precision value that native floats cannot represent exactly
    const preciseUsd = '99999999999999.99';

    await recordConversion('JPY', preciseUsd);

    const command = sendSpy.mock.calls[0]?.[0] as UpdateItemCommand;
    const values = command.input.ExpressionAttributeValues ?? {};

    expect((values[':usd'] as { N: string }).N).toBe(preciseUsd);
  });
});

describe('recordConversion — atomic flat counter, no nested map path', () => {
  let sendSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    sendSpy = vi.spyOn(DynamoDBClient.prototype, 'send').mockResolvedValue({} as never);
  });

  it('increments a top-level tc_<CUR> attribute with ADD (no targetCounts.<x> path)', async () => {
    // The nested `SET targetCounts.#cur` form fails on the first write because the
    // parent map does not exist — this guards against that regression.
    await recordConversion('EUR', '12.34');

    const command = sendSpy.mock.calls[0]?.[0] as UpdateItemCommand;
    const expr = command.input.UpdateExpression ?? '';

    expect(expr).toContain('ADD');
    expect(expr).not.toContain('targetCounts');
    expect(command.input.ExpressionAttributeNames?.['#tc']).toBe('tc_EUR');
  });
});

describe('getStats — reconstructs targetCounts, keeps money exact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when the aggregate item does not exist', async () => {
    vi.spyOn(DynamoDBClient.prototype, 'send').mockResolvedValue({} as never);

    expect(await getStats()).toBeNull();
  });

  it('rebuilds { CUR: count } from tc_ attributes and reads totalSumUSD as an exact string', async () => {
    vi.spyOn(DynamoDBClient.prototype, 'send').mockResolvedValue({
      Item: {
        PK: { S: 'STATS#GLOBAL' },
        totalCount: { N: '3' },
        // 16+ significant digits — must survive as a string, never a JS float
        totalSumUSD: { N: '12345678901234.56' },
        tc_EUR: { N: '2' },
        tc_JPY: { N: '1' },
      },
    } as never);

    expect(await getStats()).toEqual({
      totalCount: 3,
      totalSumUSD: '12345678901234.56',
      targetCounts: { EUR: 2, JPY: 1 },
    });
  });
});
