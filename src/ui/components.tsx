/**
 * Shared UI primitives.
 *
 * Small and unopinionated on purpose — the app has five screens, so a design
 * system would be overhead. These exist to keep spacing and touch targets
 * consistent, not to abstract anything.
 */

import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, type as typography } from './theme';

export function Screen({
  children,
  scroll = true,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  // Without scroll, the inner View must claim the height itself — otherwise a
  // child ScrollView has no bound to scroll against and simply overflows,
  // pushing its last elements off-screen with no way to reach them.
  const inner = (
    <View style={[styles.screenInner, !scroll && styles.screenInnerFill, style]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Heading({ children }: { children: ReactNode }) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

export function Caption({ children }: { children: ReactNode }) {
  return <Text style={styles.caption}>{children}</Text>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'quiet';
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'quiet' && styles.buttonQuiet,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === 'primary' && styles.buttonTextPrimary,
          variant === 'quiet' && styles.buttonTextQuiet,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

/** A labelled progress bar. Used for mastery and for session position. */
export function Meter({
  value,
  color = colors.accent,
  height = 8,
}: {
  value: number;
  color?: string;
  height?: number;
}) {
  const clamped = Math.min(Math.max(value, 0), 1);
  return (
    <View
      style={[styles.meterTrack, { height, borderRadius: height / 2 }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <View
        style={{
          width: `${clamped * 100}%`,
          height,
          borderRadius: height / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export function Pill({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'good' | 'bad' | 'warn' }) {
  const toneStyle =
    tone === 'good'
      ? { bg: colors.correctSoft, fg: colors.correct }
      : tone === 'bad'
        ? { bg: colors.incorrectSoft, fg: colors.incorrect }
        : tone === 'warn'
          ? { bg: colors.warnSoft, fg: colors.warn }
          : { bg: colors.surfaceAlt, fg: colors.textMuted };

  return (
    <View style={[styles.pill, { backgroundColor: toneStyle.bg }]}>
      <Text style={[styles.pillText, { color: toneStyle.fg }]}>{text}</Text>
    </View>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.caption}>{label}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

/** Non-blocking notice. Used for offline state and honesty caveats. */
export function Notice({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warn' }) {
  return (
    <View
      style={[
        styles.notice,
        { backgroundColor: tone === 'warn' ? colors.warnSoft : colors.surfaceAlt },
      ]}
    >
      <Text style={[styles.caption, tone === 'warn' && { color: colors.warn }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenInner: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  screenInnerFill: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  title: { ...typography.title, color: colors.text, marginTop: spacing.lg },
  heading: { ...typography.heading, color: colors.text, marginBottom: spacing.xs },
  body: { ...typography.body, color: colors.text },
  muted: { color: colors.textMuted },
  caption: { ...typography.caption, color: colors.textMuted },
  label: {
    ...typography.label,
    color: colors.textFaint,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonSecondary: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  buttonQuiet: { backgroundColor: 'transparent', minHeight: 40 },
  buttonPressed: { opacity: 0.75 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { ...typography.heading, color: colors.text },
  buttonTextPrimary: { color: '#FFFFFF' },
  buttonTextQuiet: { color: colors.accent },
  meterTrack: { backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  pillText: { ...typography.label, fontSize: 12 },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center', gap: spacing.sm },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  notice: {
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    marginTop: spacing.sm,
  },
});
