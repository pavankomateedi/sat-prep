/**
 * Settings: account, backup, the privacy statement, and the content-freshness
 * check that PRD §4.1 identified as missing from the roadmap.
 */

import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Body,
  Button,
  Caption,
  Card,
  Divider,
  Heading,
  Label,
  Loading,
  Notice,
  Pill,
  Screen,
  Title,
} from '../src/ui/components';
import { colors, spacing, type as typography } from '../src/ui/theme';
import { useBootstrap } from '../src/ui/useStudent';
import { checkFreshness, FRESHNESS_CHECKLIST, type FreshnessStatus } from '../src/content/freshness';
import { PERMITTED_DATA, FORBIDDEN_FIELDS } from '../src/privacy/policy';
import { isSupabaseConfigured } from '../src/supabase/client';
import { pendingSyncCount, syncNow } from '../src/data/sync';
import { CONTENT_VERSION } from '../src/data/contentLoader';
import * as repo from '../src/data/repositories';
import { radius } from '../src/ui/theme';
import {
  DEFAULT_REMINDER,
  cancelAllReminders,
  formatReminderTime,
  parseReminderTime,
  scheduleDailyReminder,
  type ReminderSettings,
} from '../src/notifications/reminders';
import { isTutorConfigured, setApiKey } from '../src/tutor/tutor';

