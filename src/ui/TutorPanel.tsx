/**
 * The "explain this differently" panel, shown under a committed answer.
 *
 * Everything here is additive. If there is no API key, no network, or the
 * request fails, the panel says so in one line and the session continues
 * exactly as before — the offline guarantee in PRD §2.5 covers the practice
 * loop, and this sits outside it by design.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Item } from '../domain/types';
import {
  askTutor,
  isTutorConfigured,
  MAX_TURNS,
  SUGGESTED_PROMPTS,
  type TutorTurn,
} from '../tutor/tutor';
import { colors, radius, spacing, type as typography } from './theme';
import { MathText } from './MathText';

export function TutorPanel({ item, studentResponse }: { item: Item; studentResponse: string }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<TutorTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    void isTutorConfigured().then(setConfigured);
    // A new item means a new conversation; carrying turns across questions
    // would send the model context about a question it is no longer discussing.
    setHistory([]);
    setOpen(false);
    setError(null);
    return () => abort.current?.abort();
  }, [item.id]);

  const ask = useCallback(
    async (question: string) => {
      setBusy(true);
      setError(null);
      setOpen(true);
      abort.current?.abort();
      abort.current = new AbortController();

      const asked: TutorTurn = { role: 'user', content: question };
      setHistory((h) => [...h, asked]);

      const result = await askTutor({
        item,
        studentResponse,
        history,
        question,
        signal: abort.current.signal,
      });

      if (result.ok) {
        setHistory((h) => [...h, { role: 'assistant', content: result.reply }]);
      } else {
        setError(result.message);
        // Drop the unanswered question rather than leaving a dangling turn.
        setHistory((h) => h.slice(0, -1));
      }
      setBusy(false);
    },
    [item, studentResponse, history]
  );

  // Not configured: stay out of the way entirely rather than advertising a
  // feature the student cannot use mid-session.
  if (configured === null || configured === false) return null;

  const turnsUsed = history.filter((t) => t.role === 'user').length;
  const atLimit = turnsUsed >= MAX_TURNS;

  return (
    <View style={styles.container}>
      {history.length > 0 ? (
        <ScrollView style={styles.thread} nestedScrollEnabled>
          {history.map((turn, index) => (
            <View
              key={`${turn.role}-${index}`}
              style={[styles.turn, turn.role === 'user' ? styles.userTurn : styles.tutorTurn]}
            >
              <MathText fontSize={15} color={turn.role === 'user' ? colors.textMuted : colors.text}>
                {turn.content}
              </MathText>
            </View>
          ))}
        </ScrollView>
      ) : null}

      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.caption}>Thinking…</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!atLimit && !busy ? (
        <View style={styles.prompts}>
          {(open ? SUGGESTED_PROMPTS : SUGGESTED_PROMPTS.slice(0, 2)).map((prompt) => (
            <Pressable
              key={prompt}
              accessibilityRole="button"
              onPress={() => void ask(prompt)}
              style={({ pressed }) => [styles.prompt, pressed && styles.promptPressed]}
            >
              <Text style={styles.promptText}>{prompt}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {atLimit ? (
        <Text style={styles.caption}>
          That is as far as this goes for one question — time to move on.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: spacing.sm },
  thread: { maxHeight: 320, marginBottom: spacing.sm },
  turn: {
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  userTurn: { backgroundColor: colors.surfaceAlt, alignSelf: 'flex-end', maxWidth: '85%' },
  tutorTurn: { backgroundColor: colors.accentSoft },
  prompts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  prompt: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  promptPressed: { backgroundColor: colors.accentSoft },
  promptText: { ...typography.caption, color: colors.accent, fontWeight: '600' },
  busy: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  caption: { ...typography.caption, color: colors.textMuted },
  error: { ...typography.caption, color: colors.warn, marginBottom: spacing.sm },
});
