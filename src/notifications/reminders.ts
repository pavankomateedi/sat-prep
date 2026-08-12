/**
 * Notification scheduling — the thin React Native wrapper.
 *
 * All the decisions live in schedule.ts, which has no RN imports and is unit
 * tested in Node. This file only talks to expo-notifications, so there is very
 * little here that can be wrong in an interesting way.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Administration } from '../domain/program';
import { toLocalDate, type LocalDate } from '../lib/dates';
import {
  DAILY_REMINDER_ID,
  messageForDay,
  plannedLogisticsReminders,
  type ReminderSettings,
} from './schedule';

export async function requestPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  if (!existing.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/**
 * Schedule (or reschedule) the single daily reminder.
 *
 * Always cancels first: rescheduling without cancelling is how apps end up
 * firing four notifications a day after a few settings changes.
 */
export async function scheduleDailyReminder(settings: ReminderSettings): Promise<boolean> {
  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID).catch(() => {});
  if (!settings.enabled) return false;

  const granted = await requestPermission();
  if (!granted) return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('daily', {
      name: 'Daily session',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 200],
    });
  }

  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_REMINDER_ID,
    // Silent by design: a cue, not an alarm.
    content: { title: 'SAT practice', body: messageForDay(toLocalDate()), sound: false },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: settings.hour,
      minute: settings.minute,
      channelId: 'daily',
    },
  });

  return true;
}

/**
 * Called after a session completes, so someone who practises in the morning is
 * not pinged in the evening about work they have already done.
 */
export async function clearTodaysReminder(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync().catch(() => {});
}

export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}

/** Schedule logistics reminders. Safe to call repeatedly — ids are stable. */
export async function scheduleLogisticsReminders(
  administrations: readonly Administration[],
  today: LocalDate = toLocalDate()
): Promise<number> {
  const granted = await requestPermission();
  if (!granted) return 0;

  const planned = plannedLogisticsReminders(administrations, today);
  for (const reminder of planned) {
    await Notifications.cancelScheduledNotificationAsync(reminder.id).catch(() => {});
    const [year, month, day] = reminder.date.split('-').map(Number);
    await Notifications.scheduleNotificationAsync({
      identifier: reminder.id,
      content: { title: reminder.title, body: reminder.body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(year!, month! - 1, day!, 9, 0, 0),
      },
    });
  }

  return planned.length;
}

export {
  DAILY_REMINDER_ID,
  DEFAULT_REMINDER,
  REGISTRATION_LEAD_DAYS,
  SCORE_REPORTING_NOTES,
  TEST_DAY_CHECKLIST,
  formatReminderTime,
  parseReminderTime,
  plannedLogisticsReminders,
  type ReminderSettings,
} from './schedule';
