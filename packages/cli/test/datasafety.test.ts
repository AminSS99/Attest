import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DeclarationImportError,
  parseDataSafetyCsv,
  parseDataSafetyJson,
} from '../src/datasafety.js';
import { STALE_DATA_SAFETY } from './fixtures/scenario.js';

describe('Data Safety import', () => {
  it('parses the versioned JSON representation', () => {
    const decl = parseDataSafetyJson(JSON.stringify(STALE_DATA_SAFETY));
    assert.equal(decl.collectedDataTypes.length, 3);
    assert.deepEqual(decl.domains, ['api.pulsefit.app']);
    assert.deepEqual(decl.sdkDisclosures, ['Firebase Analytics']);
  });

  it('parses the CSV representation with details', () => {
    const csv = [
      'kind,value,details',
      'data_type,location.precise_location,shared=false;optional=false;purpose=Workout tracking',
      'data_type,calendar.calendar_events,',
      'sdk,Firebase Analytics',
      'domain,API.PulseFit.App',
    ].join('\n');
    const decl = parseDataSafetyCsv(csv);
    assert.deepEqual(
      decl.collectedDataTypes.map((d) => d.id),
      ['calendar.calendar_events', 'location.precise_location'],
    );
    assert.equal(decl.collectedDataTypes[1]!.purpose, 'Workout tracking');
    assert.deepEqual(decl.domains, ['api.pulsefit.app']); // normalized lowercase
    assert.deepEqual(decl.sdkDisclosures, ['Firebase Analytics']);
  });

  it('rejects a wrong schema version instead of guessing', () => {
    assert.throws(() => parseDataSafetyJson('{"schemaVersion":"nope"}'), DeclarationImportError);
  });

  it('rejects malformed CSV rows', () => {
    assert.throws(() => parseDataSafetyCsv('widget,something'), DeclarationImportError);
  });
});
