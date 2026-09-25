# Attest Design-Partner Pilot Kit (Android, Weeks 7–8)

> **Prove your mobile release matches its promises.**

This kit runs a five-team Android pilot on real release candidates. No hosted
dashboard, no iOS IPA support, no automated device execution, no AI features,
no Policy Time Machine, and no new signature module in this milestone — just
the local CLI, the reusable GitHub Action, and the Evidence Capsule.

Attest is not legal advice and never promises store approval. It produces
traceable technical evidence so a human can make the ship/hold call.

---

## 1. Installation and five-minute first run

Requires Node.js ≥ 20. No source code upload; analysis stays on your machine.

```bash
npm install -g attest-cli   # or: npm ci && npm run build in this repo
attest --help

# In your app repo:
attest init
attest doctor               # fix blocking FAILs until only WARNs remain
```

Five-minute path with the bundled PulseFit demo (shows the MVP signature —
new SDK + permission + destination missing from declarations, reviewer journey
failing at step 4, HOLD → repair → SHIP):

```bash
npm run demo
open attest-out/demo/capsule/passport.html
node packages/cli/dist/src/cli.js verify attest-out/demo/capsule
```

Then on your own builds (see §2 for inputs):

```bash
attest check --base artifacts/last-shipped.apk --candidate artifacts/candidate.apk \
  --data-safety .attest/declarations/data-safety.json \
  --privacy-policy .attest/declarations/privacy-policy.txt \
  --listing .attest/declarations/store-listing.txt

attest passport --base artifacts/last-shipped.apk --candidate artifacts/candidate.apk \
  --data-safety .attest/declarations/data-safety.json \
  --journey journeys/reviewer-premium-ai-1.3.0.json \
  --out attest-out/capsule
attest verify attest-out/capsule
```

`check`, `journey compare`, `passport`, and `decide` exit `2` on confirmed
contradictions, failed journeys, or a human `hold` (CI-gateable); `0`
otherwise; `1` on usage/runtime errors. `doctor` exits `1` on blocking setup
errors.

---

## 2. Required Android artifacts and declarations

Place these under version control or a shared pilot folder (no secrets):

| Input | Where it comes from | Attest flag |
| --- | --- | --- |
| Last-shipped base AAB/APK | Play Console → previous release | `--base` |
| Release-candidate AAB/APK | Your Gradle `assembleRelease` output | `--candidate` |
| Data Safety answers | Play Console → Data Safety export, converted to `.attest/declarations/data-safety.json` (JSON or CSV) | `--data-safety` |
| Privacy-policy text | Current policy as plain UTF-8 | `--privacy-policy` |
| Store-listing copy | Current Play listing title + description as plain UTF-8 | `--listing` |
| Reviewer journeys (optional but recommended) | `attest journey record` over ADB (see §3) | `--journey` + `--comparison` |

`attest init` creates the templates:

```text
.attest/config.json
.attest/declarations/data-safety.json
.attest/declarations/privacy-policy.txt
.attest/declarations/store-listing.txt
.attest/journeys/  (or top-level journeys/)
.attest/github-workflow.yml  (sample CI)
attest-out/  (gitignored outputs)
```

Data Safety JSON shape (`attest.data-safety/1`):

```json
{
  "schemaVersion": "attest.data-safety/1",
  "collectedDataTypes": [{ "id": "location.precise_location" }],
  "sdkDisclosures": ["Firebase Analytics"],
  "domains": ["api.example.com"],
  "effectiveDate": "2026-09-24"
}
```

CSV is also accepted (`kind,value,details` with `data_type|sdk|domain` rows).
The five truth-gap rules (TG-001…TG-005) plus journey rules (JT-001/JT-002)
cite exact comparisons and evidence classes (`observed` / `declared` /
`attested` / `inferred` / `missing`); findings are content-addressed and
deterministic.

Release Decision Workflow (human owns the call):

```bash
# Time-boxed exception for one finding — overlays evidence, never rewrites it.
# Binds to the finding id + candidate artifact hash; requires owner, rationale,
# approver, approval time (now), and a future expiry.
attest exception accept --passport attest-out/capsule/passport.json \
  --finding F-xxxxxxxxxxxxxxxx --owner "Mobile Platform" \
  --reason "Temporary migration window" --expires 2026-10-15 \
  --approved-by "Release Lead"

# Final ship/hold. Shipping over HOLD or REVIEW requires --reason.
# Writes a new file; corrections to a finalized Passport bump revision + supersedes.
attest decide --passport attest-out/capsule/passport.json --status ship \
  --decided-by "Release Lead" --reason "Reviewed remaining evidence" \
  --out attest-out/approved-passport.json
attest verify attest-out/capsule   # exceptions + decision are sealed; edits fail
```

