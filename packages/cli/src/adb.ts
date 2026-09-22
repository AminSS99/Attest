/**
 * Thin ADB bridge for the human-guided Reviewer Twin recorder
 * (PRODUCT_PLAN §6.2, §9 weeks 5–6).
 *
 * The recorder never automates taps or scripts coordinates: the developer
 * performs each action by hand. ADB is used only to (a) prove a device is
 * connected, (b) read device metadata and the foreground activity, and
 * (c) capture a screenshot as step evidence.
 *
 * Every invocation goes through an injectable `AdbExec`, so tests and demos
 * run without platform-tools installed.
 */

import { spawn } from 'node:child_process';

import type { DeviceMetadata } from 'attest-schema';

/** Runs `adb …args` and resolves stdout, or rejects with stderr in the message. */
export type AdbExec = (args: string[]) => Promise<Buffer>;

export const spawnAdb: AdbExec = (args) =>
  new Promise<Buffer>((resolve, reject) => {
    const child = spawn('adb', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (c: Buffer) => out.push(c));
    child.stderr.on('data', (c: Buffer) => err.push(c));
    child.on('error', (e) => {
      reject(
        new Error(
          `adb not found on PATH (${e.message}). Install Android platform-tools and retry.`,
        ),
      );
    });
    child.on('close', (code) => {
      const stdout = Buffer.concat(out);
      const stderr = Buffer.concat(err).toString('utf8').trim();
      if (code !== 0) {
        reject(new Error(`adb ${args.join(' ')} failed (exit ${code}): ${stderr || stdout.toString('utf8').trim()}`));
      } else {
        resolve(stdout);
      }
    });
  });

/** Device-serial commands (always prefixed with `-s <serial>`). */
export class AdbDevice {
  constructor(
    readonly serial: string,
    private readonly exec: AdbExec = spawnAdb,
  ) {}

  private run(...args: string[]): Promise<Buffer> {
    return this.exec(['-s', this.serial, ...args]);
  }

  /** Throws unless the device reports state "device" (not offline/unauthorized). */
  async assertConnected(): Promise<void> {
    const state = (await this.run('get-state')).toString('utf8').trim();
    if (state !== 'device') {
      throw new Error(
        `Device ${this.serial} reports state "${state}" (expected "device"). Check the emulator is running and the device is authorized.`,
      );
    }
  }

  async metadata(): Promise<DeviceMetadata> {
    const get = async (prop: string): Promise<string> =>
      (await this.run('shell', 'getprop', prop)).toString('utf8').trim();
    const [manufacturer, model, androidRelease, apiRaw] = await Promise.all([
      get('ro.product.manufacturer'),
      get('ro.product.model'),
      get('ro.build.version.release'),
      get('ro.build.version.sdk'),
    ]);
    const apiLevel = Number.parseInt(apiRaw, 10);
    return {
      serial: this.serial,
      manufacturer: manufacturer || undefined,
      model: model || undefined,
      androidRelease: androidRelease || undefined,
      apiLevel: Number.isNaN(apiLevel) ? undefined : apiLevel,
    };
  }

  /** Foreground activity as reported by dumpsys, if one can be parsed. */
  async currentActivity(): Promise<string | undefined> {
    const dump = (await this.run('shell', 'dumpsys', 'window')).toString('utf8');
    return parseFocusedActivity(dump);
  }

  /** PNG bytes of the current screen (`adb exec-out screencap -p`). */
  async screenshot(): Promise<Buffer> {
    return this.run('exec-out', 'screencap', '-p');
  }
}

/**
 * Extract the foreground activity from `dumpsys window` output.
 * Handles the common `mCurrentFocus` / `mFocusedApp` / `topResumedActivity`
 * shapes across API levels and normalizes `pkg/.Act` → `pkg.Act`.
 */
export function parseFocusedActivity(dumpsys: string): string | undefined {
  const windowComponent = /m(?:CurrentFocus|FocusedApp)=[^\n]*?\s([\w.]+)\/([\w.$]+)(?=[\s}])/u.exec(
    dumpsys,
  );
  const topResumed = /topResumedActivity=[^\n]*?\s([\w.]+)\/([\w.$]+)(?=[\s}])/u.exec(dumpsys);
  const m = windowComponent ?? topResumed;
  if (!m) return undefined;
  const [, pkg = '', act = ''] = m;
  if (!act) return undefined;
  if (act.startsWith('.')) return `${pkg}${act}`;
  return act;
}

/** `adb devices -l` → serials currently in state "device". */
export async function listAdbDevices(exec: AdbExec = spawnAdb): Promise<string[]> {
  const out = (await exec(['devices'])).toString('utf8');
  return out
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.endsWith('\tdevice'))
    .map((line) => line.split(/\s+/)[0]!);
}
