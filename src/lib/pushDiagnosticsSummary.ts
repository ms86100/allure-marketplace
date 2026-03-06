import type { DiagnosticResult } from './pushDiagnostics';

export type ActionType = 'none' | 'openSettings' | 'retry';

export interface UserFriendlyStatus {
  label: string;
  ok: boolean;
  actionType: ActionType;
  /** Message shown to the user */
  message: string;
}

/**
 * Converts the technical DiagnosticResult[] into 4 simple user-facing status items.
 * No technical jargon — just plain language.
 */
export function summariseDiagnostics(results: DiagnosticResult[]): UserFriendlyStatus[] {
  const find = (prefix: string) => results.find((r) => r.step.startsWith(prefix));

  // 1. Permission
  const permResult = find('3. Permission');
  const permOk = permResult?.ok ?? false;

  // 2. Device setup (plugin loaded + platform is native)
  const platformResult = find('1. Platform');
  const pluginResult = find('2. PushNotifications');
  const setupOk = (platformResult?.ok ?? false) && (pluginResult?.ok ?? false);

  // 3. Token registered in DB
  const dbResult = find('6. device_tokens');
  const registeredOk = dbResult?.ok ?? false;

  // 4. Delivery health (test notification queued)
  const queueResult = find('7. Queued test');
  const deliveryOk = queueResult?.ok ?? false;

  return [
    {
      label: 'Permission',
      ok: permOk,
      actionType: permOk ? 'none' : 'openSettings',
      message: permOk
        ? 'Notification permission is enabled'
        : 'Notifications are turned off',
    },
    {
      label: 'Device Setup',
      ok: setupOk,
      actionType: setupOk ? 'none' : 'retry',
      message: setupOk
        ? 'Your device is set up for notifications'
        : 'Setup incomplete — tap to retry',
    },
    {
      label: 'Registration',
      ok: registeredOk,
      actionType: registeredOk ? 'none' : 'retry',
      message: registeredOk
        ? 'Your device is registered'
        : 'Registration pending — tap to retry',
    },
    {
      label: 'Delivery',
      ok: deliveryOk,
      actionType: deliveryOk ? 'none' : 'none',
      message: deliveryOk
        ? 'Everything is working correctly'
        : 'Could not send test — please try again later',
    },
  ];
}
