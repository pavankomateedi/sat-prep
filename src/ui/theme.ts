/**
 * Visual design tokens.
 *
 * Calm and low-chrome on purpose. This screen gets opened every day for two
 * years by a teenager who did not choose to be there; anything loud becomes
 * grating by month three. PRD §2.6 also warns against gamification that "reads
 * as juvenile for an 11th grader", and that applies to the palette as much as
 * to badges and streak counters.
 */

export const colors = {
  bg: '#FBFBFD',
  surface: '#FFFFFF',
  surfaceAlt: '#F3F4F8',
  border: '#E3E5EC',
  text: '#14161C',
  textMuted: '#5C6172',
  textFaint: '#8E93A3',
  accent: '#2E5BFF',
  accentSoft: '#EAEFFF',
  correct: '#1B7F5A',
  correctSoft: '#E4F4ED',
  incorrect: '#B3261E',
  incorrectSoft: '#FCEAE8',
  warn: '#8A6100',
  warnSoft: '#FDF3DC',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const type = {
  display: { fontSize: 30, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  /** Passage and stem text. Slightly larger leading — a lot of reading here. */
  reading: { fontSize: 17, fontWeight: '400' as const, lineHeight: 27 },
  label: { fontSize: 13, fontWeight: '600' as const, letterSpacing: 0.3 },
  caption: { fontSize: 13, fontWeight: '400' as const, lineHeight: 19 },
} as const;

/** Per-domain accents for the progress screen, stable across sessions. */
export const domainColors: Record<string, string> = {
  craft_and_structure: '#2E5BFF',
  information_and_ideas: '#5B36C9',
  standard_english_conventions: '#0F7B8A',
  expression_of_ideas: '#1B7F5A',
  algebra: '#B45309',
  advanced_math: '#B3261E',
  problem_solving_data_analysis: '#8A2E7A',
  geometry_and_trigonometry: '#3A5A40',
};
