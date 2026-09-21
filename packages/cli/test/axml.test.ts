import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AxmlError, parseAxml } from '../src/axml.js';
import { buildAxml } from './fixtures/make-axml.js';

describe('parseAxml', () => {
  const doc = buildAxml({
    name: 'manifest',
    attrs: {
      package: 'app.pulsefit',
      'android:versionCode': 10200,
      'android:versionName': '1.2.0',
    },
    children: [
      { name: 'uses-sdk', attrs: { 'android:minSdkVersion': 26, 'android:targetSdkVersion': 34 } },
      { name: 'uses-permission', attrs: { 'android:name': 'android.permission.CAMERA' } },
      {
        name: 'application',
        children: [
          {
            name: 'activity',
            attrs: { 'android:name': '.MainActivity', 'android:exported': true },
            children: [
              {
                name: 'intent-filter',
                children: [{ name: 'action', attrs: { 'android:name': 'android.intent.action.MAIN' } }],
              },
            ],
          },
        ],
      },
    ],
  });

  it('parses elements, attributes, and typed values', () => {
    const root = parseAxml(doc);
    assert.equal(root.name, 'manifest');
    assert.equal(root.get('package'), 'app.pulsefit');
    assert.equal(root.get('android:versionCode'), '10200');
    assert.equal(root.get('android:versionName'), '1.2.0');

    const usesSdk = root.children[0]!;
    assert.equal(usesSdk.name, 'uses-sdk');
    assert.equal(usesSdk.get('android:targetSdkVersion'), '34');

    const perm = root.children[1]!;
    assert.equal(perm.get('android:name'), 'android.permission.CAMERA');

    const activity = root.children[2]!.children[0]!;
    assert.equal(activity.name, 'activity');
    assert.equal(activity.get('android:exported'), 'true');
    const action = activity.children[0]!.children[0]!;
    assert.equal(action.get('android:name'), 'android.intent.action.MAIN');
  });

  it('rejects plain XML with a clear error', () => {
    assert.throws(() => parseAxml(Buffer.from('<manifest/>')), AxmlError);
  });
});
