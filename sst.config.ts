/// <reference path="./.sst/platform/config.d.ts" />

// SST v4 configuration. The .sst/platform/config.d.ts type file is generated on the
// first `sst` run (e.g. `sst dev`/`sst deploy`) before `pnpm typecheck` sees this.
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

    // ── API Gateway ──────────────────────────────────────────────────────────
    // Defined before the site so api.url is available for the site's
    // NEXT_PUBLIC_API_URL env var. Routes are wired after the functions are defined.
    const api = new sst.aws.ApiGatewayV2('Api', {
      // CORS is owned by the Lambda layer (respond.ts), which echoes an allowlisted
      // origin per request (the deployed site via CORS_ALLOW_ORIGIN + localhost:3000) —
      // never a wildcard. Gateway-managed CORS is disabled because it would otherwise
      // STRIP the Lambda's Access-Control-Allow-Origin header, and it cannot reference
      // site.url here (the site is defined after the api so it can consume api.url).
      // All routes are simple GETs, so no browser preflight is required.
      cors: false,
      throttle: {
        // 20 rps steady-state, 40 burst — tune as needed.
        rate: 20,
        burst: 40,
      },
    });

    // ── Next.js Site ─────────────────────────────────────────────────────────
    // Defined before the Lambda functions so that site.url (an Output<string>)
    // can be referenced in each function's CORS_ALLOW_ORIGIN environment variable
    // without a use-before-assignment self-reference.
    // The web app is linked to the API URL only — no table/secret access.
    const site = new sst.aws.Nextjs('Web', {
      path: 'web',
      environment: {
        // NEXT_PUBLIC_API_URL is read by web/lib/api.ts
        NEXT_PUBLIC_API_URL: api.url,
      },
    });

    // ── Lambda Functions ─────────────────────────────────────────────────────
    // Defined after the site so site.url can be injected as CORS_ALLOW_ORIGIN.
    // CORS_ALLOW_ORIGIN is read by respond.ts in each function — it must live in
    // the function environment, not the site environment.
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
        CORS_ALLOW_ORIGIN: site.url,
        // provider.ts reads the App ID from this env var. `link` alone exposes the
        // secret via the SST Resource object, NOT as a plain env var — so we map it
        // here. Backend-only: never added to the `site`, so it can't reach the bundle.
        OPENEXCHANGERATES_APP_ID: appIdSecret.value,
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
        CORS_ALLOW_ORIGIN: site.url,
        // See ConvertFunction: map the linked Secret to the env var provider.ts reads.
        OPENEXCHANGERATES_APP_ID: appIdSecret.value,
      },
    });

    const statsFn = new sst.aws.Function('StatsFunction', {
      handler: 'packages/functions/src/stats.handler',
      link: [
        statsTable, // read only
      ],
      environment: {
        STATS_TABLE: statsTable.name,
        CORS_ALLOW_ORIGIN: site.url,
      },
    });

    // Wire API routes (after functions are defined)
    api.route('GET /api/convert', convertFn.arn);
    api.route('GET /api/currencies', currenciesFn.arn);
    api.route('GET /api/stats', statsFn.arn);

    return {
      api: api.url,
      site: site.url,
    };
  },
});
