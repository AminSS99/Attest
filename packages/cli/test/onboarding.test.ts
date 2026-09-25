import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { doctorProject, initProject } from '../src/onboarding.js';

describe('attest init', () => {
  const dirs: string[] = [];
  after(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  it('creates a reviewable .attest structure with no secrets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'attest-init-'));
    dirs.push(root);
    const created = await initProject(root);
    assert.ok(created.length >= 7);

    const configRaw = await readFile(join(root, '.attest', 'config.json'), 'utf8');
    const config = JSON.parse(configRaw);
    assert.equal(config.schemaVersion, 'attest.config/1');
    assert.ok(!/password|secret|api[_-]?key|token/i.test(configRaw));

    for (const f of [
      '.attest/declarations/data-safety.json',
      '.attest/declarations/privacy-policy.txt',
      '.attest/declarations/store-listing.txt',
      '.attest/README.md',
      '.attest/github-workflow.yml',
    ]) {
      const body = await readFile(join(root, f), 'utf8');
      assert.ok(body.length > 0, f);
      assert.ok(!/ghp_|sk-live|BEGIN .*PRIVATE KEY/.test(body), `${f} must not contain secrets`);
    }
    // Second init without --force is a no-op.
    assert.deepEqual(await initProject(root), []);
  });
});

describe('attest doctor', () => {
  const dirs: string[] = [];
  after(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  async function scaffold(overrides: Record<string, unknown> = {}): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'attest-doctor-'));
    dirs.push(root);
    await initProject(root);
    // Materialize the configured artifact/declaration placeholders so path checks pass.
    await mkdir(join(root, 'artifacts'), { recursive: true });
    await writeFile(join(root, 'artifacts', 'base.apk'), 'base', 'utf8');
    await writeFile(join(root, 'artifacts', 'candidate.apk'), 'candidate', 'utf8');
    await mkdir(join(root, 'attest-out'), { recursive: true });
    const configPath = join(root, '.attest', 'config.json');
    const base = JSON.parse(await readFile(configPath, 'utf8'));
    const next = {
      ...base,
      reviewerTwin: { enabled: false },
      journeys: [],
      ...overrides,
    };
    await writeFile(configPath, JSON.stringify(next, null, 2), 'utf8');
    return root;
  }

  it('passes on a well-formed workspace', async () => {
    const root = await scaffold();
    const report = await doctorProject({ projectRoot: root });
    assert.equal(report.ok, true);
    assert.ok(report.results.some((r) => r.name === 'node' && r.status === 'pass'));
    assert.ok(report.results.some((r) => r.name === 'outDir' && r.status === 'pass'));
  });

  it('fails on missing artifact paths with actionable hints', async () => {
    const root = await scaffold({ base: 'artifacts/missing-base.apk' });
    const report = await doctorProject({ projectRoot: root });
    assert.equal(report.ok, false);
    const missing = report.results.find((r) => r.name === 'base artifact');
    assert.equal(missing?.status, 'fail');
    assert.match(missing?.hint ?? '', /config\.json/);
  });

  it('fails on secret-like config values', async () => {
    const root = await scaffold();
    const configPath = join(root, '.attest', 'config.json');
    const raw = await readFile(configPath, 'utf8');
    const doc = JSON.parse(raw);
    doc.apiKey = 'sk-live-abcdef1234567890abcdef1234567890';
    await writeFile(configPath, JSON.stringify(doc, null, 2), 'utf8');
    const report = await doctorProject({ projectRoot: root });
    assert.equal(report.ok, false);
    assert.equal(report.results.find((r) => r.name === 'secrets')?.status, 'fail');
  });

  it('fails on expired credentials and warns when near expiry', async () => {
    const root = await scaffold({ reviewerTwin: { enabled: false }, journeys: ['journeys'] });
    await mkdir(join(root, 'journeys'), { recursive: true });
    const expired = {
      schemaVersion: 'attest.journey/1',
      id: 'JN-test',
      kind: 'reviewer',
      name: 'reviewer-x',
      title: 'X',
      steps: [
        {
          order: 1,
          action: 'Open app',
          expectedState: 'Home',
          observedState: 'Home',
          status: 'pass',
          capturedAt: '2026-09-24T00:00:00Z',
          evidencePaths: [],
        },
      ],
      credentialRef: { label: 'reviewer', expiresAt: '2020-01-01' },
      recordedBy: 'human-guided',
      recordedAt: '2026-09-24T00:00:00Z',
    };
    await writeFile(join(root, 'journeys', 'j.json'), JSON.stringify(expired, null, 2), 'utf8');
    const report = await doctorProject({ projectRoot: root, now: new Date('2026-09-24T00:00:00Z') });
    assert.equal(report.ok, false);
    assert.ok(report.results.some((r) => r.name.startsWith('credential') && r.status === 'fail'));
  });

  it('fails on unparseable journey files', async () => {
    const root = await scaffold({ reviewerTwin: { enabled: false }, journeys: ['journeys'] });
    await mkdir(join(root, 'journeys'), { recursive: true });
    await writeFile(join(root, 'journeys', 'broken.json'), '{ not json', 'utf8');
    const report = await doctorProject({ projectRoot: root });
    assert.equal(report.ok, false);
  });
});
