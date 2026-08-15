/**
 * The formula reference sheet.
 *
 * The Digital SAT provides this on every Math question, so a student who
 * practises without it either memorises formulas they will not need to
 * memorise, or — worse — does not know it is there and wastes time on test day
 * recalling something they could have looked up.
 *
 * Formulas are stored as the same `$...$` LaTeX the item bank uses, so they
 * render through the existing MathText component with no extra machinery.
 */

export interface ReferenceEntry {
  /** Rendered as a caption above the formula. */
  label: string;
  /** LaTeX, using only the subset the renderer supports. */
  formula: string;
  /** Optional plain-language note. */
  note?: string;
}

export interface ReferenceGroup {
  title: string;
  entries: ReferenceEntry[];
}

export const REFERENCE_SHEET: readonly ReferenceGroup[] = [
  {
    title: 'Circles',
    entries: [
      { label: 'Area', formula: '$A = \\pi r^2$' },
      { label: 'Circumference', formula: '$C = 2\\pi r$' },
      {
        label: 'Arc and sector',
        formula: '$\\frac{n}{360}$',
        note: 'A central angle of n degrees cuts this fraction of the circumference and of the area.',
      },
      { label: 'Degrees in a circle', formula: '$360$' },
      { label: 'Radians in a circle', formula: '$2\\pi$' },
    ],
  },
  {
    title: 'Rectangles and triangles',
    entries: [
      { label: 'Area of a rectangle', formula: '$A = \\ell w$' },
      { label: 'Area of a triangle', formula: '$A = \\frac{1}{2} b h$' },
      { label: 'Pythagorean theorem', formula: '$a^2 + b^2 = c^2$' },
      { label: 'Angles in a triangle', formula: '$180$', note: 'Degrees, always.' },
    ],
  },
  {
    title: 'Special right triangles',
    entries: [
      {
        label: '30-60-90',
        formula: '$x, x\\sqrt{3}, 2x$',
        note: 'Shortest side opposite the 30-degree angle.',
      },
      { label: '45-45-90', formula: '$s, s, s\\sqrt{2}$' },
    ],
  },
  {
    title: 'Volume',
    entries: [
      { label: 'Rectangular solid', formula: '$V = \\ell w h$' },
      { label: 'Cylinder', formula: '$V = \\pi r^2 h$' },
      { label: 'Sphere', formula: '$V = \\frac{4}{3}\\pi r^3$' },
      { label: 'Cone', formula: '$V = \\frac{1}{3}\\pi r^2 h$' },
      { label: 'Pyramid', formula: '$V = \\frac{1}{3} \\ell w h$' },
    ],
  },
] as const;

/**
 * Facts the sheet does *not* give you, and which therefore have to be known.
 *
 * Shown alongside the sheet on purpose: knowing what is not provided is as
 * useful as knowing what is, and it is the thing students most often get wrong
 * about the reference sheet.
 */
export const NOT_ON_THE_SHEET: readonly string[] = [
  'Slope: $m = \\frac{y_2 - y_1}{x_2 - x_1}$',
  'Quadratic formula: $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$',
  'Distance between two points',
  'Equation of a circle: $(x - h)^2 + (y - k)^2 = r^2$',
  'Vertex form: $y = a(x - h)^2 + k$',
  'SOHCAHTOA and the trig ratios',
  'Percent change and averages',
  'Exponent and radical rules',
] as const;
