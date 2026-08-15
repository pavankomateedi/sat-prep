/**
 * T-11 / T-18 — Diagnostic and full-length practice tests, with the Bluebook
 * test-taking tools.
 *
 * The one place the 30-minute daily cap is deliberately suspended (PRD §2.4),
 * presented as its own event so the daily habit and the occasional checkpoint
 * stay distinct.
 *
 * The flow mirrors real delivery (PRD §1.2): module 1 is fixed and moderate,
 * then a single routing decision picks a harder or easier module 2. No
 * per-question adaptation, because the real test has none.
 *
 * Interaction state lives in src/assessment/moduleState.ts — answers, flags,
 * eliminated choices, navigation — so it is unit-tested rather than tangled
 * into this component.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
  Meter,
  Notice,
  Pill,
  Screen,
  Title,
} from '../src/ui/components';
import { MathText } from '../src/ui/MathText';
import { Figure } from '../src/ui/Figure';
import { Calculator } from '../src/ui/Calculator';
import { HighlightableText, QuestionNavigator, ReferenceSheet, ToolBar } from '../src/ui/TestTools';
import { colors, radius, spacing, type as typography } from '../src/ui/theme';
import { useBootstrap } from '../src/ui/useStudent';
import {
  buildSecondModule,
  buildTest,
  nextAssessmentDue,
  type TestModule,
} from '../src/assessment/testBuilder';
import {
  SCORING_DISCLAIMER,
  scoreComposite,
  scoreDomains,
  scoreSection,
  type RoutingPath,
} from '../src/assessment/scoring';
import { percentileBand } from '../src/assessment/percentiles';
import {
  addTime,
  answer as recordAnswer,
  createModuleState,
  currentQuestion,
  goTo,
  next as goNext,
  openReview,
  previous as goPrevious,
  progress as moduleProgress,
  toggleEliminated,
  toggleMark,
  type ModuleState,
} from '../src/assessment/moduleState';
import { getSection } from '../src/domain/taxonomy';
import type { AssessmentKind, Item, SectionScore } from '../src/domain/types';
import { checkAnswer } from '../src/session/answerCheck';
import * as repo from '../src/data/repositories';
import { toLocalDate } from '../src/lib/dates';

type Stage = 'idle' | 'running' | 'scored';

interface ModuleRun {
  module: TestModule;
  items: Item[];
}

export default function AssessmentScreen() {
  const router = useRouter();
  const { loading, student } = useBootstrap();

  const [stage, setStage] = useState<Stage>('idle');
  const [kind, setKind] = useState<AssessmentKind>('diagnostic');
  const [queue, setQueue] = useState<ModuleRun[]>([]);
  const [moduleIndex, setModuleIndex] = useState(0);
  const [state, setState] = useState<ModuleState>(() => createModuleState([]));
  const [answers, setAnswers] = useState<Map<string, string>>(new Map());
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [showTimer, setShowTimer] = useState(true);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof scoreComposite> | null>(null);
  const [cadence, setCadence] = useState<ReturnType<typeof nextAssessmentDue> | null>(null);
  const [seenCount, setSeenCount] = useState(0);
  // Guards the async module transition: two taps before repo.getItems
  // resolves would splice two module-2 runs and skip a module entirely.
  const [advancing, setAdvancing] = useState(false);

  const allItems = useRef<Item[]>([]);
  const usedIds = useRef<Set<string>>(new Set());
  const shownAt = useRef<number>(Date.now());

  useEffect(() => {
    if (!student) return;
    void (async () => {
      const [items, results] = await Promise.all([
        repo.getAllItems(),
        repo.getTestResults(student.id),
      ]);
      allItems.current = items;
      setCadence(nextAssessmentDue(results[0]?.takenOn ?? null, [], toLocalDate()));
    })();
  }, [student]);

  // Module timer. Expiry does not discard work — running out of time on the
  // real test does not void the section either.
  useEffect(() => {
    if (stage !== 'running') return;
    const id = setInterval(() => setSecondsLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [stage, moduleIndex]);

  const current = queue[moduleIndex];
  const question = currentQuestion(state);
  const currentItem = useMemo(
    () => current?.items.find((i) => i.id === question?.itemId),
    [current, question]
  );

  /** Bank the time spent on the question being left, then move. */
  const withTiming = useCallback((change: (s: ModuleState) => ModuleState) => {
    setState((s) => {
      const elapsed = Date.now() - shownAt.current;
      shownAt.current = Date.now();
      return change(addTime(s, s.currentIndex, elapsed));
    });
  }, []);

  const start = useCallback(
    async (selected: AssessmentKind) => {
      if (!student) return;
      const seen = await repo.getFsrsStates(student.id);
      const test = buildTest({
        kind: selected,
        items: allItems.current,
        seenItemIds: new Set(seen.keys()),
      });

      usedIds.current = new Set(test.modules.flatMap((m) => m.itemIds));
      const runs: ModuleRun[] = await Promise.all(
        test.modules.map(async (module) => ({
          module,
          items: await repo.getItems(module.itemIds),
        }))
      );

      setKind(selected);
      setQueue(runs);
      setSeenCount(test.previouslySeenCount);
      setModuleIndex(0);
      setState(createModuleState(runs[0]?.module.itemIds ?? []));
      setAnswers(new Map());
      setSecondsLeft(runs[0]?.module.timeLimitSeconds ?? 0);
      shownAt.current = Date.now();
      setStage('running');
    },
    [student]
  );

  /**
   * Finish a module: fold its answers into the running set, then either insert
   * the routed second module or move on.
   */
  const finishModule = useCallback(async () => {
    if (!current || !student || advancing) return;
    setAdvancing(true);
    try {

    const merged = new Map(answers);
    for (const q of state.questions) merged.set(q.itemId, q.response);
    setAnswers(merged);

    const halfLength = kind === 'diagnostic';
    if (current.module.index === 1 && !halfLength) {
      const correct = current.items.filter(
        (item) => checkAnswer(item, merged.get(item.id) ?? '').correct
      ).length;

      const second = buildSecondModule({
        items: allItems.current,
        section: current.module.section,
        module1Correct: correct,
        module1Total: current.items.length,
        exclude: usedIds.current,
      });

      const items = await repo.getItems(second.itemIds);
      setQueue((prev) => {
        const nextQueue = [...prev];
        nextQueue.splice(moduleIndex + 1, 0, { module: second, items });
        return nextQueue;
      });
      setModuleIndex((m) => m + 1);
      setState(createModuleState(second.itemIds));
      setSecondsLeft(second.timeLimitSeconds);
      shownAt.current = Date.now();
      return;
    }

    if (moduleIndex + 1 < queue.length) {
      const nextRun = queue[moduleIndex + 1]!;
      setModuleIndex((m) => m + 1);
      setState(createModuleState(nextRun.module.itemIds));
      setSecondsLeft(nextRun.module.timeLimitSeconds);
      shownAt.current = Date.now();
      return;
    }

      await score(merged);
    } finally {
      setAdvancing(false);
    }
  }, [current, student, answers, state, kind, moduleIndex, queue, advancing]);

  const score = useCallback(
    async (finalAnswers: Map<string, string>) => {
      if (!student) return;

      const sectionScores: (SectionScore & { halfWidth: number })[] = [];
      const domainResponses: { domain: Item['domain']; correct: boolean }[] = [];

      for (const section of ['rw', 'math'] as const) {
        const modules = queue.filter((r) => r.module.section === section);
        if (modules.length === 0) continue;

        const moduleOne = modules.find((m) => m.module.index === 1);
        const moduleTwo = modules.find((m) => m.module.index === 2);
        const count = (run: ModuleRun | undefined) =>
          run?.items.filter((i) => checkAnswer(i, finalAnswers.get(i.id) ?? '').correct).length ?? 0;

        for (const run of modules) {
          for (const item of run.items) {
            domainResponses.push({
              domain: item.domain,
              correct: checkAnswer(item, finalAnswers.get(item.id) ?? '').correct,
            });
          }
        }

        sectionScores.push(
          scoreSection({
            section,
            module1Correct: count(moduleOne),
            module1Total: moduleOne?.items.length ?? 0,
            module2Correct: count(moduleTwo),
            module2Total: moduleTwo?.items.length ?? 0,
            // A half-length diagnostic has no routing, so it is scored on the
            // uncapped scale; the wider confidence band carries the uncertainty.
            path: (moduleTwo?.module.path ?? 'harder') as RoutingPath,
          })
        );
      }

      const composite = scoreComposite(sectionScores);

      await repo.saveTestResult({
        id: repo.newId(),
        studentId: student.id,
        kind,
        takenOn: toLocalDate(),
        sectionScores: composite.sectionScores,
        domainScores: scoreDomains(domainResponses),
        totalScaled: composite.totalScaled,
        confidenceHalfWidth: composite.confidenceHalfWidth,
        attemptIds: [],
        synced: false,
      });

      setResult(composite);
      setStage('scored');
    },
    [student, queue, kind]
  );

  if (loading || !student) return <Screen><Loading /></Screen>;

  // ---------------------------------------------------------------- results
  if (stage === 'scored' && result) {
    const band = percentileBand(result.totalScaled, result.confidenceHalfWidth);
    return (
      <Screen>
        <Title>Your result</Title>
        <Card>
          <Label>Estimated score</Label>
          <Text style={styles.score}>{result.range}</Text>
          <Pill text={band.label} />
          <Body muted>{band.interpretation}</Body>
          <Notice>{SCORING_DISCLAIMER}</Notice>
          <Divider />
          {result.sectionScores.map((s) => (
            <View key={s.section} style={styles.sectionRow}>
              <Text style={styles.sectionName}>{getSection(s.section).name}</Text>
              <Text style={styles.sectionScore}>
                {s.rawCorrect}/{s.rawTotal} correct
              </Text>
            </View>
          ))}
        </Card>

        {seenCount > 0 ? (
          <Notice tone="warn">
            {seenCount} question{seenCount === 1 ? '' : 's'} had already appeared in daily
            practice, which nudges this score upward.
          </Notice>
        ) : null}

        <Button title="Back to progress" onPress={() => router.replace('/progress')} />
      </Screen>
    );
  }

  // -------------------------------------------------------- review screen
  if (stage === 'running' && current && state.reviewing) {
    return (
      <Screen scroll={false}>
        <QuestionNavigator
          state={state}
          onSelect={(index) => withTiming((s) => goTo(s, index))}
          onSubmit={() => void finishModule()}
          submitLabel={
            moduleIndex + 1 >= queue.length && !(current.module.index === 1 && kind !== 'diagnostic')
              ? 'Finish and score'
              : 'Next module'
          }
        />
      </Screen>
    );
  }

  // ---------------------------------------------------------------- running
  if (stage === 'running' && current && currentItem && question) {
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft % 60;
    const outOfTime = secondsLeft === 0;
    const isMath = current.module.section === 'math';
    const summary = moduleProgress(state);

    return (
      <Screen>
        <View style={styles.timerRow}>
          <Label>
            {getSection(current.module.section).name} · Module {current.module.index}
          </Label>
          <Pressable
            onPress={() => setShowTimer((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={showTimer ? 'Hide timer' : 'Show timer'}
          >
            <Text style={[styles.timer, outOfTime && { color: colors.incorrect }]}>
              {showTimer ? `${minutes}:${String(seconds).padStart(2, '0')}` : 'Show time'}
            </Text>
          </Pressable>
        </View>
        <Meter value={(state.currentIndex + 1) / state.questions.length} height={6} />

        {outOfTime ? (
          <Notice tone="warn">Time is up for this module. Finish when you are ready.</Notice>
        ) : null}

        <Card>
          <Caption>
            Question {state.currentIndex + 1} of {state.questions.length}
          </Caption>

          {currentItem.stimulus ? (
            <View style={styles.stimulus}>
              <HighlightableText>{currentItem.stimulus}</HighlightableText>
            </View>
          ) : null}
          {currentItem.stimulusB ? (
            <View style={styles.stimulus}>
              <HighlightableText>{currentItem.stimulusB}</HighlightableText>
            </View>
          ) : null}
          {currentItem.figure ? <Figure figure={currentItem.figure} /> : null}

          <View style={{ marginTop: spacing.md }}>
            <MathText>{currentItem.stem}</MathText>
          </View>

          {currentItem.itemType === 'mcq' ? (
            <View style={styles.choices}>
              {(currentItem.choices ?? []).map((choice) => {
                const selected = question.response === choice.id;
                const struck = question.eliminated.includes(choice.id);
                return (
                  <View key={choice.id} style={styles.choiceRow}>
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setState((s) => recordAnswer(s, choice.id))}
                      style={[
                        styles.choice,
                        selected && styles.choiceChosen,
                        struck && styles.choiceStruck,
                      ]}
                    >
                      <Text style={styles.choiceId}>{choice.id}</Text>
                      <View style={{ flex: 1 }}>
                        <MathText fontSize={16} color={struck ? colors.textFaint : colors.text}>
                          {choice.text}
                        </MathText>
                      </View>
                      {struck ? <View style={styles.strikeLine} /> : null}
                    </Pressable>

                    {/* The eliminator: cross out what you have ruled out. */}
                    <Pressable
                      onPress={() => setState((s) => toggleEliminated(s, choice.id))}
                      accessibilityRole="button"
                      accessibilityLabel={`${struck ? 'Restore' : 'Eliminate'} choice ${choice.id}`}
                      style={styles.eliminate}
                    >
                      <Text style={[styles.eliminateText, struck && styles.eliminateActive]}>
                        {struck ? '↺' : '⊘'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : (
            <TextInput
              value={question.response}
              onChangeText={(text) => setState((s) => recordAnswer(s, text))}
              keyboardType="numbers-and-punctuation"
              placeholder="Your answer"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
            />
          )}

          <ToolBar
            marked={question.marked}
            onToggleMark={() => setState(toggleMark)}
            showMathTools={isMath}
            onOpenCalculator={() => setCalculatorOpen(true)}
            onOpenReference={() => setReferenceOpen(true)}
            onOpenNavigator={() => withTiming(openReview)}
          />
        </Card>

        <View style={styles.navRow}>
          <Button
            title="Back"
            variant="secondary"
            onPress={() => withTiming(goPrevious)}
            disabled={state.currentIndex === 0}
          />
          <Button
            title={state.currentIndex + 1 >= state.questions.length ? 'Review' : 'Next'}
            onPress={() => withTiming(goNext)}
          />
        </View>
        <Caption>
          {summary.answered} of {summary.total} answered
          {summary.marked > 0 ? ` · ${summary.marked} flagged` : ''}
        </Caption>

        <Calculator visible={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
        <ReferenceSheet visible={referenceOpen} onClose={() => setReferenceOpen(false)} />
      </Screen>
    );
  }

  // ------------------------------------------------------------------- idle
  return (
    <Screen>
      <Title>Practice test</Title>
      {cadence ? <Notice tone={cadence.due ? 'warn' : 'neutral'}>{cadence.reason}</Notice> : null}

      <Card>
        <Pill text="About 67 minutes" />
        <Heading>Baseline diagnostic</Heading>
        <Body muted>
          One module per section. Enough to set a starting point across all eight domains
          without a two-hour sit-down on day one.
        </Body>
        <Button title="Start diagnostic" onPress={() => void start('diagnostic')} />
      </Card>

      <Card>
        <Pill text="About 134 minutes" />
        <Heading>Full-length practice test</Heading>
        <Body muted>
          Two modules per section with real timing, and a second module that routes harder or
          easier based on how the first goes — the way the real test works.
        </Body>
        <Button
          title="Start full-length test"
          variant="secondary"
          onPress={() => void start('full_length')}
        />
      </Card>

      <Card>
        <Heading>The same tools as the real test</Heading>
        <Body muted>
          Flag questions for review, cross out answers you have ruled out, jump between
          questions, highlight the text, and open the calculator and formula sheet on Math.
          Practising without these trains a different task from the one you will sit.
        </Body>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  timerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  timer: { ...typography.title, color: colors.text, fontVariant: ['tabular-nums'] },
  score: { ...typography.display, color: colors.text, marginVertical: spacing.sm },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  sectionName: { ...typography.body, color: colors.text },
  sectionScore: { ...typography.label, color: colors.textMuted },
  stimulus: {
    marginTop: spacing.md,
    paddingLeft: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.accentSoft,
  },
  choices: { marginTop: spacing.md, gap: spacing.sm },
  choiceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  choice: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    minHeight: 52,
  },
  choiceChosen: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  choiceStruck: { opacity: 0.55, backgroundColor: colors.surfaceAlt },
  strikeLine: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    height: 1.5,
    backgroundColor: colors.textMuted,
  },
  choiceId: { ...typography.label, color: colors.textMuted, width: 20 },
  eliminate: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  eliminateText: { fontSize: 20, color: colors.textFaint },
  eliminateActive: { color: colors.accent },
  input: {
    marginTop: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 52,
    fontSize: 18,
    color: colors.text,
  },
  navRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});