---

## 3. Reviewer Twin setup

Human-guided only in this milestone: you perform each step by hand; Attest
captures screenshot, activity, expected/observed state, and pass/fail/blocked.

Prerequisites:

- Android platform-tools on `PATH` (`adb version` works).
- One emulator or device with the candidate build installed.
- A reviewer test account reference — **label + expiry only** (e.g. `"reviewer
  account (vault ref)"`, expires `2027-01-15`). Secrets never enter journeys,
  Passports, or Capsules.

```bash
adb devices   # serial must show as "device"

attest journey record --device emulator-5554 --name reviewer-premium-ai \
  --title "Reviewer reaches premium AI feature" \
  --credential-label "reviewer account (vault ref)" --credential-expires 2027-01-15 \
  --artifact artifacts/candidate.apk --out journeys/

# Re-run on the next build, then diff against the approved baseline:
attest journey compare --baseline journeys/reviewer-premium-ai-1.2.0.json \
  --candidate journeys/reviewer-premium-ai-1.3.0.json
attest journey instructions --journey journeys/reviewer-premium-ai-1.3.0.json \
  --baseline journeys/reviewer-premium-ai-1.2.0.json --out reviewer-instructions.html
```

- A failed/incomplete run becomes a `JT-001` confirmed contradiction (blocks).
- A passing-but-edited run becomes `JT-002` (review).
- Credential readiness (`ready` / `expiring_soon` / `expired`) is checked from
  the reference; `attest doctor` flags expired/expiring credentials.
- Screenshots and `comparison.json` seal into the Capsule under
  `journeys/<id>/…`; `attest verify` covers every byte.

---

## 4. CI setup

Use the reusable composite action at `.github/actions/attest` (sample in
`examples/github-action.yml` and `.attest/github-workflow.yml`):

```yaml
- name: Attest release-truth gate
  uses: ./.github/actions/attest
  with:
    base: .attest/artifacts/base.apk
    candidate: app/build/outputs/apk/release/app-release.apk
    data-safety: .attest/declarations/data-safety.json
    privacy-policy: .attest/declarations/privacy-policy.txt
    listing: .attest/declarations/store-listing.txt
    baseline-journey: journeys/reviewer-premium-ai-1.2.0.json
    candidate-journey: journeys/reviewer-premium-ai-1.3.0.json
```

What it does:

- Resolves the Attest source (`github.action_path/../../..`), builds with
  `npm ci && npm run build`, verifies the CLI exists.
- Validates inputs (missing artifacts, incomplete journey pairs, bad
  `fail-on`) and fails clearly (exit 1).
- Runs `journey compare` first (text for the summary + JSON feeding
  `check`/`passport`), then `check` (text + SARIF must agree), then
  `passport` into an Evidence Capsule.
- Uploads SARIF to code scanning (`upload-sarif`, needs `security-events:
  write`) and the Passport/Capsule as workflow artifacts
  (`upload-artifacts`); writes the release delta + blocking findings to
  `$GITHUB_STEP_SUMMARY` (`summary`).
- Gates on exit 2 for confirmed contradictions or failed journeys;
  `fail-on: never` reports without failing. Top-level `exit-code` reflects
  the final gate (including journey failures); `check-exit-code` and
  `compare-exit-code` are exposed separately.
- Posts no PR comments; publishes no credentials, screenshots, or declaration
  contents outside workflow artifacts.

Repository CI (`.github/workflows/ci.yml`) runs build, tests, demo, offline
capsule verification, `attest doctor` on fresh templates, `actionlint`
(advisory only), `scripts/smoke-action.sh`, and the composite action itself on
demo fixtures (expects exit 2 on HOLD, plus a `fail-on: never` pass).

---

## 5. Evidence-handling guidance

- **Local by default.** Artifacts, declarations, and journeys are inspected on
  the pilot machine or CI runner. Nothing is uploaded except the SARIF +
  Capsule workflow artifacts you opt into.
