/**
 * The bundled item bank.
 *
 * Static imports rather than filesystem reads, so Metro bundles the content
 * into the app and the whole bank is available with no network — the offline
 * requirement in PRD §2.5 applies to content as much as to session state.
 *
 * Adding a content file means adding it here; the coverage check in
 * src/content/bank.test.ts will fail if a skill drops below the launch bar.
 */

import type { Item, Passage } from '../src/domain/types';

import rwCraftAndStructure from './items/rw-craft-and-structure.json';
import rwInformationAndIdeas from './items/rw-information-and-ideas.json';
import rwStandardEnglishConventions from './items/rw-standard-english-conventions.json';
import rwStandardEnglishConventions2 from './items/rw-standard-english-conventions-2.json';
import rwExpressionOfIdeas from './items/rw-expression-of-ideas.json';
import rwExpressionOfIdeas2 from './items/rw-expression-of-ideas-2.json';
import mathAlgebra from './items/math-algebra.json';
import mathAlgebra2 from './items/math-algebra-2.json';
import mathAdvanced from './items/math-advanced-math.json';
import mathProblemSolving from './items/math-problem-solving-data-analysis.json';
import mathGeometry from './items/math-geometry-and-trigonometry.json';
import mathAdvancedGenerated from './generated/math-advanced-math.json';

const FILES = [
  rwCraftAndStructure,
  rwInformationAndIdeas,
  rwStandardEnglishConventions,
  rwStandardEnglishConventions2,
  rwExpressionOfIdeas,
  rwExpressionOfIdeas2,
  mathAlgebra,
  mathAlgebra2,
  mathAdvanced,
  mathProblemSolving,
  mathGeometry,
  mathAdvancedGenerated,
];

export const ITEMS: Item[] = FILES.flatMap((f) => f.items as unknown as Item[]);

/**
 * Shared long-form passages. Empty by design: the Digital SAT gives each
 * Reading & Writing question its own short text, so stimuli live on items.
 * This exists for the case where one longer excerpt is deliberately reused.
 */
export const PASSAGES: Passage[] = [];

/**
 * Bumped whenever the bank changes, so the device knows to reload content into
 * SQLite. Uses a date rather than a hash so it is legible in the DB.
 */
export const CONTENT_VERSION = '2026-08-01.1';
