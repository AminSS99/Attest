/**
 * Deterministic mapping tables.
 *
 * DANGEROUS_PERMISSION_TO_DATA_TYPE links Android runtime permissions to the
 * canonical Data Safety data types they make plausible. Only high-confidence
 * pairs are included; anything unmapped still surfaces as a review item, but
 * never as a fabricated contradiction (PRODUCT_PLAN §11 — deterministic
 * reasons whenever possible).
 */

export interface PermissionMapping {
  permission: string;
  dataType: string;
  label: string;
}

export const PERMISSION_MAPPINGS: readonly PermissionMapping[] = [
  { permission: 'android.permission.ACCESS_FINE_LOCATION', dataType: 'location.precise_location', label: 'Precise location' },
  { permission: 'android.permission.ACCESS_COARSE_LOCATION', dataType: 'location.approximate_location', label: 'Approximate location' },
  { permission: 'android.permission.CAMERA', dataType: 'photos_and_videos.photos', label: 'Camera (photos)' },
  { permission: 'android.permission.RECORD_AUDIO', dataType: 'audio.voice_or_sound_recordings', label: 'Microphone (voice or sound recordings)' },
  { permission: 'android.permission.READ_CONTACTS', dataType: 'personal_info.contacts', label: 'Contacts' },
  { permission: 'android.permission.WRITE_CONTACTS', dataType: 'personal_info.contacts', label: 'Contacts' },
  { permission: 'android.permission.READ_PHONE_NUMBERS', dataType: 'personal_info.phone_number', label: 'Phone number' },
  { permission: 'android.permission.READ_SMS', dataType: 'messages.sms', label: 'SMS messages' },
  { permission: 'android.permission.READ_CALENDAR', dataType: 'calendar.calendar_events', label: 'Calendar events' },
  { permission: 'android.permission.WRITE_CALENDAR', dataType: 'calendar.calendar_events', label: 'Calendar events' },
  { permission: 'android.permission.READ_MEDIA_IMAGES', dataType: 'photos_and_videos.photos', label: 'Photos' },
  { permission: 'android.permission.READ_MEDIA_VIDEO', dataType: 'photos_and_videos.videos', label: 'Videos' },
  { permission: 'android.permission.READ_MEDIA_AUDIO', dataType: 'audio.music_and_audio', label: 'Music and audio' },
];

/** Dangerous-permission surface we treat as release-significant even without a data-type mapping. */
export const NOTABLE_PERMISSIONS: readonly string[] = [
  ...PERMISSION_MAPPINGS.map((m) => m.permission),
  'android.permission.READ_PHONE_STATE',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.BLUETOOTH_SCAN',
  'android.permission.BLUETOOTH_CONNECT',
  'android.permission.NEARBY_WIFI_DEVICES',
  'android.permission.ACTIVITY_RECOGNITION',
  'android.permission.BODY_SENSORS',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.QUERY_ALL_PACKAGES',
];

export function mappingForPermission(permission: string): PermissionMapping | undefined {
  return PERMISSION_MAPPINGS.find((m) => m.permission === permission);
}

export function permissionsForDataType(dataType: string): string[] {
  return PERMISSION_MAPPINGS.filter((m) => m.dataType === dataType).map((m) => m.permission);
}
