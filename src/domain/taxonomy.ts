/**
 * T-01 — Canonical skill-tag taxonomy for the Digital SAT.
 *
 * Backbone for every item tag, every mastery readout, and the session
 * composer's domain-balancing logic. Structure mirrors PRD Part 1 §1.3:
 * two sections, four domains each, each domain owning a disjoint set of skills.
 *
 * Domain weights are the approximate operational weights published by College
 * Board. PRD §1.4 flags these as subject to revision — `TAXONOMY_VERIFIED_ON`
 * below is what the content-freshness check (src/content/freshness.ts) compares
 * against, so bump it whenever the weights are re-verified against
 * https://satsuite.collegeboard.org/.
 */

export const TAXONOMY_VERIFIED_ON = '2026-07-31';

/** How long the weights are trusted before the app nags for re-verification. */
export const TAXONOMY_RECHECK_INTERVAL_DAYS = 120;

export type SectionId = 'rw' | 'math';

export type DomainId =
  // Reading & Writing
  | 'craft_and_structure'
  | 'information_and_ideas'
  | 'standard_english_conventions'
  | 'expression_of_ideas'
  // Math
  | 'algebra'
  | 'advanced_math'
  | 'problem_solving_data_analysis'
  | 'geometry_and_trigonometry';

export type SkillId =
  // Craft and Structure
  | 'words_in_context'
  | 'text_structure_and_purpose'
  | 'cross_text_connections'
  // Information and Ideas
  | 'central_ideas_and_details'
  | 'command_of_evidence_textual'
  | 'command_of_evidence_quantitative'
  | 'inferences'
  // Standard English Conventions
  | 'boundaries'
  | 'form_structure_and_sense'
  // Expression of Ideas
  | 'rhetorical_synthesis'
  | 'transitions'
  // Algebra
  | 'linear_equations_one_variable'
  | 'linear_equations_two_variables'
  | 'linear_functions'
  | 'systems_of_two_linear_equations'
  | 'linear_inequalities'
  // Advanced Math
  | 'equivalent_expressions'
  | 'nonlinear_equations_and_systems'
  | 'nonlinear_functions'
  // Problem-Solving and Data Analysis
  | 'ratios_rates_proportions_units'
  | 'percentages'
  | 'one_variable_data'
  | 'two_variable_data'
  | 'probability_and_conditional_probability'
  | 'inference_from_sample_statistics'
  | 'evaluating_statistical_claims'
  // Geometry and Trigonometry
  | 'area_and_volume'
  | 'lines_angles_and_triangles'
  | 'right_triangles_and_trigonometry'
  | 'circles';

export interface Skill {
  id: SkillId;
  domain: DomainId;
  name: string;
  /** Plain-language description, surfaced in the mastery UI. */
  description: string;
}

export interface Domain {
  id: DomainId;
  section: SectionId;
  name: string;
  /** Approximate share of that section's operational items, as a fraction. */
  weight: number;
  skills: Skill[];
}

export interface Section {
  id: SectionId;
  name: string;
  /** Questions administered per PRD §1.1. */
  questionCount: number;
  /** Total minutes across both modules per PRD §1.1. */
  minutes: number;
  /** Questions per module (2 modules per section). */
  questionsPerModule: number;
  /** Minutes per module. */
  minutesPerModule: number;
  domains: Domain[];
}

/** Terser helper so the table below stays readable. */
function skill(id: SkillId, domain: DomainId, name: string, description: string): Skill {
  return { id, domain, name, description };
}