- **Redaction.** Exports redact secrets and personal data. Credentials live
  only as vault labels + expiry in journeys; the Capsule manifest lists
  `redactions: ["reviewer credentials", "test account identities"]`.
- **No private evidence in PR threads.** Step summaries contain the release
  delta and finding titles/comparisons only. Screenshots, policy/listing
  contents, and credential values stay in workflow artifacts, never in
  summaries or comments.
- **Tamper evidence.** `attest verify <capsule>` recomputes every file hash,
  the evidence root, and the Passport's content-addressed id. Any post-seal
  edit to `passport.json`, findings, declarations, or screenshots fails
  offline — keep the sealed Capsule as the release record.
- **Exceptions and decisions are evidence.** They seal into the Capsule via
  reseal; a finalized decision is immutable (corrections are new revisions
  with `supersedes`). Bind each exception to its finding + artifact hash with
  owner, rationale, approver, approval time, and future expiry.
- **Retention.** Delete pilot Capsules containing internal hosts or account
  references when the pilot ends, or keep one HOLD + one SHIP example as the
  team's reference.

---

## 6. Pilot scorecard

Fill one row per release candidate (five teams × at least one RC each):

| # | Measure | How to capture | Target signal |
| --- | --- | --- | --- |
| 1 | **Time to first useful finding** | Minutes from `attest check` start to first confirmed contradiction the team agrees matters | ≤ 5 min on provided fixtures |
| 2 | **Unknown contradictions found** | Count of TG-001/TG-002/JT-001 the team did not already know | ≥ 1 per team to continue |
| 3 | **Findings that caused real changes** | Declaration, code, reviewer-instruction, or listing edits traced to a finding id | ≥ 30% of blocking findings acted on |
| 4 | **Reviewer preparation time** | Hours spent on reviewer materials vs the team's previous release (before/after) | Less than manual prep |
| 5 | **Attest ran for the next release** | Did the team voluntarily run `check`/`passport` (local or CI) on the following RC? | ≥ 2 of 5 teams = success |
| 6 | **Likely buyer + willingness to pay** | Name the role (eng lead / release mgr / agency owner) + yes/no/maybe + price band | Buyer named in ≥ 3 teams |

Stop/reposition if output is indistinguishable from a basic scanner, most
findings lack deterministic evidence, teams ship too infrequently for a
recurring workflow, journeys need bespoke consulting per app, or teams ask for
a general security suite instead of release truth.

---

## 7. Support / debugging checklist

- [ ] `node --version` ≥ 20? (`attest doctor` checks this first.)
- [ ] `attest doctor` green on blocking checks? Follow each `→` hint.
- [ ] Base/candidate paths exist and are AAB/APK with `AndroidManifest.xml`?
  (`inspect` must succeed before `check`.)
- [ ] `data-safety.json` has `schemaVersion: "attest.data-safety/1"` and all
  three arrays? Try the CSV form if hand-editing JSON is painful.
- [ ] `adb devices` shows the serial as `device`? (Not `offline` /
  `unauthorized`.) Re-authorize on device if needed.
- [ ] Journey JSON parses (`schemaVersion: "attest.journey/1"`, non-empty
  `steps`)? Missing screenshots warn at render time but never block loading.
- [ ] Credential `expiresAt` in the future? Rotate if `expired` /
  `expiring_soon`.
- [ ] `outDir` writable? Point `outDir` elsewhere if on a read-only mount.
- [ ] `config.json` free of secret values? Use vault labels, never raw tokens.
- [ ] `attest check` exit 1? Read the usage line — a required flag or file is
  missing (the Action's validate step reports the same).
- [ ] `attest verify` fails? Run with no extra args; `MISMATCH <path>` names
  the edited file, `Passport id mismatch` means the JSON was hand-edited
  without resealing. Restore from version control or `seal --from` a clean
  revision.
- [ ] Action `ROOT` wrong? It must resolve via
  `github.action_path/../../..` to the repo root (the old `../..` pointed at
  `.github`). `scripts/smoke-action.sh` asserts this.
- [ ] Incomplete journey pair in CI? Both `baseline-journey` and
  `candidate-journey` are required together — the validate step fails clearly.
- [ ] Need help? Attach: `attest doctor` output, `check.txt` (not the whole
  Capsule), the failing command + exit code, and `capsule-manifest.json`
  (hashes only). Never send screenshots, policies, or credentials.
