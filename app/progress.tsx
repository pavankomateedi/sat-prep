/**
 * Progress.
 *
 * PRD §2.6 constrains this screen more than any other: "make progress visible
 * in a way that's actually true to the evidence — trend lines and domain-level
 * movement over time, not a single 'predicted score' number overstating
 * precision." So scores appear as ranges, mastery decays with retrievability,
 * and skills with too little evidence say so rather than showing a number.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Body,
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
import { colors, domainColors, spacing, type as typography } from '../src/ui/theme';
import { useBootstrap } from '../src/ui/useStudent';
import { computeMastery } from '../src/session/service';
import { decidePhase, budgetFor } from '../src/domain/phases';
import { ALL_DOMAINS, getDomain } from '../src/domain/taxonomy';
import type { DomainId } from '../src/domain/taxonomy';
import type { FullLengthTestResult } from '../src/domain/types';
import * as repo from '../src/data/repositories';
import { SCORING_DISCLAIMER } from '../src/assessment/scoring';
import { percentileBand } from '../src/assessment/percentiles';
import { calibrationReport, type CalibrationReport } from '../src/scheduling/fsrs';
import { ELO_CONVERGENCE_ATTEMPTS } from '../src/scheduling/elo';

export default function ProgressScreen() {
  const { loading, student } = useBootstrap();
  const [mastery, setMastery] = useState<Map<DomainId, number> | null>(null);
  const [results, setResults] = useState<FullLengthTestResult[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [calibration, setCalibration] = useState<CalibrationReport | null>(null);
  const [phaseLabel, setPhaseLabel] = useState('');

  useEffect(() => {
    if (!student) return;
    void (async () => {
      const decision = decidePhase(student, 0);
      const snapshot = await computeMastery(student, decision.phase);
      const refined = decidePhase(student, snapshot.masteredFraction);

      const [testResults, attemptCount, calibrationInputs] = await Promise.all([
        repo.getTestResults(student.id),
        repo.getAttemptCount(student.id),
        repo.getCalibrationInputs(student.id),
      ]);

      setMastery(snapshot.byDomain);
      setResults(testResults);
      setAttempts(attemptCount);
      setCalibration(calibrationReport(calibrationInputs));
      setPhaseLabel(`Phase ${refined.phase} · ${budgetFor(refined.phase).label}`);
    })();
  }, [student]);

  if (loading || !student || !mastery) return <Screen><Loading /></Screen>;

  const latest = results[0];
  const previous = results[1];

  return (
    <Screen>
      <Title>Progress</Title>
      <Pill text={phaseLabel} />

      <Card>
        <Heading>Practice test scores</Heading>
        {latest ? (
          <>
            <Text style={styles.scoreRange}>
              {latest.totalScaled - latest.confidenceHalfWidth}–
              {latest.totalScaled + latest.confidenceHalfWidth}
            </Text>
            <Caption>Taken {latest.takenOn}</Caption>

            {/* §4.1: an external anchor, so "improving" means something
                outside this app's own history. */}
            {(() => {
              const band = percentileBand(latest.totalScaled, latest.confidenceHalfWidth);
              return (
                <View style={{ marginTop: spacing.sm }}>
                  <Pill text={band.label} />
                  <Body muted>{band.interpretation}</Body>
                </View>
              );
            })()}

            {previous ? (
              <Body muted>
                Previous: {previous.totalScaled - previous.confidenceHalfWidth}–
                {previous.totalScaled + previous.confidenceHalfWidth} ({previous.takenOn}).{' '}
                {describeMovement(latest, previous)}
              </Body>
            ) : null}

            <Notice>{SCORING_DISCLAIMER}</Notice>
          </>
        ) : (
          <Body muted>
            No practice test yet. Take the baseline diagnostic to see where you are starting.
          </Body>
        )}
      </Card>

      <Card>
        <Heading>Mastery by domain</Heading>
        <Caption>
          Falls over time if a skill goes untouched — that is what tells the app to bring it back.
        </Caption>
        <View style={{ height: spacing.sm }} />

        {ALL_DOMAINS.map((domain) => {
          const value = mastery.get(domain.id) ?? 0;
          return (
            <View key={domain.id} style={styles.domainRow}>
              <View style={styles.domainHeader}>
                <Text style={styles.domainName}>{getDomain(domain.id).name}</Text>
                <Text style={styles.domainValue}>
                  {attempts < ELO_CONVERGENCE_ATTEMPTS ? '—' : `${Math.round(value * 100)}%`}
                </Text>
              </View>
              <Meter value={value} color={domainColors[domain.id] ?? colors.accent} />
            </View>
          );
        })}

        {attempts < ELO_CONVERGENCE_ATTEMPTS ? (
          <Notice>
            Not enough answers yet to say anything useful about mastery. This fills in after
            about {ELO_CONVERGENCE_ATTEMPTS} questions per skill.
          </Notice>
        ) : null}
      </Card>

      <Card>
        <Heading>How well the scheduler knows you</Heading>
        <Caption>
          Whether questions actually come back at the right time — the app checking its own
          predictions against what happened.
        </Caption>
        <Divider />
        {calibration && calibration.reviewCount >= 20 ? (
          <>
            <Label>Prediction error</Label>
            <Body>
              {(calibration.meanAbsoluteError * 100).toFixed(1)} percentage points across{' '}
              {calibration.reviewCount} reviews.
            </Body>
            <Caption>
              {calibration.meanAbsoluteError < 0.1
                ? 'Well calibrated — the schedule is matching your memory.'
                : 'Still settling. It improves as your review history grows.'}
            </Caption>
          </>
        ) : (
          <Body muted>
            Needs about 20 repeat reviews before this means anything. {attempts} answers so far.
          </Body>
        )}
      </Card>
    </Screen>
  );
}

/**
 * Compare two scores honestly.
 *
 * Overlapping confidence bands mean the difference is not distinguishable from
 * noise, and saying "up 40 points" in that case would be exactly the false
 * precision PRD §2.6 rules out.
 */
function describeMovement(
  latest: FullLengthTestResult,
  previous: FullLengthTestResult
): string {
  const delta = latest.totalScaled - previous.totalScaled;
  const combined = latest.confidenceHalfWidth + previous.confidenceHalfWidth;

  if (Math.abs(delta) < combined) {
    return 'The two ranges overlap, so this is not a clear change either way.';
  }
  return delta > 0
    ? `That is a clear improvement of roughly ${delta} points.`
    : `That is a clear drop of roughly ${Math.abs(delta)} points.`;
}

const styles = StyleSheet.create({
  scoreRange: { ...typography.display, color: colors.text, marginTop: spacing.xs },
  domainRow: { marginBottom: spacing.md },
  domainHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  domainName: { ...typography.body, color: colors.text, flex: 1 },
  domainValue: { ...typography.label, color: colors.textMuted },
});
