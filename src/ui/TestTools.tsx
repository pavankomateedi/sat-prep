/**
 * Bluebook-parity test tools: the formula reference sheet, the question
 * navigator / review screen, and passage highlighting.
 *
 * These are not decoration. A student who has never used the eliminator or the
 * review screen is rehearsing a different task from the one they will sit, and
 * every paid prep product replicates them for exactly that reason.
 */

import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MathText } from './MathText';
import { NOT_ON_THE_SHEET, REFERENCE_SHEET } from '../domain/referenceSheet';
import type { ModuleState } from '../assessment/moduleState';
import { progress } from '../assessment/moduleState';
import { colors, radius, spacing, type as typography } from './theme';

// ---------------------------------------------------------------------------
// Reference sheet
// ---------------------------------------------------------------------------

export function ReferenceSheetButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open formula reference sheet"
      style={({ pressed }) => [styles.toolButton, pressed && styles.toolButtonPressed]}
    >
      <Text style={styles.toolButtonText}>Reference</Text>
    </Pressable>
  );
}

export function ReferenceSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Reference</Text>
          <Pressable onPress={onClose} accessibilityRole="button">
            <Text style={styles.headerLink}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.caption}>
            Provided on every Math question of the real test. You do not need to memorise any of
            this.
          </Text>

          {REFERENCE_SHEET.map((group) => (
            <View key={group.title} style={styles.group}>
              <Text style={styles.groupTitle}>{group.title}</Text>
              {group.entries.map((entry) => (
                <View key={entry.label} style={styles.entry}>
                  <Text style={styles.entryLabel}>{entry.label}</Text>
                  <MathText fontSize={17}>{entry.formula}</MathText>
                  {entry.note ? <Text style={styles.caption}>{entry.note}</Text> : null}
                </View>
              ))}
            </View>
          ))}

          {/* Knowing what is missing is as useful as knowing what is there. */}
          <View style={[styles.group, styles.notProvided]}>
            <Text style={styles.groupTitle}>Not provided — know these</Text>
            {NOT_ON_THE_SHEET.map((line) => (
              <View key={line} style={styles.entry}>
                <MathText fontSize={15}>{line}</MathText>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Question navigator / review screen
// ---------------------------------------------------------------------------

export function QuestionNavigator({
  state,
  onSelect,
  onSubmit,
  submitLabel = 'Finish module',
}: {
  state: ModuleState;
  onSelect: (index: number) => void;
  onSubmit: () => void;
  submitLabel?: string;
}) {
  const summary = progress(state);

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.headerTitle}>Check your work</Text>
      <Text style={styles.caption}>
        {summary.answered} of {summary.total} answered
        {summary.marked > 0 ? ` · ${summary.marked} flagged for review` : ''}
      </Text>

      <View style={styles.grid}>
        {state.questions.map((question, index) => {
          const answered = question.response !== '';
          return (
            <Pressable
              key={question.itemId}
              onPress={() => onSelect(index)}
              accessibilityRole="button"
              accessibilityLabel={`Question ${index + 1}, ${
                answered ? 'answered' : 'not answered'
              }${question.marked ? ', flagged' : ''}`}
              style={({ pressed }) => [
                styles.gridCell,
                answered && styles.gridCellAnswered,
                question.marked && styles.gridCellMarked,
                pressed && styles.toolButtonPressed,
              ]}
            >
              <Text style={[styles.gridNumber, answered && styles.gridNumberAnswered]}>
                {index + 1}
              </Text>
              {question.marked ? <View style={styles.flagDot} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.legend}>
        <LegendItem style={styles.gridCellAnswered} label="Answered" />
        <LegendItem style={styles.gridCell} label="Not answered" />
        <LegendItem style={styles.gridCellMarked} label="Flagged" />
      </View>

      {summary.unanswered > 0 ? (
        <Text style={styles.warn}>
          {summary.unanswered} question{summary.unanswered === 1 ? '' : 's'} left blank. There is
          no penalty for a wrong answer, so guess rather than leave anything empty.
        </Text>
      ) : null}

      <Pressable
        onPress={onSubmit}
        accessibilityRole="button"
        style={({ pressed }) => [styles.submit, pressed && styles.toolButtonPressed]}
      >
        <Text style={styles.submitText}>{submitLabel}</Text>
      </Pressable>
    </ScrollView>
  );
}

function LegendItem({ style, label }: { style: object; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, style]} />
      <Text style={styles.caption}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// In-question tool bar
// ---------------------------------------------------------------------------

export function ToolBar({
  marked,
  onToggleMark,
  onOpenCalculator,
  onOpenReference,
  onOpenNavigator,
  showMathTools,
}: {
  marked: boolean;
  onToggleMark: () => void;
  onOpenCalculator?: () => void;
  onOpenReference?: () => void;
  onOpenNavigator?: () => void;
  showMathTools: boolean;
}) {
  return (
    <View style={styles.toolBar}>
      <Pressable
        onPress={onToggleMark}
        accessibilityRole="button"
        accessibilityState={{ selected: marked }}
        style={({ pressed }) => [
          styles.toolButton,
          marked && styles.toolButtonActive,
          pressed && styles.toolButtonPressed,
        ]}
      >
        <Text style={[styles.toolButtonText, marked && styles.toolButtonTextActive]}>
          {marked ? '★ Flagged' : '☆ Flag'}
        </Text>
      </Pressable>

      {showMathTools && onOpenCalculator ? (
        <Pressable
          onPress={onOpenCalculator}
          accessibilityRole="button"
          style={({ pressed }) => [styles.toolButton, pressed && styles.toolButtonPressed]}
        >
          <Text style={styles.toolButtonText}>Calculator</Text>
        </Pressable>
      ) : null}

      {showMathTools && onOpenReference ? <ReferenceSheetButton onPress={onOpenReference} /> : null}

      {onOpenNavigator ? (
        <Pressable
          onPress={onOpenNavigator}
          accessibilityRole="button"
          style={({ pressed }) => [styles.toolButton, pressed && styles.toolButtonPressed]}
        >
          <Text style={styles.toolButtonText}>All questions</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Passage highlighting
// ---------------------------------------------------------------------------

/**
 * Tap-to-highlight for passage text.
 *
 * Sentence-level rather than free character selection: React Native gives no
 * reliable cross-platform text-selection callback, and on a phone a sentence is
 * about the smallest unit anyone can reliably tap anyway. It preserves what the
 * tool is *for* — marking the part of the text that decides the answer — which
 * matters more than matching Bluebook's exact interaction.
 */
export function HighlightableText({
  children,
  fontSize = 17,
}: {
  children: string;
  fontSize?: number;
}) {
  const [highlighted, setHighlighted] = useState<Set<number>>(new Set());

  // Split on sentence ends, keeping the punctuation with its sentence.
  const sentences = useMemo(
    () => children.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0),
    [children]
  );

  const toggle = (index: number) =>
    setHighlighted((current) => {
      const nextSet = new Set(current);
      if (nextSet.has(index)) nextSet.delete(index);
      else nextSet.add(index);
      return nextSet;
    });

  // Nothing to highlight in a single short run — render plainly and skip the
  // interaction entirely rather than making the whole text one tap target.
  if (sentences.length < 2) return <MathText fontSize={fontSize}>{children}</MathText>;

  return (
    <View>
      <Text style={{ fontSize, lineHeight: fontSize * 1.6 }}>
        {sentences.map((sentence, index) => (
          <Text
            key={index}
            onPress={() => toggle(index)}
            style={[
              { color: colors.text },
              highlighted.has(index) && styles.highlighted,
            ]}
            accessibilityLabel={
              highlighted.has(index) ? `Highlighted: ${sentence}` : sentence
            }
          >
            {sentence}{' '}
          </Text>
        ))}
      </Text>
      {highlighted.size > 0 ? (
        <Pressable onPress={() => setHighlighted(new Set())} accessibilityRole="button">
          <Text style={styles.clearHighlights}>Clear highlights</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: { ...typography.title, color: colors.text },
  headerLink: { ...typography.heading, color: colors.accent },
  body: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  caption: { ...typography.caption, color: colors.textMuted },
  warn: {
    ...typography.caption,
    color: colors.warn,
    backgroundColor: colors.warnSoft,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  group: { marginTop: spacing.md },
  groupTitle: { ...typography.label, color: colors.textFaint, textTransform: 'uppercase' },
  entry: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 4,
  },
  entryLabel: { ...typography.caption, color: colors.textMuted },
  notProvided: {
    backgroundColor: colors.warnSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  gridCell: {
    width: 46,
    height: 46,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  gridCellAnswered: { backgroundColor: colors.accent, borderColor: colors.accent },
  gridCellMarked: { borderColor: colors.warn, borderWidth: 2.5 },
  gridNumber: { ...typography.heading, color: colors.textMuted },
  gridNumberAnswered: { color: '#FFFFFF' },
  flagDot: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.warn,
  },
  legend: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5 },
  submit: {
    marginTop: spacing.lg,
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { ...typography.heading, color: '#FFFFFF' },
  toolBar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  toolButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  toolButtonActive: { backgroundColor: colors.warnSoft, borderColor: colors.warn },
  toolButtonPressed: { opacity: 0.7 },
  toolButtonText: { ...typography.caption, color: colors.accent, fontWeight: '600' },
  toolButtonTextActive: { color: colors.warn },
  highlighted: { backgroundColor: '#FFF3A8' },
  clearHighlights: {
    ...typography.caption,
    color: colors.accent,
    marginTop: spacing.sm,
    fontWeight: '600',
  },
});