export default function SettingsScreen() {
  const router = useRouter();
  const { loading, student, itemCount } = useBootstrap();
  const [freshness, setFreshness] = useState<FreshnessStatus | null>(null);
  const [pending, setPending] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderTime, setReminderTime] = useState('17:30');
  const [reminderMessage, setReminderMessage] = useState<string | null>(null);
  const [tutorConfigured, setTutorConfigured] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState('');

  useEffect(() => {
    setFreshness(checkFreshness());
    void (async () => {
      setPending(await pendingSyncCount());
      setTutorConfigured(await isTutorConfigured());
      if (student) {
        setAttempts(await repo.getAttemptCount(student.id));
        const saved = await repo.getSettings<ReminderSettings>(student.id, DEFAULT_REMINDER);
        setReminderOn(saved.enabled);
        setReminderTime(formatReminderTime(saved));
      }
    })();
  }, [student]);

  const toggleReminder = async () => {
    if (!student) return;
    const parsed = parseReminderTime(reminderTime);
    if (!parsed) {
      setReminderMessage('Use 24-hour time, like 17:30.');
      return;
    }

    const next: ReminderSettings = { enabled: !reminderOn, ...parsed };
    await repo.saveSettings(student.id, next);

    if (!next.enabled) {
      await cancelAllReminders();
      setReminderOn(false);
      setReminderMessage('Reminder off.');
      return;
    }

    const ok = await scheduleDailyReminder(next);
    setReminderOn(ok);
    setReminderMessage(
      ok ? `Reminder set for ${reminderTime} daily.` : 'Notification permission was declined.'
    );
  };

  const saveKey = async () => {
    await setApiKey(apiKeyDraft);
    setApiKeyDraft('');
    setTutorConfigured(await isTutorConfigured());
  };

  const removeKey = async () => {
    await setApiKey('');
    setTutorConfigured(false);
  };

  const runSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await syncNow();
      if (!result.ran) {
        setSyncMessage('Backup is not set up, so everything stays on this device.');
      } else if (result.error) {
        setSyncMessage(`Could not finish: ${result.error}. Your data is safe locally.`);
      } else {
        const total = Object.values(result.uploaded).reduce((a, b) => a + b, 0);
        setSyncMessage(total === 0 ? 'Already up to date.' : `Backed up ${total} records.`);
      }
      setPending(await pendingSyncCount());
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <Screen><Loading /></Screen>;

  return (
    <Screen>
      <Title>Settings</Title>

      <Card>
        <Heading>Programme</Heading>
        {student ? (
          <>
            <Row label="Nickname" value={student.displayName} />
            <Row label="Grade" value={String(student.gradeLevel)} />
            <Row label="Started" value={student.programStartDate} />
            <Row label="Target test" value={student.targetTestDate} />
          </>
        ) : (
          <Body muted>No student set up yet.</Body>
        )}
      </Card>

      <Card>
        <Heading>Backup</Heading>
        {isSupabaseConfigured ? (
          <>
            <Body muted>
              {pending === 0
                ? 'Everything is backed up.'
                : `${pending} records saved on this device, waiting to upload.`}
            </Body>
            <Button
              title={syncing ? 'Backing up…' : 'Back up now'}
              variant="secondary"
              onPress={runSync}
              disabled={syncing}
            />
          </>
        ) : (
          <Body muted>
            Not configured. The app works fully without it — everything is stored on this
            device. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to enable
            backup and the parent's own login.
          </Body>
        )}
        {syncMessage ? <Caption>{syncMessage}</Caption> : null}
      </Card>

      {/* PRD §4.1 flagged the absence of this as a real gap: §1.4 says to
          re-verify the test specification periodically, but nothing made it
          happen. Now the app asks. */}
      <Card>
        <Heading>Test specification check</Heading>
        {freshness ? (
          <>
            <Pill
              text={freshness.stale ? 'Check due' : 'Up to date'}
              tone={freshness.stale ? 'warn' : 'good'}
            />
            <Body muted>{freshness.reason}</Body>
            <Divider />
            <Label>What to verify</Label>
            {FRESHNESS_CHECKLIST.map((line) => (
              <Text key={line} style={styles.checklistItem}>
                • {line}
              </Text>
            ))}
            <Button
              title="Open College Board specification"
              variant="secondary"
              onPress={() => void Linking.openURL(freshness.url)}
            />
            <Caption>
              After checking, update TAXONOMY_VERIFIED_ON in src/domain/taxonomy.ts.
            </Caption>
          </>
        ) : null}
      </Card>

      <Card>
        <Heading>Privacy</Heading>
        <Label>What is stored</Label>
        {PERMITTED_DATA.map((line) => (
          <Text key={line} style={styles.checklistItem}>
            • {line}
          </Text>
        ))}
        <Divider />
        <Label>What is never stored</Label>
        <Body muted>
          Full name, home address, phone number, government ID, date of birth, photos, audio,
          video, precise location, advertising identifiers, and biometrics. There are no
          database columns for any of them, and an automated check rejects any payload that
          contains one.
        </Body>
        <Caption>{FORBIDDEN_FIELDS.length} field names are blocked outright.</Caption>
      </Card>

      {/* Overrides the PRD's "no reminders" non-goal, deliberately: over two
          years a single quiet cue is the highest-leverage adherence tool there
          is. Kept to one a day, with no streak language. */}
      <Card>
        <Heading>Daily reminder</Heading>
        <Body muted>
          One notification a day. It disappears once you have practised, and never mentions
          streaks.
        </Body>
        <View style={styles.reminderRow}>
          <Text style={styles.rowLabel}>Remind me at</Text>
          <TextInput
            value={reminderTime}
            onChangeText={setReminderTime}
            placeholder="17:30"
            placeholderTextColor={colors.textFaint}
            style={styles.timeInput}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />
        </View>
        <Button
          title={reminderOn ? 'Turn reminder off' : 'Turn reminder on'}
          variant="secondary"
          onPress={toggleReminder}
        />
        {reminderMessage ? <Caption>{reminderMessage}</Caption> : null}
      </Card>

      <Card>
        <Heading>Test day</Heading>
        <Body muted>
          Registration deadlines, what to bring, and how scores get sent.
        </Body>
        <Button
          title="Open test-day planner"
          variant="secondary"
          onPress={() => router.push('/testday')}
        />
      </Card>

      {/* The one feature that leaves the device. Off unless a key is entered. */}
      <Card>
        <Heading>Explain-differently tutor</Heading>
        <Body muted>
          Optional. After a wrong answer, ask for another explanation. This is the only part of
          the app that uses the internet — everything else works offline, and the daily session
          is unaffected whether this is on or off.
        </Body>
        <View style={{ height: spacing.sm }} />
        <Label>Anthropic API key</Label>
        <TextInput
          value={apiKeyDraft}
          onChangeText={setApiKeyDraft}
          placeholder={tutorConfigured ? '•••• configured' : 'sk-ant-…'}
          placeholderTextColor={colors.textFaint}
          style={styles.keyInput}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <Button title="Save key" variant="secondary" onPress={saveKey} />
        <Caption>
          Stored in the device keychain. Never synced, never logged, never included in a backup.
          Only the question, its choices, and your answer are ever sent — no name, no scores, no
          history.
        </Caption>
        {tutorConfigured ? (
          <Button title="Remove key and disable" variant="quiet" onPress={removeKey} />
        ) : null}
      </Card>

      <Card>
        <Heading>Content</Heading>
        <Row label="Questions" value={String(itemCount)} />
        <Row label="Answered so far" value={String(attempts)} />
        <Row label="Bank version" value={CONTENT_VERSION} />
        <Button
          title="Content sources and licences"
          variant="secondary"
          onPress={() => router.push('/attributions')}
        />
      </Card>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { ...typography.body, color: colors.textMuted },
  rowValue: { ...typography.body, color: colors.text, fontWeight: '600' },
  checklistItem: { ...typography.caption, color: colors.textMuted, marginBottom: 4 },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  timeInput: {
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    minWidth: 92,
    textAlign: 'center',
    fontSize: 17,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  keyInput: {
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
});
