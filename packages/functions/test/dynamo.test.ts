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
import { recordConversion } from '../src/lib/dynamo.js';

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
