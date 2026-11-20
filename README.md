<p align="center">
  <img src="apps/web/attest-logo.png" alt="Attest logo" width="96" height="96" />
</p>

<h1 align="center">Attest</h1>

<p align="center"><strong>Your new Android build added a permission and an SDK. Did your privacy answers keep up?</strong></p>

<p align="center">
  <a href="https://attest-ruby.vercel.app">Live demo</a> ·
  <a href="https://attest-ruby.vercel.app/attest-demo.mp4">Watch (32 s)</a> ·
  <a href="#try-it-in-60-seconds">Run it</a> ·
  <a href="docs/ARCHITECTURE.md">How it works</a> ·
  <a href="docs/internal/DESIGN_PARTNER_PILOT.md">Usage guide</a> ·
  <a href="LICENSE">Apache-2.0</a>
</p>

[![Watch the 32-second Attest demo](docs/images/video-poster.jpg)](https://attest-ruby.vercel.app/attest-demo.mp4)

Attest diffs the last shipped APK/AAB against a release candidate and checks the result against your Play Data Safety answers, privacy policy, and store listing. Every finding cites the bytes that prove it. It runs locally: no source code, no upload.

```text
$ attest check --base pulsefit-1.2.0.apk --candidate pulsefit-1.3.0.apk --data-safety data-safety.json
[HIGH] TG-002 — New third-party SDK without any disclosure
  New SDK Amplitude Analytics is present in the build but disclosed nowhere the team has declared.
  comparison: observed(com.amplitude via com/amplitude) vs declared(no Data Safety disclosure, no privacy-policy mention)
[HIGH] TG-001 — New dangerous permission not covered by Data Safety answers
  Build declares android.permission.CAMERA, but the Data Safety form does not list "photos_and_videos.photos".
2 confirmed contradiction(s). Recommendation: HOLD until declarations match the build.     (exit code 2)
```

Output above is from the synthetic PulseFit demo, not a customer release.

## Try it in 60 seconds

**No install:** open the [live site](https://attest-ruby.vercel.app#try), drop two APKs, or click the sample. Everything runs in your browser.

**From a clone** (Node.js 20+): Attest is not on npm yet; run it from a clone.

```bash
git clone https://github.com/AminSS99/Attest.git && cd Attest
npm ci
npm run web:dev    # http://127.0.0.1:4173 — drop two APKs on the page, or click "run the sample"
```

The page runs the real inspection and rules code **inside your browser** (in a Web Worker). Your builds are read in memory and never uploaded.

Prefer the terminal?

```bash
npm run demo                                          # PulseFit: a HOLD release, then a repaired SHIP release
npm run attest -- verify attest-out/demo/capsule      # verify the sealed evidence offline
```

Open `attest-out/demo/capsule/passport.html` to read the Release Passport.

## What it does

- **Reads builds without Android tooling.** ZIP, binary `AndroidManifest.xml`, and DEX parsers are written from scratch in TypeScript with zero runtime dependencies. No apktool, no Java.
- **Finds release-level contradictions.** Five deterministic rules compare what the binary shows (permissions, SDKs, network hosts) with what you declared. See [`truthgap.ts`](packages/cli/src/truthgap.ts).
- **Separates fact from inference.** Each claim is labelled observed, declared, attested, inferred, or missing, and every finding links its sources.
- **Records the human decision.** A Release Passport recommends `SHIP`, `REVIEW`, or `HOLD`. Exceptions and the final call are recorded and immutable; corrections create a new revision.
- **Seals evidence you can verify offline.** An Evidence Capsule hashes every file, so tampering is detectable without Attest's servers.
- **Checks the reviewer's path.** A human-guided ADB recorder captures a journey, then flags the first step that changed or broke between releases.
- **Gates CI.** A [reusable GitHub Action](.github/actions/attest) writes a summary and SARIF, and fails the job on a confirmed contradiction.

## Use it on your release

```bash
npm run build
npm run attest -- check \
  --base path/to/last-shipped.apk \
  --candidate path/to/candidate.apk \
  --data-safety path/to/data-safety.json \
  --privacy-policy path/to/privacy.txt \
  --listing path/to/listing.txt
npm run attest -- passport --base … --candidate … --data-safety … --out evidence/
npm run attest -- verify evidence/
```

`npm run attest -- help` lists every command. `init` and `doctor` scaffold and validate a project folder. A `HOLD` exits with code `2` so CI can gate the release. Keep private builds outside this repository.

## Status

Early developer preview. Android only. The CLI, schemas, GitHub Action (validated on hosted runners with synthetic fixtures), website, and in-browser analyzer all work and are covered by tests (`npm test`, CI on every push).

Not built: iOS, a hosted dashboard, a published npm package, automated device journeys. It has been run on [real public builds](docs/REAL_RELEASES.md) (build deltas only, no declarations), but not yet on a real design-partner release, and it does not guarantee store approval. Its evidence supports a human release decision; it is not legal advice or a compliance certification. Next milestone: [one real authorized release](docs/internal/PILOT_INTAKE.md).

## Repository map

| Path | Purpose |
| --- | --- |
| [`packages/cli`](packages/cli) | Inspection, rules, journeys, Passport, Capsule |
| [`packages/schema`](packages/schema) | Versioned evidence and release schemas |
| [`apps/web`](apps/web) | Website and in-browser analyzer |
| [`apps/video`](apps/video) | The demo video and social card, made with [Remotion](https://www.remotion.dev) |
| [`.github/actions/attest`](.github/actions/attest) | Reusable GitHub Action |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Design, parsers, and trust model |
| [`docs/REAL_RELEASES.md`](docs/REAL_RELEASES.md) | Runs on real public APKs, and the four bugs they exposed |
| [`docs/internal`](docs/internal) | Pilot kit, validation records, product notes |
| [`PRODUCT_PLAN.md`](PRODUCT_PLAN.md) | Product direction |

```bash
npm test            # build + test suite
npm run web:build   # static site to apps/web/dist/
```
