# Architecture

Attest answers one question: does the build you are about to ship still match what you tell users, app stores, and reviewers? Everything below serves that.

## Pipeline

```text
 last-shipped APK/AAB ─┐                                   ┌─ Release Passport (HTML + JSON)
                       ├─ inspect ─ diff ─ rules ─ claims ─┼─ SARIF
 candidate APK/AAB ────┘      ▲                    ▲       └─ Evidence Capsule (hashed, offline-verifiable)
                              │                    │
                       declarations: Data Safety, privacy policy, listing, reviewer journey
```

| Stage | Module | Output |
| --- | --- | --- |
| Inspect | [`inspect.ts`](../packages/cli/src/inspect.ts) | `BuildFacts`: manifest, permissions, exported components, SDKs, hosts |
| Diff | [`diff.ts`](../packages/cli/src/diff.ts) | `ReleaseDiff`: what was added or removed between builds |
| Rules | [`truthgap.ts`](../packages/cli/src/truthgap.ts) | Findings TG-001…TG-005, each with observed vs declared evidence |
| Claims | [`truthgraph.ts`](../packages/cli/src/truthgraph.ts) | Claims linked to the findings that support or contradict them |
| Journey | [`journey.ts`](../packages/cli/src/journey.ts) | Human-guided ADB recording, baseline comparison, first failed step |
| Passport | [`passport.ts`](../packages/cli/src/passport.ts) | Content-addressed document with a `SHIP`/`REVIEW`/`HOLD` recommendation |
| Decision | [`decision.ts`](../packages/cli/src/decision.ts) | Exceptions and the immutable human decision |
| Capsule | [`capsule.ts`](../packages/cli/src/capsule.ts) | SHA-256 manifest over every file, plus verification |

Types for each stage live in [`packages/schema`](../packages/schema), so the CLI, the Action, and the website share one contract.

## Reading an APK without Android tooling

Three small parsers, written from the file formats, with no runtime dependencies:

- **ZIP** ([`zip.ts`](../packages/cli/src/zip.ts)): central directory walk, stored and deflate entries. ZIP64 and encrypted entries are rejected with a clear error instead of being misread.
- **AXML** ([`axml.ts`](../packages/cli/src/axml.ts)): the compiled binary `AndroidManifest.xml` (string pool, resource map, typed attribute values).
- **DEX** ([`dex.ts`](../packages/cli/src/dex.ts)): the string table only. Strings are used for SDK package prefixes and URLs.

A DEX that fails to parse does not abort the inspection; the evidence from the other files stays intact.

## Trust model

- **Local by default.** Builds and declarations are read in place. The website analyzer runs the same compiled core in a Web Worker; selected files never leave the browser.
- **Evidence classes.** Every claim is `observed`, `declared`, `attested`, `inferred`, or `missing`. Inference is never silently promoted to observation.
- **Findings cite sources.** Each finding carries the comparison behind it (for example `observed(com.amplitude via com/amplitude) vs declared(no Data Safety disclosure)`).
- **Deterministic.** Rules are pure functions of the inputs. The same builds and declarations yield the same finding ids.
- **Humans decide.** Exceptions overlay findings but never rewrite them or the recommendation. Shipping over `HOLD` requires a recorded reason. A finalized decision is immutable; a correction writes a new revision.
- **Integrity, not legality.** A Capsule proves what evidence existed and what was decided. It is not a compliance certificate.

## One core, two runtimes

The CLI uses `node:zlib`, `node:crypto`, and `node:fs`. For the website, [`apps/web/scripts/bundle.mjs`](../apps/web/scripts/bundle.mjs) bundles the compiled core with esbuild and aliases those modules to small browser shims ([`apps/web/src/shims`](../apps/web/src/shims): `fflate` for inflate, `@noble/hashes` for SHA-256). The core has no browser-specific fork, so the browser and the CLI cannot drift apart.

## Limits

Android only; no iOS inspector. Detection of SDKs and hosts is limited to known package prefixes and URL strings in DEX, so obfuscated or natively loaded code can be missed. Data Safety input is JSON or CSV. The browser analyzer holds both builds in memory and is capped at 400 MB per file; use the CLI for larger builds.
