# Setup

## Running it on the iPhone

You are on Windows, so there is no local iOS build. Expo Go covers development:

```bash
npm install
npm start
```

Install **Expo Go** from the App Store, scan the QR code, and the app loads. Everything works
in Expo Go — SQLite, Sign in with Apple, background tasks, and the offline path.

### When you outgrow Expo Go

A standalone app that survives without the Expo Go shell needs an Apple Developer account
($99/yr) and EAS cloud builds:

```bash
npm install -g eas-cli
eas login
eas build --platform ios --profile preview
```

Nothing in the code changes — `app.json` already declares the bundle identifier and config
plugins. It is a build step, not a rewrite.

## Supabase (optional)

**The app is fully functional without this.** Everything is stored on the device; skipping this
section costs you cloud backup and the parent's own login, nothing else. It is also the more
privacy-preserving configuration, since a minor's learning data never leaves the phone.

1. Create a project at supabase.com.
2. Run `supabase/migrations/0001_init.sql` in the SQL editor. This creates the schema **and** the
   row-level security policies — do not skip the policies; they are what stops a parent account
   reading item-level answers.
3. Create `.env.local`:

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   ```

4. Restart Metro with `npx expo start --clear`.

### Creating the two accounts

After both people have signed in once, insert a profile row for each. The `role` column is what
the RLS policies key on:

```sql
insert into public.students (display_name, grade_level, program_start_date, target_test_date)
values ('Student', 9, '2026-09-01', '2028-06-01')
returning id;

-- Use the returned id for both rows.
insert into public.profiles (user_id, role, student_id, display_name)
values
  ('<student-auth-uid>', 'student', '<student-id>', 'Student'),
  ('<parent-auth-uid>',  'parent',  '<student-id>', 'Parent');
```

### Verifying the privacy boundary

Worth doing once, because this is the guarantee the parent view rests on. Signed in as the
parent, run:

```sql
select count(*) from public.attempts;
```

It must return `0`, even though rows exist. The parent role has no policy on that table, so the
rows are invisible rather than merely hidden by the UI. If it returns anything else, the
policies did not apply — re-run the migration.

## Commands

| Command | What it does |
|---|---|
| `npm start` | Metro dev server |
| `npm test` | 148 engine tests, ~1 second |
| `npm run typecheck` | Strict TypeScript |
| `npm run content:validate` | Content schema, licensing, coverage, sizing, and LaTeX subset |
| `npx expo export --platform ios` | Verify the whole app bundles |

## Environment notes for this machine

- **PowerShell writes UTF-8 with a BOM.** `Out-File -Encoding utf8` on a JSON file produces a
  byte-order mark that Expo's config reader rejects with a confusing `Unexpected token '﻿'`
  error. This bit this project once already, on `package.json`.

  Note that `-Encoding utf8NoBOM` does **not** exist in Windows PowerShell 5.1 (which is what
  runs here) — it was added in PowerShell 7. On 5.1, write BOM-free files with .NET directly:

  ```powershell
  [System.IO.File]::WriteAllText("$PWD\file.json", $text, (New-Object System.Text.UTF8Encoding $false))
  ```

  Simplest habit: edit JSON in your editor, not through PowerShell redirection.
- The project path contains spaces. Metro handles this, but if a tool misbehaves in an
  unexplained way, that is the first thing to suspect.
