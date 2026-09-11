/**
 * Visual design tokens.
 *
 * Calm and low-chrome on purpose. This screen gets opened every day for two
 * years by a teenager who did not choose to be there; anything loud becomes
 * grating by month three. PRD §2.6 also warns against gamification that "reads
 * as juvenile for an 11th grader", and that applies to the palette as much as
 * to badges and streak counters.
 *
 * "Polished," here, means depth and confidence, not more color or louder
 * accents: real elevation on cards and the primary action, a slightly deeper
 * accent, marginally friendlier corners. The calm-palette rule above still
 * holds — this raises the finish, not the volume.
 */

export const colors = {
  bg: '#FAFAFD',
  surface: '#FFFFFF',
  surfaceAlt: '#F2F3F8',
  border: '#E2E4ED',
  // `border` is 1.27:1 against white — fine for a card's own outline (the
  // shadow now does the real separating work) but nowhere near enough when
  // it's the *only* cue that a text input exists on a white card. 3.19:1
  // clears WCAG 1.4.11's 3:1 bar for a UI component boundary.
  borderStrong: '#8C8FA3',
  text: '#13151C',
  textMuted: '#5B5F72',
  // Was #8C90A3 (3.0-3.2:1 against bg/surface) — fails WCAG AA's 4.5:1 for
  // normal text. Used in the shared Label component (every screen's section
  // headers and field labels run through it) and chart axis labels, so this
  // wasn't a cosmetic nit — real text was genuinely hard to read.
  textFaint: '#6A6E80',
  accent: '#2952E3',
  accentDeep: '#1E3FB8',
  accentSoft: '#EAEFFF',
  // A real, visible border for the question card specifically — distinct
  // from the near-invisible hairline every other card uses, so "this is
  // the question" reads as its own defined space rather than blending
  // into the page. 3.4:1 against its own accentSoft fill, 3.7:1 against
  // the page background — clears WCAG 1.4.11's 3:1 UI-boundary bar either
  // way, rather than being decorative-only.
  questionBorder: '#5E7BE0',
  // A second, distinct hue reserved for time-tracking UI only (the daily
  // session's elapsed-time bar, test/drill timers) — one deliberate spot
  // of visual variety against the otherwise blue-and-neutral palette, not
  // a general-purpose color. 6.4:1 either direction.
  timer: '#6D3FD1',
  timerSoft: '#F1EBFB',
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
  sm: 10,
  md: 14,
  lg: 18,
  pill: 999,
} as const;

/**
 * Elevation, not color, is what reads as "polished." Two tiers: `card` for
 * resting surfaces, `raised` for the one primary action per screen. Kept
 * subtle deliberately — a heavy drop shadow is the fastest way to make a
 * calm app look like it's trying too hard.
 */
export const shadow = {
  card: {
    shadowColor: '#0B1030',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  raised: {
    shadowColor: '#0B1030',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 3,
  },
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
