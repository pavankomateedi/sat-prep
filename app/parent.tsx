/**
 * T-12 — The parent's weekly summary.
 *
 * Scope is set by the parent user stories in PRD §2.1, and the exclusion is as
 * important as the inclusion: adherence and domain trend, *not* a feed of every
 * question the student got wrong. The data on this screen comes from
 * `buildWeeklySummary`, which runs `screenParentPayload` before returning — so
 * this component could not render item-level data even if someone tried to add
 * it here.
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
  Loading,
  Meter,
  Notice,
  Pill,
  Screen,
  Title,
} from '../src/ui/components';
import { colors, spacing, type as typography } from '../src/ui/theme';
import { useBootstrap } from '../src/ui/useStudent';
import {
  ADHERENCE,
  buildWeeklySummary,
  missingDigestWeeks,
  renderSummary,
  type RenderedSummary,
} from '../src/parent/summary';
import type { WeeklySummary } from '../src/domain/types';
import type { DomainId } from '../src/domain/taxonomy';
import { percentileBand } from '../src/assessment/percentiles';
import { computeMastery } from '../src/session/service';
import { decidePhase } from '../src/domain/phases';
import * as repo from '../src/data/repositories';
import { addDays, startOfWeek, toLocalDate } from '../src/lib/dates';

export default function ParentScreen() {
  const { loading, student } = useBootstrap();
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [rendered, setRendered] = useState<RenderedSummary | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    if (!student) return;
    void (async () => {
      const weekOf = addDays(startOfWeek(toLocalDate()), weekOffset * 7);
      const decision = decidePhase(student, 0);
      const snapshot = await computeMastery(student, decision.phase);

      const [practisedDates, minutesByDate, latestResult] = await Promise.all([
        repo.getCompletedDates(student.id),
        repo.getMinutesByDate(student.id),
        repo.getLatestTestResult(student.id),
      ]);

      // Real week-over-week movement, from the snapshot written when each
      // week's sessions were completed. Falls back to the current figure only
      // when no prior snapshot exists — the first week of the programme —
      // where zero movement is the honest answer rather than a placeholder.
      const weekStart = startOfWeek(weekOf);
      const [thisWeekSnapshot, lastWeekSnapshot] = await Promise.all([
        repo.getMasterySnapshot(student.id, weekStart),
        repo.getMasterySnapshot(student.id, addDays(weekStart, -7)),
      ]);

      const currentMastery =
        thisWeekSnapshot.size > 0
          ? (thisWeekSnapshot as Map<DomainId, number>)
          : snapshot.byDomain;
      const previousMastery =
        lastWeekSnapshot.size > 0
          ? (lastWeekSnapshot as Map<DomainId, number>)
          : currentMastery;

      const built = buildWeeklySummary({
        studentId: student.id,
        weekOf,
        practisedDates,
        minutesByDate,
        masteryByDomain: currentMastery,
        previousMasteryByDomain: previousMastery,
        latestResult,
        programStartDate: student.programStartDate,
      });

      setSummary(built);
      setRendered(renderSummary(built));

      // T-20: persist any weeks that have no digest yet, so the parent's feed
      // is complete even if the device was closed all weekend.
      const generated = await repo.getGeneratedDigestWeeks(student.id);
      const missing = missingDigestWeeks(toLocalDate(), generated, student.programStartDate, 4);
      for (const week of missing) {
        await repo.saveDigest(
          buildWeeklySummary({
            studentId: student.id,
            weekOf: week,
            practisedDates,
            minutesByDate,
            masteryByDomain: snapshot.byDomain,
            previousMasteryByDomain: snapshot.byDomain,
            latestResult,
            programStartDate: student.programStartDate,
          })
        );
      }
    })();
  }, [student, weekOffset]);

  if (loading || !summary || !rendered) return <Screen><Loading /></Screen>;

  const onTrack = summary.daysPracticed >= ADHERENCE.healthyWeekDays;

  return (
    <Screen>
      <Title>Week of {summary.weekStart}</Title>

      {summary.adherenceAlert ? (
        <Notice tone="warn">{summary.adherenceAlert}</Notice>
      ) : null}

      <Card>
        <Pill text={onTrack ? 'On track' : 'Below target'} tone={onTrack ? 'good' : 'warn'} />
        <Text style={styles.big}>
          {summary.daysPracticed}
          <Text style={styles.bigMuted}> / {summary.daysInWeek} days</Text>
        </Text>
        <Meter value={summary.daysPracticed / summary.daysInWeek} />
        <View style={{ height: spacing.sm }} />
        <Body muted>{rendered.adherenceLine}</Body>
      </Card>

      <Card>
        <Heading>Practice test</Heading>
        {rendered.scoreLine && summary.latestScore ? (
          <>
            <Body>{rendered.scoreLine}</Body>
            {(() => {
              // §4.1: the trend line needs an external anchor, otherwise
              // "improving" means nothing outside this app.
              const band = percentileBand(
                summary.latestScore.totalScaled,
                summary.latestScore.confidenceHalfWidth
              );
              return (
                <>
                  <Body muted>
                    Roughly the {band.label} nationally. {band.interpretation}
                  </Body>
                  <Caption>{band.disclaimer}</Caption>
                </>
              );
            })()}
            <Caption>
              Reported as a range because a practice test cannot pin a score more precisely
              than that.
            </Caption>
          </>
        ) : (
          <Body muted>No practice test taken yet.</Body>
        )}
      </Card>

      <Card>
        <Heading>Where things stand</Heading>
        <Caption>Domain-level movement. Question-by-question detail stays with the student.</Caption>
        <Divider />

        <Label>Strongest movement</Label>
        {rendered.improving.length > 0 ? (
          rendered.improving.map((d) => (
            <View key={d.domain} style={styles.trendRow}>
              <Text style={styles.trendName}>{d.name}</Text>
              <Text style={[styles.trendDelta, { color: colors.correct }]}>+{d.delta}%</Text>
            </View>
          ))
        ) : (
          <Body muted>Nothing has moved measurably this week.</Body>
        )}

        <View style={{ height: spacing.md }} />

        <Label>Needs attention</Label>
        {rendered.needsWork.map((d) => (
          <View key={d.domain} style={styles.trendRow}>
            <Text style={styles.trendName}>{d.name}</Text>
            <Text style={styles.trendDelta}>{d.delta === 0 ? 'flat' : `${d.delta}%`}</Text>
          </View>
        ))}
      </Card>

      <View style={styles.navRow}>
        <Button title="← Earlier week" variant="quiet" onPress={() => setWeekOffset((w) => w - 1)} />
        {weekOffset < 0 ? (
          <Button title="Later week →" variant="quiet" onPress={() => setWeekOffset((w) => w + 1)} />
        ) : null}
      </View>

      <Card>
        <Heading>What this view deliberately omits</Heading>
        <Body muted>
          You will not see which specific questions were missed. That belongs to the student —
          a mistake they can revisit privately is a learning tool; a mistake that gets reported
          is a reason to hide it.
        </Body>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  big: { ...typography.display, color: colors.text, marginVertical: spacing.sm },
  bigMuted: { ...typography.title, color: colors.textMuted },
  trendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  trendName: { ...typography.body, color: colors.text, flex: 1 },
  trendDelta: { ...typography.label, color: colors.textMuted },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
});
