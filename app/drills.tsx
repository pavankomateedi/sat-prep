/**
 * Timed drills — a focused set on one skill, against the clock.
 *
 * Fills the gap between the daily session (untimed by design, because it is
 * about learning) and full-length tests (timed, but rare and expensive in
 * bank material). Paid tools all offer this middle option, and without it
 * there was no way to rehearse pacing on a weak area.
 *
 * Which skills are offered is driven by the analytics rather than a menu of
 * all thirty: the useful question is not "what could I drill" but "what should
 * I".
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
import { Calculator, CalculatorButton } from '../src/ui/Calculator';
import { HighlightableText, ReferenceSheet, ReferenceSheetButton } from '../src/ui/TestTools';
import { colors, radius, spacing, type as typography } from '../src/ui/theme';
import { useBootstrap } from '../src/ui/useStudent';
import { buildDrill, DRILL_SIZES, scopeTitle, type Drill, type DrillScope } from '../src/session/drills';
import { ALL_SKILLS, getSkill, type SkillId } from '../src/domain/taxonomy';
import type { Item } from '../src/domain/types';
import { checkAnswer } from '../src/session/answerCheck';
import { buildAttemptSamples } from '../src/analytics/samples';
import { weakestSkills } from '../src/analytics/pacing';
import * as repo from '../src/data/repositories';

type Phase = 'choose' | 'running' | 'done';

export default function DrillsScreen() {
  const router = useRouter();
  const { loading, student } = useBootstrap();

  const [phase, setPhase] = useState<Phase>('choose');
  const [items, setItems] = useState<Item[]>([]);
  const [suggested, setSuggested] = useState<{ skill: SkillId; label: string; accuracy: number }[]>([]);
  const [scope, setScope] = useState<DrillScope | null>(null);
  const [size, setSize] = useState<number>(10);
  const [timed, setTimed] = useState(true);

  const [drill, setDrill] = useState<Drill | null>(null);
  const [drillItems, setDrillItems] = useState<Item[]>([]);
  const [index, setIndex] = useState(0);
  const [response, setResponse] = useState('');
  const [answers, setAnswers] = useState<Map<string, string>>(new Map());
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!student) return;
    void (async () => {
      const [allItems, samples, fsrs] = await Promise.all([
        repo.getAllItems(),
        buildAttemptSamples(student.id),
        repo.getFsrsStates(student.id),
      ]);
      setItems(allItems);
      seenIds.current = new Set(fsrs.keys());
      setSuggested(
        weakestSkills(samples, (skill) => getSkill(skill).name).map((row) => ({
          skill: row.key as SkillId,
          label: row.label,
          accuracy: row.accuracy,
        }))
      );
    })();
  }, [student]);

  useEffect(() => {
    if (phase !== 'running' || !drill?.timed) return;
    const id = setInterval(() => setSecondsLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [phase, drill]);

  const start = useCallback(async () => {
    if (!scope) return;
    const built = buildDrill({
      scope,
      count: size,
      items,
      seenItemIds: seenIds.current,
      timed,
    });
    if (built.itemIds.length === 0) return;

    setDrill(built);
    setDrillItems(await repo.getItems(built.itemIds));
    setIndex(0);
    setResponse('');
    setAnswers(new Map());
    setSecondsLeft(built.timeLimitSeconds ?? 0);
    setPhase('running');
  }, [scope, size, items, timed]);

  const current = drillItems[index];

  const submit = useCallback(() => {
    if (!current) return;
    setAnswers((prev) => new Map(prev).set(current.id, response));
    setResponse('');
    if (index + 1 >= drillItems.length) setPhase('done');
    else setIndex((i) => i + 1);
  }, [current, response, index, drillItems.length]);

  const score = useMemo(() => {
    if (phase !== 'done') return null;
    const correct = drillItems.filter(
      (item) => checkAnswer(item, answers.get(item.id) ?? '').correct
    ).length;
    return { correct, total: drillItems.length };
  }, [phase, drillItems, answers]);

  if (loading || !student) return <Screen><Loading /></Screen>;

  // ---------------------------------------------------------------- results
  if (phase === 'done' && score) {
    return (
      <Screen>
        <Title>Drill complete</Title>
        <Card>
          <Text style={styles.big}>
            {score.correct}
            <Text style={styles.bigMuted}> / {score.total}</Text>
          </Text>
          <Body muted>{drill?.title}</Body>
          <Divider />
          <Caption>
            Drills are extra practice — they do not change your daily review schedule.
          </Caption>
        </Card>

        <Card>
          <Heading>What you missed</Heading>
          {drillItems
            .filter((item) => !checkAnswer(item, answers.get(item.id) ?? '').correct)
            .map((item) => (
              <View key={item.id} style={styles.missed}>
                <MathText fontSize={15}>{item.stem}</MathText>
                <Caption>{item.rationale}</Caption>
              </View>
            ))}
          {score.correct === score.total ? <Body muted>Nothing. Clean run.</Body> : null}
        </Card>

        <Button title="Another drill" onPress={() => setPhase('choose')} />
        <Button title="Done" variant="secondary" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  // ---------------------------------------------------------------- running
  if (phase === 'running' && current && drill) {
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft % 60;

    return (
      <Screen>
        <View style={styles.timerRow}>
          <Label>{drill.title}</Label>
          {drill.timed ? (
            <Text style={[styles.timer, secondsLeft === 0 && { color: colors.incorrect }]}>
              {minutes}:{String(seconds).padStart(2, '0')}
            </Text>
          ) : (
            <Caption>Untimed</Caption>
          )}
        </View>
        <Meter value={(index + 1) / drillItems.length} height={6} />

        {drill.timed && secondsLeft === 0 ? (
          <Notice tone="warn">Time is up — finish the ones you have left.</Notice>
        ) : null}

        <Card>
          <Caption>
            Question {index + 1} of {drillItems.length}
          </Caption>

          {current.stimulus ? (
            <View style={styles.stimulus}>
              <HighlightableText>{current.stimulus}</HighlightableText>
            </View>
          ) : null}
          {current.figure ? <Figure figure={current.figure} /> : null}

          <View style={{ marginTop: spacing.md }}>
            <MathText>{current.stem}</MathText>
          </View>

          {current.itemType === 'mcq' ? (
            <View style={styles.choices}>
              {(current.choices ?? []).map((choice) => (
                <Pressable
                  key={choice.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: response === choice.id }}
                  onPress={() => setResponse(choice.id)}
                  style={[styles.choice, response === choice.id && styles.choiceChosen]}
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
              value={response}
              onChangeText={setResponse}
              keyboardType="numbers-and-punctuation"
              placeholder="Your answer"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
            />
          )}

          {current.section === 'math' ? (
            <View style={styles.toolRow}>
              <CalculatorButton onPress={() => setCalculatorOpen(true)} />
              <ReferenceSheetButton onPress={() => setReferenceOpen(true)} />
            </View>
          ) : null}
        </Card>

        <Button
          title={index + 1 >= drillItems.length ? 'Finish drill' : 'Next'}
          onPress={submit}
          disabled={response.trim() === ''}
        />

        <Calculator visible={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
        <ReferenceSheet visible={referenceOpen} onClose={() => setReferenceOpen(false)} />
      </Screen>
    );
  }

  // ----------------------------------------------------------------- choose
  return (
    <Screen>
      <Title>Timed drills</Title>
      <Body muted>
        A short, focused set on one skill. Extra practice — it does not disturb your daily
        review schedule.
      </Body>

      {suggested.length > 0 ? (
        <Card>
          <Heading>Suggested for you</Heading>
          <Caption>Based on where your accuracy is lowest, with enough attempts to be sure.</Caption>
          <View style={styles.chips}>
            {suggested.map((s) => (
              <Pressable
                key={s.skill}
                onPress={() => setScope({ kind: 'skill', skill: s.skill })}
                style={[
                  styles.chip,
                  scope?.kind === 'skill' && scope.skill === s.skill && styles.chipActive,
                ]}
              >
                <Text style={styles.chipText}>
                  {s.label} · {Math.round(s.accuracy * 100)}%
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>
      ) : (
        <Notice>
          No suggestions yet — those appear once there are enough answers per skill to tell weak
          from unlucky. Pick any skill below in the meantime.
        </Notice>
      )}

      <Card>
        <Heading>Or choose a skill</Heading>
        <View style={styles.chips}>
          {ALL_SKILLS.map((skill) => (
            <Pressable
              key={skill.id}
              onPress={() => setScope({ kind: 'skill', skill: skill.id })}
              style={[
                styles.chip,
                scope?.kind === 'skill' && scope.skill === skill.id && styles.chipActive,
              ]}
            >
              <Text style={styles.chipText}>{skill.name}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card>
        <Heading>How many, and how</Heading>
        <View style={styles.chips}>
          {DRILL_SIZES.map((n) => (
            <Pressable
              key={n}
              onPress={() => setSize(n)}
              style={[styles.chip, size === n && styles.chipActive]}
            >
              <Text style={styles.chipText}>{n} questions</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setTimed((v) => !v)}
            style={[styles.chip, timed && styles.chipActive]}
          >
            <Text style={styles.chipText}>{timed ? 'Timed' : 'Untimed'}</Text>
          </Pressable>
        </View>
        {timed ? (
          <Caption>
            Timed uses the real test's seconds per question, so the pressure matches test day.
          </Caption>
        ) : null}
      </Card>

      {scope ? <Pill text={`Ready: ${scopeTitle(scope)}`} /> : null}
      <Button title="Start drill" onPress={() => void start()} disabled={!scope} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  big: { ...typography.display, color: colors.text },
  bigMuted: { ...typography.title, color: colors.textMuted },
  timerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  timer: { ...typography.title, color: colors.text, fontVariant: ['tabular-nums'] },
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
  toolRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { ...typography.caption, color: colors.text },
  missed: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 6,
  },
});
