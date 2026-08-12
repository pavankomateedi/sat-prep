/**
 * T-13 — Data minimisation, enforced at runtime.
 *
 * PRD §2.7 works out that neither COPPA (the student is 14+ and this is
 * non-commercial) nor FERPA (this is not an educational institution) legally
 * applies — and then imposes their discipline anyway, as good practice. This
 * module is where that promise stops being a paragraph and becomes a gate.
 *
 * The ticket asks for "an ongoing gate on every future ticket, not a one-time
 * task", so the check is executable: `screen()` runs over every payload before
 * it can leave the device, and the test suite runs it over the real sync
 * builders. A future feature that starts collecting an email address fails the
 * build rather than quietly shipping.
 *
 * Defence in depth, three layers:
 *   1. The SQLite and Postgres schemas have no columns for forbidden data.
 *   2. This screen inspects payloads by key name and by value shape.
 *   3. Supabase RLS denies the parent role any access to item-level tables.
 */

/** The "Do NOT collect" column of PRD §2.7, as executable rules. */
export const FORBIDDEN_FIELDS = [
  'firstName',
  'first_name',
  'lastName',
  'last_name',
  'fullName',
  'full_name',
  'legalName',
  'legal_name',
  'address',
  'streetAddress',
  'street_address',
  'postcode',
  'zipCode',
  'zip_code',
  'phone',
  'phoneNumber',
  'phone_number',
  'mobile',
  'ssn',
  'socialSecurityNumber',
  'nationalId',
  'governmentId',
  'dateOfBirth',
  'date_of_birth',
  'dob',
  'photo',
  'photoUrl',
  'avatar',
  'audio',
  'video',
  'latitude',
  'longitude',
  'geolocation',
  'coordinates',
  'ipAddress',
  'ip_address',
  'deviceId',
  'device_id',
  'advertisingId',
  'advertising_id',
  'idfa',
  'gaid',
  'biometric',
  'fingerprint',
  'faceId',
] as const;

/** The "Collect" column — what the app is allowed to hold. */
export const PERMITTED_DATA = [
  'Item id, timestamp, correctness, response time',
  'Derived memory and mastery state (FSRS / Elo / BKT internals)',
  'Skill tags attempted',
  'Ability estimates per skill',
  'Session adherence (days practised, minutes spent)',
  'Target test date and grade level',
  'A nickname for display',
  'One login identifier per family account',
] as const;

/**
 * Keys that legitimately hold an account identifier. Auth needs exactly one,
 * and pretending otherwise would mean the login could not work — so it is
 * named explicitly rather than smuggled past the screen.
 */
const AUTH_IDENTIFIER_KEYS = new Set(['email', 'userEmail', 'loginEmail']);

