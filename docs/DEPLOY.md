# Deployment

## Where the API keys go

There are **two separate keys**, in two different places, for two different jobs. They are not
interchangeable, and mixing them up is the main thing to get right.

### 1. Anthropic key — for generating items (on your PC)

Used only by `npm run content:generate`, which runs on your computer. It never touches the app.

```powershell
# One-off, current terminal only
$env:ANTHROPIC_API_KEY = "sk-ant-..."
npm run content:generate -- --plan --count 30

# Or persist it for your user account (new terminals pick it up)
[Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", "sk-ant-...", "User")
```

Alternatively copy `.env.example` to `.env.local` and put it there.

**Never** prefix this key with `EXPO_PUBLIC_`. Anything so prefixed is compiled into the app
bundle and readable by anyone who has the app.

### 2. Anthropic key — for the in-app tutor (on the phone)

Entered in the app, not in a file:

> **Settings → Explain-differently tutor → Anthropic API key → paste → Save key**

Stored in the iOS keychain via `expo-secure-store` with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. It is
never synced, never logged, and never included in any backup payload. Removing it with
**Remove key and disable** turns the feature off completely — the "Explain this differently"
buttons disappear from the session screen.

Use a separate key from the generator one if you want to track spend independently.

### 3. Supabase keys (optional)

`.env.local` in the project root:

```
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

`EXPO_PUBLIC_` is correct here. The anon key is *designed* to be public — it is the row-level
security policies in `supabase/migrations/0001_init.sql` that protect the data, not the secrecy
of the key. Never put the **service-role** key anywhere in this project.

For EAS builds, these need to exist at build time:

```bash
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://..."
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "..."
```

---

## Testing on the phone right now

With `npm start` running on this machine:

1. Install **Expo Go** from the App Store.
2. Make sure the iPhone is on the same Wi-Fi as this PC.
3. Scan the QR code in the terminal, or open `exp://<your-lan-ip>:8081` directly.

If the phone cannot reach the PC — guest Wi-Fi, client isolation, or a firewall — use a tunnel,
which relays through Expo's servers and works from any network:

```bash
npx expo start --tunnel
```

If Windows Firewall prompts on first run, allow Node on **private** networks.

---

## Production build

You need an [Expo account](https://expo.dev) (free) and, for a real device install, an
**Apple Developer account ($99/yr)**. Everything below runs fine from Windows — the compile
happens on Expo's macOS builders.

### One-time setup

```bash
npm install -g eas-cli
eas login
eas init          # writes extra.eas.projectId and owner into app.json
```

### Builds

```bash
# Internal build for the family's devices — the usual choice here
eas build --platform ios --profile preview

# App Store / TestFlight build
eas build --platform ios --profile production
```

`preview` produces an ad-hoc build installable on devices registered to your Apple account. For
a single-family app this is normally where you stop — no App Store review, no listing.

To register the iPhone for ad-hoc installs:

```bash
eas device:create
```

### Over-the-air updates

`runtimeVersion.policy` is `appVersion`, so JS-only changes ship without a rebuild:

```bash
eas update --branch preview --message "New items for Algebra"
```

Adding or upgrading a **native** module (anything in `plugins`) requires a fresh `eas build`;
an OTA update cannot deliver native code.

---

## Pre-flight checklist

Run before every production build.

```bash
npm test                    # 183 tests
npm run typecheck           # strict TypeScript
npm run content:validate    # schema, licensing, coverage, LaTeX subset
npx expo export --platform ios   # proves the whole app bundles
```

Then check by hand:

- [ ] **Bump `version` in `app.json`.** `autoIncrement` handles `buildNumber`; the marketing
      version is yours to manage.
- [ ] **Bump `CONTENT_VERSION`** in `content/index.ts` if the item bank changed — otherwise
      devices keep the old content in SQLite and never reload it.
- [ ] **Verify the privacy boundary.** Signed in as the parent, run `select count(*) from
      public.attempts;` in Supabase. It must return `0`. If it returns anything else the RLS
      policies did not apply — re-run the migration. This is the guarantee the whole parent
      view rests on, and it is worth re-checking after any schema change.
- [ ] **Check the test specification** if Settings says the check is due, then bump
      `TAXONOMY_VERIFIED_ON` in `src/domain/taxonomy.ts`.
- [ ] **Confirm administration dates.** Everything in `src/domain/program.ts` is flagged
      `estimated: true`. Once College Board publishes the real 2028 dates, correct them and set
      `estimated: false`.
- [ ] **Review any generated items** still sitting in `content/review/`. They are gitignored and
      must not reach a build unreviewed.

---

## Data migration and backup

The SQLite schema is versioned by `PRAGMA user_version` and migrations are append-only
(`src/data/migrations.ts`). Never edit a shipped migration — add a new one, or existing installs
will silently skip your change.

Because the device is the source of truth, **losing the phone loses the history** unless Supabase
sync is configured. For a two-year programme that is a real risk worth ten minutes of setup.

To verify a migration before shipping it: install the previous build, use it, then install the
new build over the top and confirm the data survives. A fresh install always works; an *upgrade*
is what breaks.

---

## Cost at this scale

| | |
| --- | --- |
| Expo account | free |
| EAS builds | free tier covers occasional builds |
| Supabase | free tier, comfortably |
| Apple Developer | \$99/yr, only for installs outside Expo Go |
| Anthropic — generator | ~\$40–120 one-off for the full item bank |
| Anthropic — tutor | pennies per use, only when the student asks |

The dominant cost remains content authoring time, not infrastructure.
