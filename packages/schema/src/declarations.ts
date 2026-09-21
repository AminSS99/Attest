/**
 * Declarations: the "Declared" evidence class. What the team tells the store,
 * users, and reviewers — imported in versioned, diffable representations so a
 * declaration snapshot can live inside an Evidence Capsule.
 */

export const DATA_SAFETY_SCHEMA_VERSION = 'attest.data-safety/1' as const;

/**
 * Canonical data-type identifiers, aligned with Google Play Data Safety
 * categories. The permission mapping table in attest-cli references these.
 */
export type DataTypeId =
  | 'location.approximate_location'
  | 'location.precise_location'
  | 'personal_info.name'
  | 'personal_info.email_address'
  | 'personal_info.phone_number'
  | 'personal_info.user_ids'
  | 'personal_info.contacts'
  | 'financial_info.payment_info'
  | 'health_and_fitness.health_info'
  | 'photos_and_videos.photos'
  | 'photos_and_videos.videos'
  | 'audio.voice_or_sound_recordings'
  | 'files_and_docs.files_and_docs'
  | 'calendar.calendar_events'
  | 'messages.sms'
  | 'messages.emails'
  | 'app_activity.app_interactions'
  | 'app_activity.installed_apps'
  | 'web_browsing.web_browsing_history'
  | 'app_info_and_performance.crash_logs'
  | 'app_info_and_performance.diagnostics'
  | 'device_or_other_ids.device_or_other_ids'
  | (string & {});

export interface CollectedDataType {
  id: DataTypeId;
  /** Whether the data leaves the device. */
  shared?: boolean;
  /** Whether collection is optional for the user. */
  optional?: boolean;
  purpose?: string;
}

/**
 * Versioned JSON representation of a Google Play Data Safety form
 * (PRODUCT_PLAN §9, weeks 3–4). Importable from JSON or a simple CSV.
 */
export interface DataSafetyDeclaration {
  schemaVersion: typeof DATA_SAFETY_SCHEMA_VERSION;
  /** Data types the form claims the app collects or shares. */
  collectedDataTypes: CollectedDataType[];
  /** Free-text names of SDKs/vendors the team disclosed anywhere in the form. */
  sdkDisclosures: string[];
  /** Destination hosts the team disclosed (processors, own backends). */
  domains: string[];
  /** When this snapshot of answers was effective/exported. */
  effectiveDate?: string;
  /** Where this declaration was imported from (file path, console export, ...). */
  source?: string;
}

export type DeclaredTextKind = 'privacy_policy' | 'store_listing' | 'reviewer_instructions';

/** Plain-text declared surface (privacy policy, store listing copy, reviewer notes). */
export interface DeclaredText {
  kind: DeclaredTextKind;
  /** Normalized to NFC, line endings preserved. */
  text: string;
  source?: string;
  importedAt: string;
}

/**
 * An approved exception (PRODUCT_PLAN §7): a truth gap the team consciously
 * accepts, with an owner and an expiry. Never silent.
 */
export interface ExceptionRecord {
  id: string;
  /** Rule or finding this exception covers. */
  covers: string;
  rationale: string;
  owner: string;
  /** ISO-8601 date after which the exception must be re-reviewed. */
  expiresAt: string;
  approvedBy: string;
  approvedAt: string;
}
