/**
 * T-07 — The session runner.
 *
 * Two behaviours here come straight from tickets rather than taste:
 *
 *  - **The rationale appears only after the answer is committed** (T-08). It is
 *    not on screen while the student is choosing, and it is not skippable
 *    before submitting. Showing it earlier would convert a retrieval attempt
 *    into re-reading, which is precisely the substitution the evidence in PRD
 *    §4.1 says destroys the benefit.
 *
 *  - **Response time is measured per item and drives the FSRS grade**, so the
 *    timer starts when the item is displayed and stops on submit. That is why
 *    the back gesture is disabled on this route.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Body,
  Button,
  Caption,
  Card,
  Heading,
  Label,
  Loading,
  Meter,
  Pill,
  Screen,
} from '../src/ui/components';
import { MathText } from '../src/ui/MathText';
import { Figure } from '../src/ui/Figure';
import { TutorPanel } from '../src/ui/TutorPanel';
import { Calculator, CalculatorButton } from '../src/ui/Calculator';
import { HighlightableText, ReferenceSheet, ReferenceSheetButton } from '../src/ui/TestTools';
import { clearTodaysReminder } from '../src/notifications/reminders';
import * as repo from '../src/data/repositories';
import { colors, radius, spacing, type as typography } from '../src/ui/theme';
import { useBootstrap } from '../src/ui/useStudent';
import {
  completeSession,
  getOrCreateTodaySession,
  recordAnswer,
  runScheduledMaintenance,
  type TodaySession,
} from '../src/session/service';
import type { BlockKind, Item } from '../src/domain/types';
import { getSkill } from '../src/domain/taxonomy';

const BLOCK_LABEL: Record<BlockKind, string> = {
  warmup: 'Warm-up review',
  new_skill: 'New skill',
  mixed: 'Mixed practice',
  error_review: 'Error review',
};

const BLOCK_BLURB: Record<BlockKind, string> = {
  warmup: 'Things you have seen before, due for another look.',
  new_skill: 'Building something new.',
  mixed: 'Mixed questions, the way the real test comes at you.',
  error_review: 'Questions you missed before. Second attempt.',
};

interface Step {
  item: Item;
  blockKind: BlockKind;
}

export default function SessionScreen() {
  const router = useRouter();
  const { loading, student } = useBootstrap();
  const [today, setToday] = useState<TodaySession | null>(null);
  const [index, setIndex] = useState(0);
  const [response, setResponse] = useState('');
  const [submitted, setSubmitted] = useState<{ correct: boolean; rationale: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(false);
  const [tally, setTally] = useState({ correct: 0, total: 0 });
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);

  /**
   * Every already-submitted step, keyed by index — lets Back/Next page back
   * through what you've answered and review it (your response, right/wrong,
   * the rationale) rather than only ever moving forward.
   *
   * Deliberately read-only: re-answering a past step would mean undoing the
   * FSRS/Elo/BKT update and the attempt record `submit()` already made for
   * it, which the app has no safe way to reverse. So a step already in this
   * map is never re-submittable — the choice/input controls are disabled the
   * same way they are immediately after submitting the first time.
   */
  const [history, setHistory] = useState<
    Map<number, { response: string; correct: boolean; rationale: string }>
  >(new Map());

  const shownAt = useRef<number>(Date.now());
  const sessionStart = useRef<number>(Date.now());

  useEffect(() => {
    if (!student) return;
    void (async () => {
      const loaded = await getOrCreateTodaySession(student.id);
      setToday(loaded);

      // Resume from what's actually in the database, not from local state —
      // that's the only thing that survives a fresh mount. Closing and
      // reopening the app (or, on web, the tab) loses every piece of React
      // state, but the attempts already submitted for this session didn't
      // go anywhere. Reconstruct `steps` the same way the `steps` useMemo
      // does below — that memo hasn't recomputed for this `today` yet.
      const byId = new Map(loaded.items.map((i) => [i.id, i]));
      const loadedSteps = loaded.session.blocks.flatMap((block) =>
        block.itemIds
          .map((id) => byId.get(id))
          .filter((item): item is Item => item !== undefined)
      );

      const attempts = await repo.getAttemptsForSession(loaded.session.id);
      const attemptByItemId = new Map(attempts.map((a) => [a.itemId, a]));

      const restoredHistory = new Map<
        number,
        { response: string; correct: boolean; rationale: string }
      >();
      let correct = 0;
      let resumeIndex = 0;
      for (const item of loadedSteps) {
        const attempt = attemptByItemId.get(item.id);
        if (!attempt) break; // First never-answered step — this is where we resume.
        restoredHistory.set(resumeIndex, {
          response: attempt.response,
          correct: attempt.correct,
          rationale: item.rationale,
        });
        if (attempt.correct) correct += 1;
        resumeIndex += 1;
      }

      if (restoredHistory.size > 0) {
        setHistory(restoredHistory);
        setTally({ correct, total: restoredHistory.size });
      }

      if (loadedSteps.length > 0 && resumeIndex >= loadedSteps.length) {
        // Every step already has an attempt — this session was already
        // finished in an earlier visit. Land on the summary, not question 1.
        //
        // If the student answered the last question but closed the tab
        // before tapping "Finish", completeSession() never ran — completedAt
        // never got set, no mastery snapshot was saved for the week, and the
        // parent summary's adherence count would be permanently short one
        // day. Finish it properly now rather than just faking the UI state.
        if (!loaded.session.completedAt) {
          const completed = await completeSession(loaded.session, loaded.session.actualSeconds);
          void runScheduledMaintenance(student);
          void clearTodaysReminder();
          setToday({ ...loaded, session: completed });
        }
        setFinished(true);
      } else {
        setIndex(resumeIndex);
      }

      sessionStart.current = Date.now();
      shownAt.current = Date.now();
    })();
  }, [student]);

  const steps: Step[] = useMemo(() => {
    if (!today) return [];
    const byId = new Map(today.items.map((i) => [i.id, i]));
    return today.session.blocks.flatMap((block) =>
      block.itemIds
        .map((id) => byId.get(id))
        .filter((item): item is Item => item !== undefined)
        .map((item) => ({ item, blockKind: block.kind }))
    );
  }, [today]);

  const step = steps[index];

  const submit = useCallback(async () => {
    if (!student || !today || !step || submitted || response.trim() === '') return;
    setSaving(true);
    try {
      const outcome = await recordAnswer({
        student,
        session: today.session,
        item: step.item,
        response,
        responseTimeMs: Date.now() - shownAt.current,
        blockKind: step.blockKind,
        phase: today.phase,
      });
      setSubmitted({ correct: outcome.correct, rationale: outcome.rationale });
      setTally((t) => ({ correct: t.correct + (outcome.correct ? 1 : 0), total: t.total + 1 }));
      setHistory((h) => new Map(h).set(index, { response, correct: outcome.correct, rationale: outcome.rationale }));
    } finally {
      setSaving(false);
    }
  }, [student, today, step, submitted, response, index]);

  /** Land on a step: replay it read-only if it's already answered, else fresh. */
  const goToStep = useCallback(
    (target: number) => {
      const past = history.get(target);
      if (past) {
        setResponse(past.response);
        setSubmitted({ correct: past.correct, rationale: past.rationale });
      } else {
        setResponse('');
        setSubmitted(null);
        shownAt.current = Date.now();
      }
      setIndex(target);
    },
    [history]
  );

  const goBack = useCallback(() => {
    if (index === 0 || saving) return;
    goToStep(index - 1);
  }, [index, saving, goToStep]);

  const next = useCallback(async () => {
    if (index + 1 >= steps.length) {
      if (student && today) {
        const seconds = Math.round((Date.now() - sessionStart.current) / 1000);
        await completeSession(today.session, seconds);
        // Off the critical path: the student is already done.
        void runScheduledMaintenance(student);
        // Practising in the morning should not earn an evening nag.
        void clearTodaysReminder();
      }
      setFinished(true);
      return;
    }

    goToStep(index + 1);
  }, [index, steps.length, student, today, goToStep]);

  if (loading || !today) return <Screen><Loading label="Building today's session" /></Screen>;

  if (finished || steps.length === 0) {
    return (
      <Screen>
        <Card>
          <Pill text="Session complete" tone="good" />
          <Heading>
            {steps.length === 0
              ? 'Nothing scheduled today'
              : `${tally.correct} of ${tally.total} correct`}
          </Heading>
          <Body muted>
            {steps.length === 0
              ? 'The item bank has no questions ready for you right now.'
              : 'Everything you missed today will come back for another try. That is the point.'}
          </Body>
          <Button title="Done" onPress={() => router.replace('/')} />
        </Card>
      </Screen>
    );
  }

  if (!step) return <Screen><Loading /></Screen>;

  const { item, blockKind } = step;
  const skill = getSkill(item.skills[0]!);
  const isFirstOfBlock =
    index === 0 || steps[index - 1]?.blockKind !== blockKind;

  // The next question that's never been answered — where Back/forward
  // navigation should return you to resume. `history` is filled strictly in
  // order (submit() only ever writes the current step before advancing), so
  // its size is exactly that index.
  const pendingIndex = history.size;
  const isReviewingPast = pendingIndex < steps.length && index !== pendingIndex;

  return (
    <Screen
      footer={
        <View style={styles.navRow}>
          <Button title="Back" variant="secondary" onPress={goBack} disabled={index === 0 || saving} />
          {submitted ? (
            <Button title={index + 1 >= steps.length ? 'Finish' : 'Next'} onPress={next} />
          ) : (
            <Button
              title={saving ? 'Saving…' : 'Submit'}
              onPress={submit}
              disabled={saving || response.trim() === ''}
            />
          )}
        </View>
      }
    >
      <View style={styles.progressRow}>
        <Meter value={(index + (submitted ? 1 : 0)) / steps.length} height={6} />
        <View style={styles.progressLabelRow}>
          <Text style={styles.questionNumber}>
            Question {index + 1} of {steps.length}
          </Text>
          {isReviewingPast ? (
            <Pressable
              onPress={() => goToStep(pendingIndex)}
              accessibilityRole="button"
              accessibilityLabel={`Resume at question ${pendingIndex + 1}`}
              hitSlop={8}
            >
              <Text style={styles.pendingLink}>Resume Q{pendingIndex + 1} →</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {isFirstOfBlock ? (
        <View style={styles.blockIntro}>
          <Label>{BLOCK_LABEL[blockKind]}</Label>
          <Caption>{BLOCK_BLURB[blockKind]}</Caption>
        </View>
      ) : null}

      <Card>
        <Caption>{skill.name}</Caption>

        {item.stimulus ? (
          <View style={styles.stimulus}>
            <HighlightableText>{item.stimulus}</HighlightableText>
          </View>
        ) : null}

        {item.stimulusB ? (
          <View style={styles.stimulus}>
            <HighlightableText>{item.stimulusB}</HighlightableText>
          </View>
        ) : null}

        {item.figure ? <Figure figure={item.figure} /> : null}

        <View style={styles.stem}>
          <MathText>{item.stem}</MathText>
        </View>

        {item.itemType === 'mcq' ? (
          <View style={styles.choices}>
            {(item.choices ?? []).map((choice) => {
              const chosen = response === choice.id;
              const isKey = submitted && choice.id === item.answer;
              const isWrongChoice = submitted && chosen && !submitted.correct;

              return (
                <Pressable
                  key={choice.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: chosen }}
                  disabled={Boolean(submitted)}
                  onPress={() => setResponse(choice.id)}
                  style={[
                    styles.choice,
                    chosen && !submitted && styles.choiceChosen,
                    isKey && styles.choiceCorrect,
                    isWrongChoice && styles.choiceWrong,
                  ]}
                >
                  <View style={[styles.choiceBadge, chosen && !submitted && styles.choiceBadgeChosen]}>
                    <Text style={[styles.choiceBadgeText, chosen && !submitted && { color: '#FFF' }]}>
                      {choice.id}
                    </Text>
                  </View>
                  <View style={styles.choiceBody}>
                    <MathText fontSize={16}>{choice.text}</MathText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.sprWrap}>
            <Label>Your answer</Label>
            <TextInput
              value={response}
              onChangeText={setResponse}
              editable={!submitted}
              keyboardType="numbers-and-punctuation"
              placeholder="e.g. 9, 0.28, or 7/25"
              placeholderTextColor={colors.textFaint}
              style={[
                styles.sprInput,
                submitted?.correct && styles.sprCorrect,
                submitted && !submitted.correct && styles.sprWrong,
              ]}
              accessibilityLabel="Student-produced response"
            />
            <Caption>Fractions and decimals are both accepted.</Caption>
          </View>
        )}

        {/* Math questions get the same calculator and formula sheet as the
            real test. Offered during practice too, not only in timed tests —
            the point is to build the habit of reaching for them. */}
        {item.section === 'math' ? (
          <View style={styles.toolRow}>
            <CalculatorButton onPress={() => setCalculatorOpen(true)} />
            <ReferenceSheetButton onPress={() => setReferenceOpen(true)} />
          </View>
        ) : null}
      </Card>

      {/* T-08: the explanation is withheld until an answer is committed. */}
      {submitted ? (
        <Card style={submitted.correct ? styles.feedbackGood : styles.feedbackBad}>
          <Pill text={submitted.correct ? 'Correct' : 'Not quite'} tone={submitted.correct ? 'good' : 'bad'} />
          {!submitted.correct && item.itemType === 'spr' ? (
            <Body>
              Answer: {Array.isArray(item.answer) ? item.answer[0] : item.answer}
            </Body>
          ) : null}
          <View style={styles.rationale}>
            <MathText fontSize={15}>{submitted.rationale}</MathText>
          </View>

          {/* Optional, and absent unless an API key is configured. Offered only
              after a wrong answer, where a second explanation is actually
              worth something. */}
          {!submitted.correct ? (
            <TutorPanel item={item} studentResponse={response} />
          ) : null}
        </Card>
      ) : null}

      <Calculator visible={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
      <ReferenceSheet visible={referenceOpen} onClose={() => setReferenceOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressRow: { marginTop: spacing.md, gap: spacing.xs },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  questionNumber: { ...typography.label, color: colors.textMuted },
  pendingLink: { ...typography.label, color: colors.accent, fontWeight: '600' },
  navRow: { flexDirection: 'row', gap: spacing.sm },
  blockIntro: { marginTop: spacing.lg },
  stimulus: {
    marginTop: spacing.md,
    paddingLeft: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.accentSoft,
  },
  stem: { marginTop: spacing.md },
  choices: { marginTop: spacing.md, gap: spacing.sm },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 52,
  },
  choiceChosen: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  choiceCorrect: { borderColor: colors.correct, backgroundColor: colors.correctSoft },
  choiceWrong: { borderColor: colors.incorrect, backgroundColor: colors.incorrectSoft },
  choiceBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  choiceBadgeChosen: { backgroundColor: colors.accent },
  choiceBadgeText: { ...typography.label, color: colors.textMuted },
  choiceBody: { flex: 1 },
  sprWrap: { marginTop: spacing.md, gap: spacing.xs },
  sprInput: {
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 52,
    fontSize: 18,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  sprCorrect: { borderColor: colors.correct, backgroundColor: colors.correctSoft },
  sprWrong: { borderColor: colors.incorrect, backgroundColor: colors.incorrectSoft },
  toolRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  feedbackGood: { borderColor: colors.correct },
  feedbackBad: { borderColor: colors.incorrect },
  rationale: { marginTop: spacing.sm },
});