export const SECTIONS: readonly Section[] = [
  {
    id: 'rw',
    name: 'Reading and Writing',
    questionCount: 54,
    minutes: 64,
    questionsPerModule: 27,
    minutesPerModule: 32,
    domains: [
      {
        id: 'craft_and_structure',
        section: 'rw',
        name: 'Craft and Structure',
        weight: 0.28,
        skills: [
          skill(
            'words_in_context',
            'craft_and_structure',
            'Words in Context',
            'Choose the word or phrase that best fits the meaning and tone of a passage.'
          ),
          skill(
            'text_structure_and_purpose',
            'craft_and_structure',
            'Text Structure and Purpose',
            'Identify how a text is organised and why the author wrote a given part of it.'
          ),
          skill(
            'cross_text_connections',
            'craft_and_structure',
            'Cross-Text Connections',
            'Compare how two texts treat the same topic, including where they disagree.'
          ),
        ],
      },
      {
        id: 'information_and_ideas',
        section: 'rw',
        name: 'Information and Ideas',
        weight: 0.26,
        skills: [
          skill(
            'central_ideas_and_details',
            'information_and_ideas',
            'Central Ideas and Details',
            'Identify the main idea of a text and the details that support it.'
          ),
          skill(
            'command_of_evidence_textual',
            'information_and_ideas',
            'Command of Evidence: Textual',
            'Select the quotation or detail that best supports a stated claim.'
          ),
          skill(
            'command_of_evidence_quantitative',
            'information_and_ideas',
            'Command of Evidence: Quantitative',
            'Use data from a table or graph to support or complete a claim in a text.'
          ),
          skill(
            'inferences',
            'information_and_ideas',
            'Inferences',
            'Draw the conclusion a passage most logically supports without overreaching.'
          ),
        ],
      },
      {
        id: 'standard_english_conventions',
        section: 'rw',
        name: 'Standard English Conventions',
        weight: 0.26,
        skills: [
          skill(
            'boundaries',
            'standard_english_conventions',
            'Boundaries',
            'Punctuate sentence boundaries correctly: clauses, joins, and supplements.'
          ),
          skill(
            'form_structure_and_sense',
            'standard_english_conventions',
            'Form, Structure, and Sense',
            'Apply subject-verb agreement, pronouns, verb tense, and modifier placement.'
          ),
        ],
      },
      {
        id: 'expression_of_ideas',
        section: 'rw',
        name: 'Expression of Ideas',
        weight: 0.2,
        skills: [
          skill(
            'rhetorical_synthesis',
            'expression_of_ideas',
            'Rhetorical Synthesis',
            'Combine given notes into one sentence that meets a stated rhetorical goal.'
          ),
          skill(
            'transitions',
            'expression_of_ideas',
            'Transitions',
            'Choose the transition that matches the logical relationship between ideas.'
          ),
        ],
      },
    ],
  },
  {
    id: 'math',
    name: 'Math',
    questionCount: 44,
    minutes: 70,
    questionsPerModule: 22,
    minutesPerModule: 35,
    domains: [
      {
        id: 'algebra',
        section: 'math',
        name: 'Algebra',
        weight: 0.35,
        skills: [
          skill(
            'linear_equations_one_variable',
            'algebra',
            'Linear Equations in One Variable',
            'Solve and interpret linear equations with a single unknown.'
          ),
          skill(
            'linear_equations_two_variables',
            'algebra',
            'Linear Equations in Two Variables',
            'Write, solve, and interpret linear equations relating two quantities.'
          ),
          skill(
            'linear_functions',
            'algebra',
            'Linear Functions',
            'Interpret slope, intercepts, and function notation in linear models.'
          ),
          skill(
            'systems_of_two_linear_equations',
            'algebra',
            'Systems of Two Linear Equations',
            'Solve systems and reason about how many solutions they have.'
          ),
          skill(
            'linear_inequalities',
            'algebra',
            'Linear Inequalities',
            'Solve and graph linear inequalities in one or two variables.'
          ),
        ],
      },
      {
        id: 'advanced_math',
        section: 'math',
        name: 'Advanced Math',
        weight: 0.35,
        skills: [
          skill(
            'equivalent_expressions',
            'advanced_math',
            'Equivalent Expressions',
            'Rewrite polynomial, rational, radical, and exponential expressions.'
          ),
          skill(
            'nonlinear_equations_and_systems',
            'advanced_math',
            'Nonlinear Equations and Systems',
            'Solve quadratic, radical, and exponential equations and mixed systems.'
          ),
          skill(
            'nonlinear_functions',
            'advanced_math',
            'Nonlinear Functions',
            'Interpret graphs, vertices, zeros, and growth of nonlinear functions.'
          ),
        ],
      },
      {
        id: 'problem_solving_data_analysis',
        section: 'math',
        name: 'Problem-Solving and Data Analysis',
        weight: 0.15,
        skills: [
          skill(
            'ratios_rates_proportions_units',
            'problem_solving_data_analysis',
            'Ratios, Rates, Proportions, and Units',
            'Set up proportional reasoning and convert between units.'
          ),
          skill(
            'percentages',
            'problem_solving_data_analysis',
            'Percentages',
            'Compute percent change, percent of, and reverse-percentage problems.'
          ),
          skill(
            'one_variable_data',
            'problem_solving_data_analysis',
            'One-Variable Data',
            'Compare mean, median, range, and spread across distributions.'
          ),
          skill(
            'two_variable_data',
            'problem_solving_data_analysis',
            'Two-Variable Data',
            'Read scatterplots and fit or interpret linear and exponential models.'
          ),
          skill(
            'probability_and_conditional_probability',
            'problem_solving_data_analysis',
            'Probability and Conditional Probability',
            'Compute probabilities from two-way tables and stated conditions.'
          ),
          skill(
            'inference_from_sample_statistics',
            'problem_solving_data_analysis',
            'Inference from Sample Statistics',
            'Interpret margin of error and what a sample can support.'
          ),
          skill(
            'evaluating_statistical_claims',
            'problem_solving_data_analysis',
            'Evaluating Statistical Claims',
            'Judge whether a study design supports a causal or general claim.'
          ),
        ],
      },
      {
        id: 'geometry_and_trigonometry',
        section: 'math',
        name: 'Geometry and Trigonometry',
        weight: 0.15,
        skills: [
          skill(
            'area_and_volume',
            'geometry_and_trigonometry',
            'Area and Volume',
            'Apply area, surface area, and volume formulas, including scaling.'
          ),
          skill(
            'lines_angles_and_triangles',
            'geometry_and_trigonometry',
            'Lines, Angles, and Triangles',
            'Use angle relationships, similarity, and congruence.'
          ),
          skill(
            'right_triangles_and_trigonometry',
            'geometry_and_trigonometry',
            'Right Triangles and Trigonometry',
            'Apply the Pythagorean theorem, special triangles, and sine/cosine/tangent.'
          ),
          skill(
            'circles',
            'geometry_and_trigonometry',
            'Circles',
            'Work with circle equations, arcs, sectors, and radians.'
          ),
        ],
      },
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Derived lookups. Built once at module load; the taxonomy is immutable.
// ---------------------------------------------------------------------------

export const ALL_DOMAINS: readonly Domain[] = SECTIONS.flatMap((s) => s.domains);
export const ALL_SKILLS: readonly Skill[] = ALL_DOMAINS.flatMap((d) => d.skills);

const DOMAIN_BY_ID = new Map<DomainId, Domain>(ALL_DOMAINS.map((d) => [d.id, d]));
const SKILL_BY_ID = new Map<SkillId, Skill>(ALL_SKILLS.map((s) => [s.id, s]));
const SECTION_BY_ID = new Map<SectionId, Section>(SECTIONS.map((s) => [s.id, s]));

export function getDomain(id: DomainId): Domain {
  const d = DOMAIN_BY_ID.get(id);
  if (!d) throw new Error(`Unknown domain id: ${id}`);
  return d;
}

export function getSkill(id: SkillId): Skill {
  const s = SKILL_BY_ID.get(id);
  if (!s) throw new Error(`Unknown skill id: ${id}`);
  return s;
}

export function getSection(id: SectionId): Section {
  const s = SECTION_BY_ID.get(id);
  if (!s) throw new Error(`Unknown section id: ${id}`);
  return s;
}

export function isSkillId(value: string): value is SkillId {
  return SKILL_BY_ID.has(value as SkillId);
}

export function isDomainId(value: string): value is DomainId {
  return DOMAIN_BY_ID.has(value as DomainId);
}

/** Section a skill belongs to, via its domain. */
export function sectionOfSkill(id: SkillId): SectionId {
  return getDomain(getSkill(id).domain).section;
}

/**
 * Domain weight renormalised across the whole test rather than within its
 * section. Used by the composer to decide how much of a mixed block each
 * domain should occupy. R&W contributes 54 of 98 administered questions and
 * Math 44, so section share is item-count-weighted rather than 50/50.
 */
export function overallDomainWeight(id: DomainId): number {
  const domain = getDomain(id);
  const section = getSection(domain.section);
  const totalQuestions = SECTIONS.reduce((sum, s) => sum + s.questionCount, 0);
  return domain.weight * (section.questionCount / totalQuestions);
}

export const TOTAL_SKILL_COUNT = ALL_SKILLS.length;
