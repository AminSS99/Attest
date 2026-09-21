/**
 * SDK signatures and network-domain extraction.
 *
 * SDK detection matches known binary package prefixes against DEX type
 * descriptors (strings like "Lcom/google/firebase/analytics/FirebaseAnalytics;").
 * Every detection carries the matched prefixes as cited evidence — the
 * product never claims an SDK it cannot point to.
 */

import type { SdkFact } from 'attest-schema';

export interface SdkSignature {
  id: string;
  vendor: string;
  name: string;
  /** Slash-style package prefixes as they appear in DEX descriptors. */
  packages: string[];
}

export const SDK_SIGNATURES: readonly SdkSignature[] = [
  { id: 'com.google.firebase.analytics', vendor: 'Google', name: 'Firebase Analytics', packages: ['com/google/firebase/analytics'] },
  { id: 'com.google.firebase.crashlytics', vendor: 'Google', name: 'Firebase Crashlytics', packages: ['com/google/firebase/crashlytics'] },
  { id: 'com.google.firebase.messaging', vendor: 'Google', name: 'Firebase Cloud Messaging', packages: ['com/google/firebase/messaging'] },
  { id: 'com.google.firebase.core', vendor: 'Google', name: 'Firebase Core', packages: ['com/google/firebase'] },
  { id: 'com.google.android.gms.ads', vendor: 'Google', name: 'Google Mobile Ads (AdMob)', packages: ['com/google/android/gms/ads'] },
  { id: 'com.facebook.sdk', vendor: 'Meta', name: 'Facebook SDK', packages: ['com/facebook'] },
  { id: 'com.amplitude', vendor: 'Amplitude', name: 'Amplitude Analytics', packages: ['com/amplitude'] },
  { id: 'io.sentry', vendor: 'Sentry', name: 'Sentry', packages: ['io/sentry'] },
  { id: 'com.mixpanel', vendor: 'Mixpanel', name: 'Mixpanel', packages: ['com/mixpanel'] },
  { id: 'com.appsflyer', vendor: 'AppsFlyer', name: 'AppsFlyer', packages: ['com/appsflyer'] },
  { id: 'com.adjust', vendor: 'Adjust', name: 'Adjust', packages: ['com/adjust'] },
  { id: 'com.braze', vendor: 'Braze', name: 'Braze', packages: ['com/braze', 'com/appboy'] },
  { id: 'com.revenuecat', vendor: 'RevenueCat', name: 'RevenueCat', packages: ['com/revenuecat'] },
  { id: 'com.onesignal', vendor: 'OneSignal', name: 'OneSignal', packages: ['com/onesignal'] },
  { id: 'com.stripe', vendor: 'Stripe', name: 'Stripe', packages: ['com/stripe/android'] },
  { id: 'com.mapbox', vendor: 'Mapbox', name: 'Mapbox', packages: ['com/mapbox'] },
  { id: 'io.branch', vendor: 'Branch', name: 'Branch', packages: ['io/branch'] },
  { id: 'io.intercom', vendor: 'Intercom', name: 'Intercom', packages: ['io/intercom'] },
  { id: 'com.segment', vendor: 'Twilio Segment', name: 'Segment Analytics', packages: ['com/segment'] },
  { id: 'com.instabug', vendor: 'Instabug', name: 'Instabug', packages: ['com/instabug'] },
  { id: 'com.datadog', vendor: 'Datadog', name: 'Datadog', packages: ['com/datadog'] },
];

/** Detect SDKs from DEX strings. Matches are deduplicated and carry evidence. */
export function detectSdks(dexStrings: Iterable<string>): SdkFact[] {
  const found = new Map<string, Set<string>>();
  for (const s of dexStrings) {
    if (s.length < 8 || s.charCodeAt(0) !== 0x4c /* 'L' */) continue;
    for (const sig of SDK_SIGNATURES) {
      for (const prefix of sig.packages) {
        if (s.startsWith('L' + prefix + '/')) {
          let set = found.get(sig.id);
          if (!set) found.set(sig.id, (set = new Set()));
          set.add(prefix);
        }
      }
    }
  }
  return [...found.entries()]
    .map(([id, set]) => {
      const sig = SDK_SIGNATURES.find((x) => x.id === id)!;
      return {
        id: sig.id,
        vendor: sig.vendor,
        name: sig.name,
        matchedPackages: [...set].sort(),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

const URL_HOST_RE =
  /https?:\/\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?){1,})/gi;

/** Hosts that appear in binaries constantly and are never user-data destinations. */
const IGNORED_HOST_SUFFIXES = [
  'localhost',
  'w3.org',
  'schemas.android.com',
  'apache.org',
  'xml.org',
  'json-schema.org',
  'purl.org',
  'oasis-open.org',
  'example.com',
  'example.org',
  'iana.org',
];

/** Extract candidate network destination hosts from DEX strings. */
export function extractDomains(dexStrings: Iterable<string>): string[] {
  const hosts = new Set<string>();
  for (const s of dexStrings) {
    if (!s.includes('http')) continue;
    URL_HOST_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = URL_HOST_RE.exec(s)) !== null) {
      const host = m[1]!.toLowerCase();
      if (IGNORED_HOST_SUFFIXES.some((sfx) => host === sfx || host.endsWith('.' + sfx))) continue;
      hosts.add(host);
    }
  }
  return [...hosts].sort();
}
