#!/usr/bin/env bash
# Deploy Nudge's api/ to Vercel production, safely:
#   bash api/_deploy-prod.sh            # deploys origin/integration
#   bash api/_deploy-prod.sh <commit>   # deploys a specific merged commit
#
# Why not `vercel --prod`: it uploads whatever branch this folder has checked out
# (on 2026-10-18 that put an unmerged branch live and api/stt returned 500), and it
# sends the commit author, which Hobby blocks unless it's Sam. This script deploys a
# git-free export of the commit (no .git, no .env*, nothing uncommitted), then checks
# both endpoints. Needs: `vercel login` as a member of la-hacks-team, and SSH access to GitHub.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

REPO=git@github.com:SamVD/LA_AI_HACKS_26_TEAM.git
SCOPE=la-hacks-team
BASE=https://nudge-seven-psi.vercel.app
ORIGIN=http://localhost:5173

git fetch -q "$REPO" '+refs/heads/*:refs/remotes/origin/*'
REF=${1:-origin/integration}
SHA=$(git rev-parse --short "$REF^{commit}")
echo "Deploying $REF ($SHA): $(git log -1 --format=%s "$SHA")"

[ -f .vercel/project.json ] || vercel link --yes --project nudge --scope "$SCOPE" >/dev/null
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT
git archive "$SHA" | tar -x -C "$OUT"
mkdir -p "$OUT/.vercel" && cp .vercel/project.json "$OUT/.vercel/"
printf '{"framework":"vite"}\n' > "$OUT/vercel.json"
BAD=$(cd "$OUT" && ls -a | grep -E '^\.git$|^\.env' | grep -vxE '\.env\.production|\.env\.example' || true)
if [ -n "$BAD" ]; then echo "refusing: secret-looking files in the export: $BAD" >&2; exit 1; fi

(cd "$OUT" && vercel deploy --prod --yes --scope "$SCOPE" < /dev/null >/dev/null)

check() { # name, expected status, curl args...
  local name=$1 want=$2; shift 2
  local got; got=$(curl -s -o /dev/null -w '%{http_code}' "$@")
  if [ "$got" = "$want" ]; then echo "  ok   $name ($got)"; else echo "  FAIL $name (got $got, want $want)"; FAILED=1; fi
}
FAILED=0
echo "Checking $BASE"
check 'api/stt token' 200 -X POST -H "origin: $ORIGIN" -d '{"type":"batch_scribe"}' "$BASE/api/stt/token"
check 'api/stt foreign origin' 403 -X POST -H 'origin: https://example.invalid' -d '{"type":"batch_scribe"}' "$BASE/api/stt/token"
check 'api/predict preflight' 204 -X OPTIONS -H "origin: $ORIGIN" "$BASE/api/predict"
check 'api/predict bad body' 400 -X POST -H "origin: $ORIGIN" -d '{}' "$BASE/api/predict"
[ "$FAILED" = 0 ] && echo "Production = $SHA" || { echo "Deployed $SHA but checks failed; see: vercel logs --deployment <url> --scope $SCOPE" >&2; exit 1; }
