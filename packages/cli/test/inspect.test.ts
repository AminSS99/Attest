import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { inspectArtifact } from '../src/inspect.js';
import { buildArtifact } from './fixtures/make-apk.js';
import { BASE_SPEC, CANDIDATE_SPEC } from './fixtures/scenario.js';

describe('inspectArtifact', () => {
  const facts = inspectArtifact(buildArtifact(CANDIDATE_SPEC), 'pulsefit-1.3.0.apk');

  it('reads identity and sdk levels from the manifest', () => {
    assert.equal(facts.packageName, 'app.pulsefit');
    assert.equal(facts.versionName, '1.3.0');
    assert.equal(facts.versionCode, '10300');
    assert.equal(facts.minSdk, 26);
    assert.equal(facts.targetSdk, 34);
    assert.equal(facts.artifact.kind, 'apk');
    assert.match(facts.artifact.sha256, /^[0-9a-f]{64}$/);
  });

  it('inventories permissions deterministically', () => {
    assert.deepEqual(
      facts.permissions.map((p) => p.name),
      [
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.CAMERA',
        'android.permission.INTERNET',
      ],
    );
  });

  it('detects SDKs and destination hosts from DEX strings', () => {
    const ids = facts.sdks.map((s) => s.id);
    assert.ok(ids.includes('com.amplitude'));
    assert.ok(ids.includes('com.google.firebase.analytics'));
    const hosts = facts.domains.map((d) => d.host);
    assert.deepEqual(hosts, ['api.pulsefit.app', 'metrics.amplitude.com']);
  });

  it('lists only the exported component surface', () => {
    const names = facts.exportedComponents.map((c) => `${c.kind}:${c.name}`);
    assert.deepEqual(names, [
      'activity:app.pulsefit.MainActivity',
      'receiver:app.pulsefit.DeepLinkReceiver',
    ]);
    assert.equal(
      facts.exportedComponents.every((c) => c.exported),
      true,
    );
  });

  it('flags implicitly exported components (intent-filter, no exported attr)', () => {
    const implicit = inspectArtifact(
      buildArtifact({
        ...CANDIDATE_SPEC,
        components: [
          {
            kind: 'activity',
            name: 'app.pulsefit.LegacyActivity',
            actions: ['android.intent.action.VIEW'],
          },
        ],
      }),
      'implicit.apk',
    );
    assert.equal(implicit.exportedComponents[0]!.exportedImplicitly, true);
  });

  it('supports AAB layout', () => {
    const aab = inspectArtifact(buildArtifact({ ...BASE_SPEC, aab: true }), 'pulsefit-1.2.0.aab');
    assert.equal(aab.artifact.kind, 'aab');
    assert.equal(aab.packageName, 'app.pulsefit');
    assert.deepEqual(
      aab.permissions.map((p) => p.name),
      [
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.INTERNET',
        'android.permission.RECORD_AUDIO',
      ],
    );
  });
});
