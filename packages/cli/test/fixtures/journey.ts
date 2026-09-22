/**
 * Scripted Reviewer Twin sessions for the PulseFit scenario.
 *
 * The recorder is human-guided; these fixtures stand in for the developer at
 * a keyboard and the emulator on the desk, so tests and the demo exercise the
 * exact production recording pipeline without a device attached. A real
 * session uses `attest journey record --device emulator-5554 …`.
 *
 * Story: on 1.3.0 the reviewer journey fails at step four — "Premium AI
 * Coach" no longer opens after the Amplitude/CAMERA release — then passes
 * again once the team repairs the release.
 */

import type { CredentialRef, StepResult } from 'attest-schema';

import { AdbDevice } from '../../src/adb.js';
import type { DeviceBridge, RecorderIO } from '../../src/journey.js';
import { solidPng } from './make-png.js';

export const PULSEFIT_CREDENTIAL_REF: CredentialRef = {
  label: 'Reviewer account pulsefit.reviewer@attest.example — password + TOTP in team vault (ref only)',
  expiresAt: '2027-01-15T00:00:00.000Z',
};

export interface SessionStep {
  action: string;
  expected: string;
  observed: string;
  status: StepResult;
  note?: string;
}

/** Answers consumed by `recordJourney` — 6 prompts per step, then empty action to finish. */
export function answersFor(steps: SessionStep[]): string[] {
  const out: string[] = [];
  for (const s of steps) {
    out.push(s.action, s.expected, '', s.observed, s.status, s.note ?? '');
  }
  out.push('');
  return out;
}

/** Baseline approved on v1.2.0: the full reviewer path, all steps pass. */
export const BASELINE_SESSION: SessionStep[] = [
  {
    action: 'Launch PulseFit from a fresh install',
    expected: 'PulseFit home screen with the "Start workout" button visible',
    observed: 'Home screen shown with "Start workout"',
    status: 'pass',
    note: 'Fresh install; reviewer account not yet signed in',
  },
  {
    action: 'Sign in with the reviewer account',
    expected: 'Workout dashboard for the signed-in reviewer',
    observed: 'Dashboard shown for reviewer account',
    status: 'pass',
  },
  {
    action: 'Open Settings from the profile menu',
    expected: 'Settings screen with Account, Privacy, and Premium AI entries',
    observed: 'Settings screen open (app.pulsefit.SettingsActivity)',
    status: 'pass',
  },
  {
    action: 'Tap "Premium AI Coach"',
    expected: 'Premium AI Coach screen with the plan selector visible',
    observed: 'Premium AI Coach screen open (app.pulsefit.PremiumAiActivity)',
    status: 'pass',
    note: 'Review-sensitive feature — requires a valid subscription entitlement',
  },
  {
    action: 'Start a guided run and stop it after 10 seconds',
    expected: 'Workout summary with recorded distance and duration',
    observed: 'Workout summary shown',
    status: 'pass',
  },
];

/** Re-run on v1.3.0: step four fails; the operator stops the journey there. */
export const FAILURE_SESSION: SessionStep[] = [
  ...BASELINE_SESSION.slice(0, 3),
  {
    action: BASELINE_SESSION[3]!.action,
    expected: BASELINE_SESSION[3]!.expected,
    observed: 'App shows "Something went wrong" — Premium AI Coach fails to load after the 1.3 analytics change',
    status: 'fail',
    note: 'Feature gate now depends on the metrics sync added in 1.3; reviewer path blocked',
  },
];

/** After the team repairs 1.3: the approved path again, all steps pass. */
export const REPAIRED_SESSION: SessionStep[] = BASELINE_SESSION;

export interface ScriptedScreen {
  activity: string;
  color: [number, number, number];
}

/** One scripted device screen per recorded step (activity + screenshot color). */
export const BASELINE_SCREENS: ScriptedScreen[] = [
  { activity: 'app.pulsefit.MainActivity', color: [27, 42, 65] },
  { activity: 'app.pulsefit.MainActivity', color: [32, 78, 102] },
  { activity: 'app.pulsefit.SettingsActivity', color: [45, 90, 70] },
  { activity: 'app.pulsefit.PremiumAiActivity', color: [90, 50, 120] },
  { activity: 'app.pulsefit.MainActivity', color: [60, 60, 90] },
];

/** On failure the app never leaves MainActivity for PremiumAiActivity. */
export const FAILURE_SCREENS: ScriptedScreen[] = [
  ...BASELINE_SCREENS.slice(0, 3),
  { activity: 'app.pulsefit.MainActivity', color: [150, 40, 40] },
];

export const REPAIRED_SCREENS: ScriptedScreen[] = BASELINE_SCREENS;

/** A DeviceBridge that replays scripted screens instead of talking to ADB. */
export function scriptedDevice(serial: string, screens: ScriptedScreen[]): DeviceBridge {
  let index = 0;
  return {
    serial,
    metadata: async () => ({
      serial,
      manufacturer: 'Google',
      model: 'sdk_gphone64_x86_64',
      androidRelease: '14',
      apiLevel: 34,
    }),
    currentActivity: async () => screens[index]?.activity ?? 'app.pulsefit.MainActivity',
    screenshot: async () => {
      const screen = screens[index];
      index++;
      return solidPng(72, 128, screen?.color ?? [30, 60, 90]);
    },
  };
}

/** A RecorderIO that replays pre-scripted answers (throws when exhausted). */
export function scriptedIO(answers: string[]): RecorderIO {
  let index = 0;
  return {
    prompt: async (message) => {
      if (index >= answers.length) {
        throw new Error(`scriptedIO exhausted after ${answers.length} answers (next: "${message}")`);
      }
      return answers[index++]!;
    },
  };
}

/** Fake ADB executor: canned responses keyed by argument substring. */
export function fakeAdbExec(responses: Record<string, string | Buffer>) {
  return async (args: string[]): Promise<Buffer> => {
    const line = args.join(' ');
    for (const [needle, value] of Object.entries(responses)) {
      if (line.includes(needle)) {
        return Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
      }
    }
    throw new Error(`fakeAdbExec: no canned response for "adb ${line}"`);
  };
}

/** Convenience: an AdbDevice wired to the fake executor (no platform-tools needed). */
export function fakeAdbDevice(serial: string, responses: Record<string, string | Buffer>): AdbDevice {
  return new AdbDevice(serial, fakeAdbExec(responses));
}
