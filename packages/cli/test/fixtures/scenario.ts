/**
 * The shared demo scenario — "PulseFit", a fictional fitness app.
 *
 * Base v1.2.0 shipped with Firebase Analytics, location + mic permissions,
 * and one backend. Candidate v1.3.0 adds Amplitude (which introduces a new
 * destination host), adds CAMERA, drops RECORD_AUDIO, and exposes a new
 * exported receiver. The team's Data Safety answers were never updated.
 *
 * This is the MVP signature from PRODUCT_PLAN §9 made concrete.
 */

import {
  DATA_SAFETY_SCHEMA_VERSION,
  type DataSafetyDeclaration,
} from 'attest-schema';

import type { AppSpec } from './make-apk.js';

export const BASE_SPEC: AppSpec = {
  packageName: 'app.pulsefit',
  versionName: '1.2.0',
  versionCode: 10200,
  minSdk: 26,
  targetSdk: 34,
  permissions: [
    'android.permission.INTERNET',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.RECORD_AUDIO',
  ],
  components: [
    {
      kind: 'activity',
      name: 'app.pulsefit.MainActivity',
      exported: true,
      actions: ['android.intent.action.MAIN'],
    },
    { kind: 'activity', name: 'app.pulsefit.SettingsActivity', exported: false },
  ],
  sdkPackages: ['com/google/firebase/analytics'],
  urls: ['https://api.pulsefit.app/v1/sync'],
};

export const CANDIDATE_SPEC: AppSpec = {
  packageName: 'app.pulsefit',
  versionName: '1.3.0',
  versionCode: 10300,
  minSdk: 26,
  targetSdk: 34,
  permissions: [
    'android.permission.INTERNET',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.CAMERA',
  ],
  components: [
    {
      kind: 'activity',
      name: 'app.pulsefit.MainActivity',
      exported: true,
      actions: ['android.intent.action.MAIN'],
    },
    { kind: 'activity', name: 'app.pulsefit.SettingsActivity', exported: false },
    {
      kind: 'receiver',
      name: 'app.pulsefit.DeepLinkReceiver',
      exported: true,
      actions: ['android.intent.action.VIEW'],
    },
  ],
  sdkPackages: ['com/google/firebase/analytics', 'com/amplitude'],
  urls: ['https://api.pulsefit.app/v1/sync', 'https://metrics.amplitude.com/collect'],
};

/** Stale declarations: written for v1.2.0, never updated for v1.3.0. */
export const STALE_DATA_SAFETY: DataSafetyDeclaration = {
  schemaVersion: DATA_SAFETY_SCHEMA_VERSION,
  collectedDataTypes: [
    { id: 'location.precise_location', shared: false, optional: false, purpose: 'Workout tracking' },
    { id: 'audio.voice_or_sound_recordings', shared: false, optional: true },
    { id: 'calendar.calendar_events', shared: false, optional: true },
  ],
  sdkDisclosures: ['Firebase Analytics'],
  domains: ['api.pulsefit.app'],
  effectiveDate: '2026-08-15',
  source: 'play-console-export (stale)',
};

/**
 * Repaired declarations for v1.3.0: photos disclosed for the new CAMERA
 * permission, Amplitude and metrics.amplitude.com disclosed, stale audio and
 * calendar claims dropped. Clears all five truth-gap rules.
 */
export const FIXED_DATA_SAFETY: DataSafetyDeclaration = {
  schemaVersion: DATA_SAFETY_SCHEMA_VERSION,
  collectedDataTypes: [
    { id: 'location.precise_location', shared: false, optional: false, purpose: 'Workout tracking' },
    { id: 'photos_and_videos.photos', shared: false, optional: true, purpose: 'AI form scanner' },
  ],
  sdkDisclosures: ['Firebase Analytics', 'Amplitude'],
  domains: ['api.pulsefit.app', 'metrics.amplitude.com'],
  effectiveDate: '2026-09-22',
  source: 'play-console-export (updated for 1.3.0)',
};

export const PRIVACY_POLICY_TEXT = `PulseFit Privacy Policy

We collect precise location to map your workouts. Workout data is stored on
your device and synced to api.pulsefit.app. We use Firebase Analytics to
understand feature usage. We do not sell personal data.

Contact: privacy@pulsefit.app
`;

/** Updated for 1.3.0: discloses Amplitude and its collection endpoint. */
export const FIXED_PRIVACY_POLICY_TEXT = `PulseFit Privacy Policy

We collect precise location to map your workouts. Workout data is stored on
your device and synced to api.pulsefit.app. We use Firebase Analytics and
Amplitude (metrics.amplitude.com) to understand feature usage. We do not sell
personal data.

Contact: privacy@pulsefit.app
`;

export const STORE_LISTING_TEXT = `PulseFit — GPS Workout Tracker

Track runs and rides with precise GPS. Record voice notes mid-workout.
Your data stays yours.
`;
