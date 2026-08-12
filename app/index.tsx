/**
 * Home.
 *
 * The single most important sentence in the PRD's user stories: "I want today's
 * 30-minute session pre-built and waiting when I open the app, so I never have
 * to decide what to work on." So this screen has exactly one primary action,
 * and the session behind it is already composed before the button is tapped.
 *
 * Consistency is shown as a plain week strip rather than a streak counter.
 * PRD §2.6 asks for "a quiet, visible consistency indicator... rather than a
 * loud streak counter that punishes a single missed day with total reset" —
 * an eleventh-grader is a resistant audience for streak mechanics.
 */

import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import {
  Body,
  Button,
  Caption,
  Card,
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
import { getOrCreateTodaySession, type TodaySession } from '../src/session/service';
import { budgetFor } from '../src/domain/phases';
import * as repo from '../src/data/repositories';
import { addDays, toLocalDate, weekDates, type LocalDate } from '../src/lib/dates';
import { pendingSyncCount } from '../src/data/sync';

export default function HomeScreen() {
  const router = useRouter();
  const { loading, student, error, reload } = useBootstrap();
  const [today, setToday] = useState<TodaySession | null>(null);
  const [practised, setPractised] = useState<Set<LocalDate>>(new Set());
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!student) return;
    setBusy(true);
    try {
      const [session, dates, queued] = await Promise.all([
        getOrCreateTodaySession(student.id),
        repo.getCompletedDates(student.id),
        pendingSyncCount(),
      ]);
      setToday(session);
      setPractised(dates);
      setPending(queued);
    } finally {
      setBusy(false);
    }
  }, [student]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh on return from the session screen so the week strip updates.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (loading) return <Screen><Loading label="Opening your workbook" /></Screen>;

  if (error) {
    return (
      <Screen>
        <Title>Something went wrong</Title>
        <Body muted>{error}</Body>
        <Button title="Try again" onPress={reload} />
      </Screen>
    );
  }

  if (!student) return <Redirect href="/setup" />;

  const date = toLocalDate();
  const done = today?.session.completedAt !== null && today?.session.completedAt !== undefined;
  const totalItems = today?.session.blocks.reduce((n, b) => n + b.itemIds.length, 0) ?? 0;
  const budget = today ? budgetFor(today.phase) : null;

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Label>{formatToday(date)}</Label>
          <Text style={styles.greeting}>Hello, {student.displayName}</Text>
        </View>
        <Pressable
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          style={styles.iconButton}
        >
          <Text style={styles.iconText}>⚙</Text>
        </Pressable>
      </View>

      <WeekStrip practised={practised} today={date} />

      {busy && !today ? (
        <Loading label="Building today's session" />
      ) : done ? (
        <Card>
          <Pill text="Done for today" tone="good" />
          <Heading>Session complete</Heading>
          <Body muted>
            You finished today's {Math.round((today?.session.actualSeconds ?? 0) / 60)} minutes.
            Tomorrow's session will be waiting.
          </Body>
          <Button
            title="Review progress"
            variant="secondary"
            onPress={() => router.push('/progress')}
          />
        </Card>
      ) : (
        <Card>
          <Pill text={`Phase ${today?.phase ?? 'A'} · ${budget?.label ?? ''}`} />
          <Heading>30 minutes, ready to go</Heading>
          <Body muted>
            {totalItems} questions across warm-up, new skills, mixed practice, and error review.
          </Body>

          {today && today.notes.missedDays > 0 ? (
            <Notice>
              {today.notes.missedDays === 1
                ? 'You missed yesterday. Today folds those reviews in — nothing has piled up.'
                : `You missed ${today.notes.missedDays} days. Today folds those reviews in — nothing has piled up.`}
            </Notice>
          ) : null}

          <Button
            title={today?.session.startedAt ? 'Continue session' : 'Start session'}
            onPress={() => router.push('/session')}
            disabled={!today || totalItems === 0}
          />
        </Card>
      )}

      <Card>
        <Label>This programme</Label>
        <Body muted>
          Target test {student.targetTestDate}. {budget?.description ?? ''}
        </Body>
        <View style={styles.linkRow}>
          <Button title="Progress" variant="quiet" onPress={() => router.push('/progress')} />
          <Button
            title="Practice test"
            variant="quiet"
            onPress={() => router.push('/assessment')}
          />
          <Button title="For parents" variant="quiet" onPress={() => router.push('/parent')} />
        </View>
      </Card>

      {pending > 0 ? (
        <Caption>{pending} items saved on this device, waiting to back up.</Caption>
      ) : null}
    </Screen>
  );
}

/**
 * Seven dots, one per day. Deliberately not a streak: a missed day leaves a
 * gap, not a reset, which is the difference between information and punishment.
 */
function WeekStrip({ practised, today }: { practised: Set<LocalDate>; today: LocalDate }) {
  const days = weekDates(today);
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <View style={styles.week} accessibilityLabel="Days practised this week">
      {days.map((day, index) => {
        const isFuture = day > today;
        const didPractise = practised.has(day);
        return (
          <View key={day} style={styles.weekDay}>
            <View
              style={[
                styles.weekDot,
                didPractise && styles.weekDotDone,
                day === today && styles.weekDotToday,
                isFuture && styles.weekDotFuture,
              ]}
            />
            <Caption>{labels[index]}</Caption>
          </View>
        );
      })}
    </View>
  );
}

function formatToday(date: LocalDate): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: spacing.lg,
  },
  greeting: { ...typography.display, color: colors.text },
  iconButton: { padding: spacing.sm },
  iconText: { fontSize: 22, color: colors.textMuted },
  week: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  weekDay: { alignItems: 'center', gap: 6 },
  weekDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  weekDotDone: { backgroundColor: colors.accent },
  weekDotToday: { borderColor: colors.accent },
  weekDotFuture: { opacity: 0.4 },
  linkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});

export { addDays };
