/// <reference path="./.sst/platform/config.d.ts" />

// SST v3 (Ion) configuration — requires `sst install` to generate
// the .sst/platform/config.d.ts type file before `pnpm typecheck` sees this.
//
// Deploy: sst secret set OpenExchangeRatesAppId <your-id>
//         sst deploy
//
// Local dev: sst dev (starts a local API proxy with live-reload)

export default $config({
  app(input) {
    return {
      name: 'currency-exchange',
      removal: input?.stage === 'production' ? 'retain' : 'remove',
      protect: ['production'].includes(input?.stage),
      home: 'aws',
    };
  },

  async run() {
    // ── Secrets ─────────────────────────────────────────────────────────────
    // The openexchangerates App ID is NEVER committed — set via:
    //   sst secret set OpenExchangeRatesAppId <your-id>
    const appIdSecret = new sst.Secret('OpenExchangeRatesAppId');

    // ── DynamoDB Tables ──────────────────────────────────────────────────────
    // Rate cache (1h TTL via DynamoDB TTL attribute)
    const rateCacheTable = new sst.aws.Dynamo('RateCache', {
      fields: {
        PK: 'string',
      },
      primaryIndex: { hashKey: 'PK' },
      ttl: 'ttl',
    });

    // Stats table (single aggregate item — no TTL)
    const statsTable = new sst.aws.Dynamo('Stats', {
      fields: {
        PK: 'string',
      },
      primaryIndex: { hashKey: 'PK' },
    });

    // ── Lambda Functions ─────────────────────────────────────────────────────
    // Each function gets ONLY the permissions it needs (no wildcards).

    const convertFn = new sst.aws.Function('ConvertFunction', {
      handler: 'packages/functions/src/convert.handler',
      link: [
        rateCacheTable, // read + write (cache get/put)
        statsTable, // write (record conversion)
        appIdSecret, // read (App ID for provider fetch)
      ],
      environment: {
        RATE_CACHE_TABLE: rateCacheTable.name,
        STATS_TABLE: statsTable.name,
      },
    });

    const currenciesFn = new sst.aws.Function('CurrenciesFunction', {
      handler: 'packages/functions/src/currencies.handler',
      link: [
        rateCacheTable, // read + write (currency list cache)
        appIdSecret, // read
      ],
      environment: {
        RATE_CACHE_TABLE: rateCacheTable.name,
      },
    });

    const statsFn = new sst.aws.Function('StatsFunction', {
      handler: 'packages/functions/src/stats.handler',
      link: [
        statsTable, // read only
      ],
      environment: {
        STATS_TABLE: statsTable.name,
      },
    });

    // ── API Gateway ──────────────────────────────────────────────────────────
    const api = new sst.aws.ApiGatewayV2('Api', {
      cors: {
        // Allowlist: deployed site origin injected at deploy time.
        // localhost:3000 included for local dev.
        allowOrigins: ['http://localhost:3000'],
        allowMethods: ['GET', 'OPTIONS'],
        allowHeaders: ['Content-Type'],
      },
      throttle: {
        // 20 rps steady-state, 40 burst — tune as needed.
        rate: 20,
        burst: 40,
      },
    });

    api.route('GET /api/convert', convertFn.arn);
    api.route('GET /api/currencies', currenciesFn.arn);
    api.route('GET /api/stats', statsFn.arn);

    // ── Next.js Site ─────────────────────────────────────────────────────────
    // The web app is linked to the API URL only — no table/secret access.
    const site = new sst.aws.Nextjs('Web', {
      path: 'web',
      environment: {
        // NEXT_PUBLIC_API_URL is read by web/lib/api.ts
        NEXT_PUBLIC_API_URL: api.url,
        // Allowlist the deployed site origin for CORS in the functions
        CORS_ALLOW_ORIGIN: site.url,
      },
    });

    return {
      api: api.url,
      site: site.url,
    };
  },
});
