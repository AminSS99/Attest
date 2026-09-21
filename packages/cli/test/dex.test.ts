import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DexError, extractDexStrings, isDex } from '../src/dex.js';
import { detectSdks, extractDomains } from '../src/sdk-signatures.js';
import { buildDex } from './fixtures/make-dex.js';

describe('DEX string table', () => {
  it('round-trips strings through the reader', () => {
    const strings = [
      'Lcom/google/firebase/analytics/Sdk;',
      'https://api.pulsefit.app/v1/sync',
      'Lkotlin/Unit;',
    ];
    const dex = buildDex(strings);
    assert.ok(isDex(dex));
    assert.deepEqual(extractDexStrings(dex), strings);
  });

  it('detects SDKs with cited package evidence', () => {
    const sdks = detectSdks(['Lcom/amplitude/AmplitudeClient;', 'Lkotlin/Unit;']);
    assert.equal(sdks.length, 1);
    assert.equal(sdks[0]!.id, 'com.amplitude');
    assert.deepEqual(sdks[0]!.matchedPackages, ['com/amplitude']);
  });

  it('extracts destination hosts and ignores schema/DTD noise', () => {
    const hosts = extractDomains([
      'https://metrics.amplitude.com/collect?app=1',
      'http://www.w3.org/2001/XMLSchema-instance',
      'https://schemas.android.com/apk/res/android',
    ]);
    assert.deepEqual(hosts, ['metrics.amplitude.com']);
  });

  it('rejects non-dex bytes', () => {
    assert.throws(() => extractDexStrings(Buffer.from('nope')), DexError);
  });
});
