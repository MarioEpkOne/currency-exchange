# AWS Deployment & CI/CD

Production deployment runbook for the Currency Exchange app. The security model is
**no static AWS keys anywhere in GitHub** — CI/CD authenticates to AWS with short-lived
OIDC tokens, and the openexchangerates App ID lives only in AWS SSM (never in the repo or GitHub).

## Architecture

```
GitHub Actions (main, after CI green)
   │  OIDC token (short-lived, scoped to this repo+branch)
   ▼
AWS IAM role  currency-exchange-gha-deploy   ← trust: repo:OWNER/REPO:ref:refs/heads/main
   │  sts:AssumeRoleWithWebIdentity
   ▼
sst deploy --stage production
   ├─ DynamoDB (RateCache + Stats)        per-function least-privilege via SST `link`
   ├─ Lambda x3 (convert/currencies/stats)
   ├─ API Gateway (throttled, CORS)
   ├─ Next.js site (CloudFront + S3)
   └─ Secret OpenExchangeRatesAppId  ← resolved from SSM at deploy time
```

Two distinct AWS identities, on purpose:

| Identity                                | Type                  | Used for                                        | Keys                        |
| --------------------------------------- | --------------------- | ----------------------------------------------- | --------------------------- |
| `sst-deploy` IAM user                   | long-lived access key | **manual/local** deploys from a trusted machine | stay local, never in GitHub |
| `currency-exchange-gha-deploy` IAM role | OIDC, no keys         | **CI/CD** deploys from GitHub Actions           | none — short-lived tokens   |

## One-time setup

### 1. Set the provider secret (never enters GitHub)

Stored encrypted in AWS SSM Parameter Store for the `production` stage; every deploy
(local and CI) reads it from there.

```bash
pnpm sst secret set OpenExchangeRatesAppId <your-app-id> --stage production
```

### 2. Create the GitHub OIDC provider + deploy role

```bash
GITHUB_REPO="OWNER/REPO" ./infra/aws/bootstrap-github-oidc.sh
```

Prints the `AWS_DEPLOY_ROLE_ARN` to use in the next step. The role's trust policy only
allows **this repo's `main` branch** to assume it. See the script header for the policy
scoping rationale (security boundary = OIDC + trust scope + environment gate, not a narrow
deploy policy).

### 3. Add two GitHub repository variables (Settings → Secrets and variables → Actions → Variables)

Neither is a credential — both are safe as plain repo **variables**:

| Variable              | Value                                        |
| --------------------- | -------------------------------------------- |
| `AWS_DEPLOY_ROLE_ARN` | the role ARN printed by the bootstrap script |
| `AWS_REGION`          | `eu-central-1`                               |

### 4. (Recommended) Protect the `production` environment

Settings → Environments → `production` → require a reviewer. Then every CI-green push to
`main` waits for a one-click approval before it deploys.

## Deploy flows

- **CI/CD (automatic):** push to `main` → `ci` workflow runs the full gate → on success the
  `deploy` workflow assumes the OIDC role and runs `sst deploy --stage production`.
- **Manual (from a trusted machine with the `sst-deploy` keys):**
  ```bash
  pnpm sst deploy --stage production
  ```

## Teardown (non-production stages only)

`production` is `protect`ed and uses `removal: retain` (see `sst.config.ts`), so it will not
be torn down accidentally. Ephemeral stages:

```bash
pnpm sst remove --stage <name>
```
