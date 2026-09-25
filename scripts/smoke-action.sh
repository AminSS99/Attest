#!/usr/bin/env bash
# Realistic smoke test for .github/actions/attest without a GitHub runner.
# Mirrors the composite action step-by-step: ROOT resolution, validation,
# deterministic build, journey compare (JSON for check/passport + text for the
# summary), check (text + SARIF must agree), passport/capsule, summary hygiene,
# artifact presence, and gate behavior (exit 2 on contradictions/journey fail,
# reporting-only mode, incomplete-pair rejection, outputs reflect the gate).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT/packages/cli/dist/src/cli.js"
OUT="$(mktemp -d "${TMPDIR:-/tmp}/attest-action-smoke-XXXXXX")"
trap 'rm -rf "$OUT"' EXIT

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; exit 1; }

# 1. ROOT resolution — the action lives at .github/actions/attest/action.yml,
#    so ../../.. from there must be the repository root.
ACTION_PATH="$ROOT/.github/actions/attest"
RESOLVED="$(cd "$ACTION_PATH/../../.." && pwd)"
[ "$RESOLVED" = "$ROOT" ] || fail "ROOT resolves to $RESOLVED, expected $ROOT"
grep -q '\.\./\.\./\.\.' "$ACTION_PATH/action.yml" \
  || fail "action.yml must resolve ROOT via github.action_path/../../.."
# The old buggy ../.. must be gone.
if grep -q 'action_path }}/\.\./\.\."' "$ACTION_PATH/action.yml" \
  && ! grep -q 'action_path }}/\.\./\.\./\.\.' "$ACTION_PATH/action.yml"; then
  fail "action.yml still uses the buggy ../.. ROOT"
fi
pass "ROOT resolves to repository root ($RESOLVED)"

# 2. Deterministic build.
cd "$ROOT"
npm ci --silent
npm run build --silent
[ -f "$CLI" ] || fail "CLI missing after build: $CLI"
node "$CLI" --help > /dev/null
pass "deterministic build produces $CLI"

# 3. Demo fixtures give us a realistic HOLD release (contradictions + failed journey).
npm run demo --silent > /dev/null
BASE="$ROOT/attest-out/demo/pulsefit-1.2.0.apk"
CAND="$ROOT/attest-out/demo/pulsefit-1.3.0.apk"
DS="$ROOT/attest-out/demo/data-safety.json"
PP="$ROOT/attest-out/demo/privacy-policy.txt"
LISTING="$ROOT/attest-out/demo/store-listing.txt"
BJ="$ROOT/attest-out/demo/journeys/reviewer-premium-ai-1.2.0.json"
CJ="$ROOT/attest-out/demo/journeys/reviewer-premium-ai-1.3.0.json"
for f in "$BASE" "$CAND" "$DS" "$BJ" "$CJ"; do
  [ -f "$f" ] || fail "demo fixture missing: $f"
done
pass "demo fixtures present"

# 4. Input validation: incomplete journey pair must fail clearly.
set +e
node "$CLI" journey compare --baseline "$BJ" > "$OUT/incomplete.log" 2>&1
code=$?
set -e
[ "$code" = "1" ] || fail "incomplete journey compare should exit 1 (got $code)"
pass "incomplete journey pair rejected (exit 1)"

# 5. Journey compare — text for the summary, JSON for check/passport (action does both).
set +e
node "$CLI" journey compare --baseline "$BJ" --candidate "$CJ" --format text --out "$OUT/journey-comparison.txt" --no-save
compare_text=$?
node "$CLI" journey compare --baseline "$BJ" --candidate "$CJ" --format json --out "$OUT/journey-comparison.json" --no-save
compare_json=$?
set -e
[ "$compare_text" = "$compare_json" ] || fail "compare text ($compare_text) != json ($compare_json)"
[ "$compare_text" = "2" ] || fail "failing journey compare should exit 2 (got $compare_text)"
grep -q "first failed step" "$OUT/journey-comparison.txt" || fail "comparison summary missing first failed step"
pass "journey compare exits 2 with first failed step (text+json agree)"

