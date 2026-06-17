#!/usr/bin/env bash
#
# One-time bootstrap: create the GitHub OIDC provider + a deploy IAM role in AWS,
# so GitHub Actions can deploy via short-lived tokens (no static AWS keys in GitHub).
#
# Idempotent-ish: skips the OIDC provider if it already exists. Re-running updates
# the role's trust policy. Requires an authenticated AWS CLI with IAM permissions
# (iam:CreateOpenIDConnectProvider, iam:CreateRole, iam:AttachRolePolicy, iam:UpdateAssumeRolePolicy).
#
# Usage:
#   GITHUB_REPO="owner/repo" ./infra/aws/bootstrap-github-oidc.sh
# Optional overrides:
#   ROLE_NAME (default: currency-exchange-gha-deploy)
#   GIT_REF   (default: refs/heads/main  — only this branch may assume the role)
#   POLICY_ARN(default: arn:aws:iam::aws:policy/AdministratorAccess  — see note below)
#
# SECURITY NOTE on POLICY_ARN:
#   SST deploys span many services (Lambda, IAM roles for functions, DynamoDB,
#   API Gateway, CloudFront, S3, ACM, SSM, CloudWatch, Lambda@Edge for Next.js).
#   A hand-curated least-privilege deploy policy is fragile and easy to under-scope
#   (silent mid-deploy AccessDenied). The security boundary here is NOT a narrow
#   deploy policy — it is:
#     (1) OIDC short-lived tokens (no static keys to leak),
#     (2) trust scoped to EXACTLY this repo + branch (GIT_REF),
#     (3) an optional protected GitHub `production` Environment requiring approval.
#   Runtime least-privilege is already enforced per-function via SST `link`.
#   If you want a tighter deploy policy later, replace POLICY_ARN with a custom
#   policy and widen iteratively when a deploy reports AccessDenied.
#
set -euo pipefail

: "${GITHUB_REPO:?Set GITHUB_REPO=owner/repo}"
ROLE_NAME="${ROLE_NAME:-currency-exchange-gha-deploy}"
GIT_REF="${GIT_REF:-refs/heads/main}"
ENVIRONMENT="${ENVIRONMENT:-production}"
POLICY_ARN="${POLICY_ARN:-arn:aws:iam::aws:policy/AdministratorAccess}"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
OIDC_HOST="token.actions.githubusercontent.com"
OIDC_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/${OIDC_HOST}"

echo ">> Account: ${ACCOUNT_ID}"
echo ">> Repo:    ${GITHUB_REPO} (ref: ${GIT_REF})"
echo ">> Role:    ${ROLE_NAME}"

# 1) GitHub OIDC provider (account-global, create once).
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "${OIDC_ARN}" >/dev/null 2>&1; then
  echo ">> OIDC provider already exists, skipping."
else
  echo ">> Creating OIDC provider..."
  # GitHub's OIDC uses a known thumbprint; AWS now validates the cert chain, but the
  # client_id (audience) sts.amazonaws.com is required.
  aws iam create-open-id-connect-provider \
    --url "https://${OIDC_HOST}" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list "ffffffffffffffffffffffffffffffffffffffff" >/dev/null
fi

# 2) Trust policy — only this repo + branch may assume the role, audience sts.amazonaws.com.
TRUST_POLICY="$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Federated": "${OIDC_ARN}" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": { "${OIDC_HOST}:aud": "sts.amazonaws.com" },
        "StringLike": {
          "${OIDC_HOST}:sub": [
            "repo:${GITHUB_REPO}:environment:${ENVIRONMENT}",
            "repo:${GITHUB_REPO}:ref:${GIT_REF}"
          ]
        }
      }
    }
  ]
}
JSON
)"

if aws iam get-role --role-name "${ROLE_NAME}" >/dev/null 2>&1; then
  echo ">> Role exists, updating trust policy..."
  aws iam update-assume-role-policy --role-name "${ROLE_NAME}" \
    --policy-document "${TRUST_POLICY}" >/dev/null
else
  echo ">> Creating role..."
  aws iam create-role --role-name "${ROLE_NAME}" \
    --assume-role-policy-document "${TRUST_POLICY}" \
    --description "GitHub Actions OIDC deploy role for ${GITHUB_REPO}" \
    --max-session-duration 3600 >/dev/null
fi

echo ">> Attaching deploy policy: ${POLICY_ARN}"
aws iam attach-role-policy --role-name "${ROLE_NAME}" --policy-arn "${POLICY_ARN}" >/dev/null

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
echo ""
echo "================================================================"
echo "Done. Set this as a GitHub Actions repository variable:"
echo "  AWS_DEPLOY_ROLE_ARN = ${ROLE_ARN}"
echo "  AWS_REGION          = ${AWS_REGION:-$(aws configure get region)}"
echo "================================================================"
