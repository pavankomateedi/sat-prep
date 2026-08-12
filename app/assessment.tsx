/**
 * T-11 / T-18 — Diagnostic and full-length practice tests.
 *
 * This is the one place the 30-minute daily cap is deliberately suspended
 * (PRD §2.4), and it is presented as its own event rather than as a longer
 * session, so the daily habit and the occasional checkpoint stay distinct.
 *
 * The flow mirrors real delivery (PRD §1.2): module 1 is fixed and moderate,
 * then a single routing decision picks a harder or easier module 2. There is no
 * per-question adaptation, because the real test has none — and building it
 * would teach the student to expect something that will not happen.
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
  const [itemIndex, setItemIndex] = useState(0);
  const [responses, setResponses] = useState<Map<string, string>>(new Map());
  const [draft, setDraft] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [result, setResult] = useState<Awaited<ReturnType<typeof scoreComposite>> | null>(null);
  const [cadence, setCadence] = useState<ReturnType<typeof nextAssessmentDue> | null>(null);
  const [seenCount, setSeenCount] = useState(0);

  const allItems = useRef<Item[]>([]);
  const usedIds = useRef<Set<string>>(new Set());

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

  // Module timer. Expiry advances the module rather than discarding work —
  // running out of time on the real test does not void the section either.
  useEffect(() => {
    if (stage !== 'running') return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [stage, moduleIndex]);

  const start = useCallback(
    async (selected: AssessmentKind) => {
      if (!student) return;
      const seen = await repo.getFsrsStates(student.id);
      const seenIds = new Set(seen.keys());

      const test = buildTest({
        kind: selected,
        items: allItems.current,
        seenItemIds: seenIds,
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
      setItemIndex(0);
      setResponses(new Map());
      setDraft('');
      setSecondsLeft(runs[0]?.module.timeLimitSeconds ?? 0);
      setStage('running');
    },
    [student]
  );

  const current = queue[moduleIndex];
  const currentItem = current?.items[itemIndex];

  const commit = useCallback(() => {
    if (!currentItem) return;
    setResponses((prev) => new Map(prev).set(currentItem.id, draft));
    setDraft('');

    if (itemIndex + 1 < (current?.items.length ?? 0)) {
      setItemIndex((i) => i + 1);
    } else {
      void advanceModule(new Map(responses).set(currentItem.id, draft));
    }
  }, [currentItem, draft, itemIndex, current, responses]);

  /**
   * Move to the next module, inserting the routed second module after module 1
   * of each section. This is the only adaptive step in the whole test.
   */
  const advanceModule = useCallback(
    async (answers: Map<string, string>) => {
      if (!current || !student) return;

      const isModuleOne = current.module.index === 1;
      const halfLength = kind === 'diagnostic';

      if (isModuleOne && !halfLength) {
        const correct = current.items.filter(
          (item) => checkAnswer(item, answers.get(item.id) ?? '').correct
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
          const next = [...prev];
          next.splice(moduleIndex + 1, 0, { module: second, items });
          return next;
        });
        setModuleIndex((m) => m + 1);
        setItemIndex(0);
        setSecondsLeft(second.timeLimitSeconds);
        return;
      }

      if (moduleIndex + 1 < queue.length) {
        setModuleIndex((m) => m + 1);
        setItemIndex(0);
        setSecondsLeft(queue[moduleIndex + 1]!.module.timeLimitSeconds);
        return;
      }

      await finish(answers);
    },
    [current, student, kind, moduleIndex, queue]
  );

  const finish = useCallback(
    async (answers: Map<string, string>) => {
      if (!student) return;

      const sectionScores: (SectionScore & { halfWidth: number })[] = [];
      const domainResponses: { domain: Item['domain']; correct: boolean }[] = [];

      for (const section of ['rw', 'math'] as const) {
        const modules = queue.filter((r) => r.module.section === section);
        if (modules.length === 0) continue;

        const moduleOne = modules.find((m) => m.module.index === 1);
        const moduleTwo = modules.find((m) => m.module.index === 2);
        const count = (run: ModuleRun | undefined) =>
          run?.items.filter((i) => checkAnswer(i, answers.get(i.id) ?? '').correct).length ?? 0;

        for (const run of modules) {
          for (const item of run.items) {
            domainResponses.push({
              domain: item.domain,
              correct: checkAnswer(item, answers.get(item.id) ?? '').correct,
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
            // uncapped scale; its wider confidence band carries the uncertainty.
            path: (moduleTwo?.module.path ?? 'harder') as RoutingPath,
          })
        );
      }

      const composite = scoreComposite(sectionScores);
      const domainScores = scoreDomains(domainResponses);

      await repo.saveTestResult({
        id: repo.newId(),
        studentId: student.id,
        kind,
        takenOn: toLocalDate(),
        sectionScores: composite.sectionScores,
        domainScores,
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
    return (
      <Screen>
        <Title>Your result</Title>
        <Card>
          <Label>Estimated score</Label>
          <Text style={styles.score}>{result.range}</Text>
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
            {seenCount} question{seenCount === 1 ? '' : 's'} on this test had already appeared in
            daily practice, which nudges the score upward. Worth knowing when reading the number.
          </Notice>
        ) : null}

        <Button title="Back to progress" onPress={() => router.replace('/progress')} />
      </Screen>
    );
  }

  // ---------------------------------------------------------------- running
  if (stage === 'running' && current && currentItem) {
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft % 60;
    const outOfTime = secondsLeft === 0;

    return (
      <Screen>
        <View style={styles.timerRow}>
          <Label>
            {getSection(current.module.section).name} · Module {current.module.index}
          </Label>
          <Text style={[styles.timer, outOfTime && { color: colors.incorrect }]}>
            {minutes}:{String(seconds).padStart(2, '0')}
          </Text>
        </View>
        <Meter value={(itemIndex + 1) / current.items.length} height={6} />

        {outOfTime ? (
          <Notice tone="warn">Time is up for this module. Move on when you are ready.</Notice>
        ) : null}

        <Card>
          <Caption>
            Question {itemIndex + 1} of {current.items.length}
          </Caption>

          {currentItem.stimulus ? (
            <View style={styles.stimulus}>
              <MathText>{currentItem.stimulus}</MathText>
            </View>
          ) : null}
          {currentItem.stimulusB ? (
            <View style={styles.stimulus}>
              <MathText>{currentItem.stimulusB}</MathText>
            </View>
          ) : null}
          {currentItem.figure ? <Figure figure={currentItem.figure} /> : null}

          <View style={{ marginTop: spacing.md }}>
            <MathText>{currentItem.stem}</MathText>
          </View>

          {currentItem.itemType === 'mcq' ? (
            <View style={styles.choices}>
              {(currentItem.choices ?? []).map((choice) => (
                <Pressable
                  key={choice.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: draft === choice.id }}
                  onPress={() => setDraft(choice.id)}
                  style={[styles.choice, draft === choice.id && styles.choiceChosen]}
                >
                  <Text style={styles.choiceId}>{choice.id}</Text>
                  <View style={{ flex: 1 }}>
                    <MathText fontSize={16}>{choice.text}</MathText>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <TextInput
              value={draft}
              onChangeText={setDraft}
              keyboardType="numbers-and-punctuation"
              placeholder="Your answer"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
            />
          )}
        </Card>

        {/* No feedback during a test — that is what makes it a measurement. */}
        <Button
          title={itemIndex + 1 < current.items.length ? 'Next' : 'Finish module'}
          onPress={commit}
        />
      </Screen>
    );
  }

  // ------------------------------------------------------------------- idle
  return (
    <Screen>
      <Title>Practice test</Title>
      {cadence ? (
        <Notice tone={cadence.due ? 'warn' : 'neutral'}>{cadence.reason}</Notice>
      ) : null}

      <Card>
        <Pill text="About 67 minutes" />
        <Heading>Baseline diagnostic</Heading>
        <Body muted>
          One module per section. Enough to set a starting point across all eight domains
          without a two-hour sit-down on day one.
        </Body>
        <Button title="Start diagnostic" onPress={() => start('diagnostic')} />
      </Card>

      <Card>
        <Pill text="About 134 minutes" />
        <Heading>Full-length practice test</Heading>
        <Body muted>
          Two modules per section with real timing, and a second module that routes harder or
          easier based on how the first one goes — the way the real test works.
        </Body>
        <Button
          title="Start full-length test"
          variant="secondary"
          onPress={() => start('full_length')}
        />
      </Card>

      <Card>
        <Heading>Why not more often?</Heading>
        <Body muted>
          Full-length tests are worth real points on their own, but taking them constantly burns
          the question bank and works against the thirty-minutes-a-day design. Roughly once a
          term, plus before each real administration.
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
  choice: {
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
  choiceId: { ...typography.label, color: colors.textMuted, width: 20 },
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
});
