import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { buildStatsResponse, AppError } from '@currency/core';
import * as dynamo from './lib/dynamo.js';
import { ok, fail, logEvent } from './lib/respond.js';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const reqId = randomUUID();
  const startMs = Date.now();
  const requestOrigin = event.headers?.['origin'] ?? event.headers?.['Origin'];

  try {
    const item = await dynamo.getStats();
    const statsResponse = buildStatsResponse(item);

    const response = ok(statsResponse, requestOrigin);
    logEvent({ reqId, route: 'stats', status: 200, ms: Date.now() - startMs });
    return response;
  } catch (err) {
    const response = fail(err, requestOrigin);
    const status = err instanceof AppError ? err.httpStatus : 500;
    logEvent({ reqId, route: 'stats', status, ms: Date.now() - startMs });
    return response;
  }
};
