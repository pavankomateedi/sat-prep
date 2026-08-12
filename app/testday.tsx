/**
 * Test-day and registration logistics.
 *
 * PRD §4.1: "no registration or test-day logistics support (PSAT/SAT
 * registration reminders, score-reporting-to-colleges guidance) — out of scope
 * currently, though it is a real part of the family's actual job to be done."
 *
 * Dates that College Board has not yet published are labelled as estimates
 * rather than presented as facts. An app whose whole posture is honesty about
 * uncertainty cannot quietly invent a registration deadline.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Body,
  Button,
  Caption,
  Card,
  Divider,
  Heading,
  Label,
  Notice,
  Pill,
  Screen,
  Title,
} from '../src/ui/components';
import { colors, spacing, type as typography } from '../src/ui/theme';
import {
  DEFAULT_ADMINISTRATIONS,
  upcomingAdministrations,
  type Administration,
} from '../src/domain/program';
import {
  plannedLogisticsReminders,
  scheduleLogisticsReminders,
  SCORE_REPORTING_NOTES,
  TEST_DAY_CHECKLIST,
} from '../src/notifications/reminders';
import { daysBetween, toLocalDate } from '../src/lib/dates';

export default function TestDayScreen() {
  const today = toLocalDate();
  const [upcoming, setUpcoming] = useState<Administration[]>([]);
  const [scheduled, setScheduled] = useState<number | null>(null);

  useEffect(() => {
    setUpcoming(upcomingAdministrations(today));
  }, [today]);

  const reminders = plannedLogisticsReminders(DEFAULT_ADMINISTRATIONS, today);

  return (
    <Screen>
      <Title>Test day</Title>
      <Body muted>
        Registration deadlines, what to bring, and how scores get sent.
      </Body>

      <Card>
        <Heading>Coming up</Heading>
        {upcoming.length === 0 ? (
          <Body muted>Nothing scheduled.</Body>
        ) : (
          upcoming.map((admin) => {
            const days = daysBetween(today, admin.date);
            return (
              <View key={admin.id} style={styles.admin}>
                <View style={styles.adminHeader}>
                  <Text style={styles.adminLabel}>{admin.label}</Text>
                  <Text style={styles.adminDays}>
                    {days === 0 ? 'today' : days === 1 ? 'tomorrow' : `${days} days`}
                  </Text>
                </View>
                <Caption>
                  {admin.date}
                  {admin.registrationDeadline
                    ? ` · register by ${admin.registrationDeadline}`
                    : ''}
                </Caption>
                {admin.estimated ? <Pill text="Date estimated" tone="warn" /> : null}
                {admin.note ? <Caption>{admin.note}</Caption> : null}
              </View>
            );
          })
        )}

        <Notice tone="warn">
          These dates are estimates based on the usual annual pattern. College Board publishes
          administration dates about 18 months ahead — confirm each one and correct
          src/domain/program.ts.
        </Notice>

        <Button
          title={
            scheduled === null
              ? `Set ${reminders.length} reminders`
              : `${scheduled} reminders set`
          }
          variant="secondary"
          onPress={async () => setScheduled(await scheduleLogisticsReminders(DEFAULT_ADMINISTRATIONS, today))}
        />
        <Caption>
          Registration deadlines at 21, 7, and 2 days out, plus a reminder the night before each
          test.
        </Caption>
      </Card>

      <Card>
        <Heading>What to bring</Heading>
        <Divider />
        {TEST_DAY_CHECKLIST.map((line) => (
          <Text key={line} style={styles.item}>
            • {line}
          </Text>
        ))}
      </Card>

      <Card>
        <Heading>Sending scores</Heading>
        <Divider />
        {SCORE_REPORTING_NOTES.map((line) => (
          <Text key={line} style={styles.item}>
            • {line}
          </Text>
        ))}
        <Caption>
          Policies change. Verify against College Board and each college before relying on any
          of this.
        </Caption>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  admin: { marginBottom: spacing.md, gap: 4 },
  adminHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  adminLabel: { ...typography.body, color: colors.text, fontWeight: '600', flex: 1 },
  adminDays: { ...typography.label, color: colors.textMuted },
  item: { ...typography.caption, color: colors.textMuted, marginBottom: 6, lineHeight: 20 },
});