const VALUE_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: 'email address', pattern: /[\w.+-]+@[\w-]+\.[\w.]{2,}/ },
  // Deliberately loose: catches +1-555-867-5309 and (555) 867 5309 alike.
  { name: 'phone number', pattern: /(?:\+\d{1,3}[\s-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/ },
  { name: 'US Social Security Number', pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: 'street address', pattern: /\b\d{1,5}\s+[A-Za-z][A-Za-z.]*\s+(Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Boulevard|Blvd)\b/i },
];

export interface PrivacyViolation {
  path: string;
  kind: 'forbidden_field' | 'forbidden_value';
  detail: string;
}

export interface ScreenOptions {
  /**
   * Allow a single account identifier through — set only on the auth payload,
   * which is the one place PRD §2.7 permits an email at all.
   */
  allowAuthIdentifier?: boolean;
  /** Depth guard against cyclic or pathological structures. */
  maxDepth?: number;
}

const FORBIDDEN_SET = new Set<string>(FORBIDDEN_FIELDS.map((f) => f.toLowerCase()));

/**
 * Walk a payload and report anything PRD §2.7 forbids.
 *
 * Checks both the key name (someone adding a `phoneNumber` column) and the
 * value shape (someone stuffing an email into `displayName`). Neither check
 * alone is sufficient — the second is what catches well-intentioned code that
 * simply puts the wrong thing in a permitted field.
 */
export function screen(payload: unknown, options: ScreenOptions = {}): PrivacyViolation[] {
  const violations: PrivacyViolation[] = [];
  const maxDepth = options.maxDepth ?? 12;
  const seen = new WeakSet<object>();

  const visit = (value: unknown, path: string, depth: number): void => {
    if (depth > maxDepth || value === null || value === undefined) return;

    if (typeof value === 'string') {
      for (const { name, pattern } of VALUE_PATTERNS) {
        if (!pattern.test(value)) continue;
        if (name === 'email address' && options.allowAuthIdentifier) continue;
        violations.push({
          path,
          kind: 'forbidden_value',
          detail: `Value looks like a ${name}`,
        });
      }
      return;
    }

    if (typeof value !== 'object') return;
    if (seen.has(value as object)) return;
    seen.add(value as object);

    if (Array.isArray(value)) {
      value.forEach((entry, i) => visit(entry, `${path}[${i}]`, depth + 1));
      return;
    }

    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      const lower = key.toLowerCase();

      if (FORBIDDEN_SET.has(lower)) {
        violations.push({
          path: childPath,
          kind: 'forbidden_field',
          detail: `"${key}" is on the do-not-collect list in PRD §2.7`,
        });
        continue;
      }

      if (AUTH_IDENTIFIER_KEYS.has(key) && !options.allowAuthIdentifier) {
        violations.push({
          path: childPath,
          kind: 'forbidden_field',
          detail: `"${key}" is only permitted on the auth payload`,
        });
        continue;
      }

      visit(entry, childPath, depth + 1);
    }
  };

  visit(payload, '', 0);
  return violations;
}

export class PrivacyViolationError extends Error {
  constructor(public readonly violations: PrivacyViolation[]) {
    super(
      `Payload violates the data-minimisation policy (PRD §2.7):\n` +
        violations.map((v) => `  - ${v.path || '<root>'}: ${v.detail}`).join('\n')
    );
    this.name = 'PrivacyViolationError';
  }
}

/**
 * Throw unless the payload is clean. Called on every outbound sync write, so a
 * violation stops the upload rather than being logged and ignored.
 */
export function assertClean(payload: unknown, options: ScreenOptions = {}): void {
  const violations = screen(payload, options);
  if (violations.length > 0) throw new PrivacyViolationError(violations);
}

/**
 * Fields a parent may see, per PRD §2.1 and §2.7.
 *
 * The exclusion is the interesting half: a student's specific wrong answers are
 * their own learning data, not a surveillance feed. That is why the parent
 * surface is built from aggregates only, and why Supabase gives the parent role
 * no policy at all on `attempts`.
 */
export const PARENT_VISIBLE_FIELDS = [
  'daysPracticed',
  'daysInWeek',
  'totalMinutes',
  'currentMissedStreak',
  'domainTrends',
  'latestScore',
  'adherenceAlert',
  'weekStart',
  'generatedAt',
  'studentId',
] as const;

const PARENT_VISIBLE_SET = new Set<string>(PARENT_VISIBLE_FIELDS);

/**
 * Verify a parent-facing payload exposes nothing beyond the agreed scope.
 * Anything item-level — an item id, a response, a wrong answer — fails here.
 */
export function screenParentPayload(payload: Record<string, unknown>): PrivacyViolation[] {
  const violations = screen(payload);

  for (const key of Object.keys(payload)) {
    if (!PARENT_VISIBLE_SET.has(key)) {
      violations.push({
        path: key,
        kind: 'forbidden_field',
        detail: `"${key}" is outside the parent-viewer scope defined in PRD §2.1`,
      });
    }
  }

  return violations;
}
