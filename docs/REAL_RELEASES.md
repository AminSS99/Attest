# Runs on real, public releases

Attest was run on consecutive public releases of three open-source Android apps, downloaded unmodified from [F-Droid](https://f-droid.org). These are **build deltas only**: F-Droid apps publish no Play Data Safety form, so no declaration rules (TG-001…TG-005) were exercised. That is still real binaries, so it tests the parsers and the SDK and host detection on code Attest's author did not write.

This is not a design-partner pilot. Nobody on these teams used Attest or confirmed the results.

| App | Base → candidate | Delta Attest reported |
| --- | --- | --- |
| F-Droid client | 2.0.2 (2000052) → 2.0.3 (2000053) | No change in permissions, SDKs, hosts, or exported components |
| Aurora Store | 4.8.3 (75) → 4.8.4 (76) | `+USE_BIOMETRIC`, `+USE_FINGERPRINT`; exported activities `ComposeActivity` and `DeepLinkConfirmActivity` added, `MainActivity` no longer exported |
| NewPipe | 0.29.1 (1015) → 0.29.3 (1017) | New host `issuetracker.google.com` |

Per build, Attest read the version, SDK levels, 11–31 permissions, 7–10 exported components, and 17–32 hosts.

Each `attest diff` took 0.2–0.4 s on a laptop for builds of 9–17 MB.

## What the runs fixed

The first passes reported results that a developer would have called wrong. All four were fixed, with tests, in this change. The synthetic demo could not have exposed any of them.

1. **Real manifests parsed as empty.** The first run reported no permissions, versions, or SDK levels for any app. Real aapt2 manifests store attribute names bare (`versionCode`) with the android namespace URI, while the synthetic fixtures spelled out `android:versionCode`, so every `android:`-prefixed lookup missed. Permission and exported-component rules could never have fired on a real build. The parser now resolves the namespace, and the test fixture can emit the aapt2 encoding.
2. **Prose fragments reported as network destinations.** NewPipe's diff listed 14 added hosts such as `www.a`, `www.css`, and `www.language`, which are fragments inside bundled text. Each would have become a "new undisclosed destination" finding (TG-003). Destinations now need a plausible top-level domain; the 14 became 1.
3. **A UI library reported as the Facebook SDK.** Aurora Store's diff reported the Facebook SDK as removed. The match was `com/facebook/shimmer`, Facebook's open-source loading-animation library, not the Facebook SDK. The signature now matches only the SDK's own packages (`appevents`, `login`, `share`, `internal`).
4. **Evidence silently dropped on large builds.** The in-browser analyzer reported 19 new hosts for NewPipe where the CLI reported 1. The cause was `dexStrings.push(...strings)`: spreading roughly 70,000 strings as call arguments overflows the stack in a browser worker, and the surrounding `catch` hid the failure, so most hosts and SDKs went missing from the build. Strings are now appended in a loop, and a regression test inspects a DEX with 400,000 strings. The browser and CLI now agree on all three pairs.

## Known limits these runs show

- A single host or SDK prefix is a heuristic. `issuetracker.google.com` is a link in a string, not proof of traffic; Attest cites the string and leaves the judgment to a person.
- Three apps is a smoke test, not a benchmark. There is no measured precision or recall yet.
- Obfuscated or natively loaded code can hide SDKs and hosts.

## Reproduce

```bash
npm ci && npm run build
curl -fLO https://f-droid.org/repo/org.schabi.newpipe_1015.apk
curl -fLO https://f-droid.org/repo/org.schabi.newpipe_1017.apk
node packages/cli/dist/src/cli.js diff org.schabi.newpipe_1015.apk org.schabi.newpipe_1017.apk
```

SHA-256 of the files used:

```text
com.aurora.store_75.apk c4ce0df0bbb0e82be4e4bd7d8a3e000f08e04457187d560fe2ca3ae52941bf49
com.aurora.store_76.apk fd9c75d90d0f4a7c132b9b4a5a2cf1992a45e03b8d8ff988b7dcfbc0db2c4d11
org.fdroid.fdroid_2000052.apk 19d51fad482239f6df6a99120e34513667e9a86d136dafdc4a211a68c3327b52
org.fdroid.fdroid_2000053.apk dac55a0d17b1edf7e7286b48cfbd70c7c52fbb32a00af062c68830a437c47959
org.schabi.newpipe_1015.apk 1d66d19eedbab969b1be2e44e0ea35f5f8921cbe83b5c5ac810767ca1a84b7e8
org.schabi.newpipe_1017.apk 576228432fd261ab3d34b30ea9d5a23b3d53022e18c98f5b5e2e18b885988f05
```