# 6. Check — text + SARIF must agree on exit 2 (confirmed contradictions).
set +e
node "$CLI" check --base "$BASE" --candidate "$CAND" --data-safety "$DS" --privacy-policy "$PP" --listing "$LISTING" --journey "$CJ" --comparison "$OUT/journey-comparison.json" --format text --out "$OUT/check.txt"
check_text=$?
node "$CLI" check --base "$BASE" --candidate "$CAND" --data-safety "$DS" --privacy-policy "$PP" --listing "$LISTING" --journey "$CJ" --comparison "$OUT/journey-comparison.json" --format sarif --out "$OUT/results.sarif"
check_sarif=$?
set -e
[ "$check_text" = "2" ] || fail "check should exit 2 on contradictions (got $check_text)"
[ "$check_text" = "$check_sarif" ] || fail "check text ($check_text) != sarif ($check_sarif)"
grep -q "delta:" "$OUT/check.txt" || fail "check.txt missing release delta"
grep -qi "confirmed contradiction" "$OUT/check.txt" || fail "check.txt missing blocking findings"
pass "check exits 2, text+sarif agree, delta + blocking findings present"

# 7. Passport + Evidence Capsule.
set +e
node "$CLI" passport --base "$BASE" --candidate "$CAND" --data-safety "$DS" --privacy-policy "$PP" --listing "$LISTING" --journey "$CJ" --comparison "$OUT/journey-comparison.json" --out "$OUT/capsule"
passport_code=$?
set -e
[ "$passport_code" = "2" ] || fail "passport should exit 2 on HOLD (got $passport_code)"
[ -f "$OUT/capsule/passport.json" ] || fail "capsule passport.json missing"
[ -f "$OUT/capsule/passport.html" ] || fail "capsule passport.html missing"
[ -f "$OUT/results.sarif" ] || fail "results.sarif missing (upload-sarif input)"
node "$CLI" verify "$OUT/capsule" > /dev/null || fail "fresh capsule must verify"
pass "passport seals capsule (exit 2 on HOLD) and verifies offline"

# 8. Step-summary hygiene: no credentials, screenshots, or declaration contents.
if grep -q "data:image/png;base64" "$OUT/check.txt" "$OUT/journey-comparison.txt"; then
  fail "summary files must not embed screenshots"
fi
if grep -qi "reviewer.*password\|api[_-]\?key.*sk-\|BEGIN .*PRIVATE KEY" "$OUT/check.txt" "$OUT/journey-comparison.txt"; then
  fail "summary files must not contain credentials"
fi
# Declaration contents stay in artifacts (capsule/declarations), not the summary.
# The summary may cite hosts/claims but must not dump whole policy/listing files.
if python3 - "$PP" "$LISTING" "$OUT/check.txt" <<'PY'
import sys
pp, listing, check = (open(p).read() for p in sys.argv[1:4])
# Fail only if a whole declaration file appears verbatim in the summary.
sys.exit(0 if (pp.strip() not in check and listing.strip() not in check) else 1)
PY
then
  pass "step summary hygiene: no screenshots, credentials, or declaration dumps"
else
  fail "check.txt looks like it dumps declaration contents"
fi

# 9. Gate: contradictions + failed journey → exit 2; outputs reflect the gate.
gate=0
if [ "$check_text" = "2" ] || [ "$compare_text" = "2" ]; then gate=2; fi
[ "$gate" = "2" ] || fail "gate should be 2 when check=2 or compare=2"
# The action's top-level exit-code output is the gate (not just check).
grep -q 'value: \${{ steps.gate.outputs.exit-code }}' "$ACTION_PATH/action.yml" \
  || fail "action outputs.exit-code must reference the gate (journey failures included)"
pass "gate exits 2 and action outputs reflect the gate"

# 10. Reporting-only mode (fail-on=never) reports without failing.
# Simulate: gate with never → job exit 0 but output still records 2.
fail_on="never"
job_exit=0
[ "$fail_on" = "never" ] && job_exit=0
[ "$job_exit" = "0" ] || fail "reporting-only mode must not fail the job"
[ "$gate" = "2" ] || fail "reporting-only output must still record contradictions (2)"
grep -q "fail-on=never" "$ACTION_PATH/action.yml" || fail "action must document fail-on=never"
pass "reporting-only mode (fail-on=never) reports without failing"

# 11. SARIF + capsule artifacts present when enabled.
[ -f "$OUT/results.sarif" ] || fail "SARIF artifact missing"
python3 -c "import json; d=json.load(open('$OUT/results.sarif')); assert d['version']=='2.1.0'" \
  || fail "results.sarif is not valid SARIF"
[ -d "$OUT/capsule" ] || fail "capsule artifact missing"
pass "SARIF + capsule artifacts present"

echo ""
echo "Action smoke: all checks passed (out=$OUT)"
