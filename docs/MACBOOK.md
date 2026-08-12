# Running and testing on the MacBook

The MacBook removes the problem that blocked the iPad. Expo SDK 57 needs **iOS 16.4+**, and
Apple only lets you install the newest Expo Go on a physical device — so an older iPad is simply
out of reach. The **iOS Simulator** has no such constraint: it runs whatever iOS version Xcode
provides, needs no Expo Go, no QR code, and no tunnel.

Test in the Simulator first. Worry about physical devices afterwards.

---

## Step 1 — Move the code (on Windows)

The project is a git repo with one commit from the template; our work is not committed yet.

```powershell
cd <path-to>\sat-prep

git status                # sanity check: no .env.local, no node_modules
git add -A
git commit -m "SAT prep app: MVP + V1, 271 items, 183 tests"
```

Create an empty **private** repo on GitHub, then:

```powershell
git remote add origin https://github.com/<you>/sat-prep.git
git branch -M main
git push -u origin main
```

Private is the right call — nothing here is secret, but it is a minor's study app.

**No GitHub?** Copy the folder to a USB drive, but delete `node_modules` first: it is ~700 MB,
platform-specific, and `npm install` rebuilds it correctly on macOS anyway.

---

## Step 2 — Install the toolchain (on the Mac)

```bash
# Homebrew, if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

brew install node watchman git
```

Then **Xcode from the Mac App Store**. It is a large download — start it before you need it.
Once installed:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
xcodebuild -runFirstLaunch
```

Open Xcode once and let it install the iOS platform support it offers. Then confirm a simulator
exists:

```bash
xcrun simctl list devices available | grep iPhone
```

If that prints nothing, open Xcode → **Settings → Components** and install an iOS simulator
runtime.

---

## Step 3 — Get it running

```bash
git clone https://github.com/<you>/sat-prep.git ~/dev/sat-prep
cd ~/dev/sat-prep

npm install
npm test          # expect: 183 passed
npm run typecheck # expect: no output
```

Clone somewhere **without spaces in the path**. CocoaPods and some Xcode build scripts still
handle spaces poorly, and `~/dev/...` costs nothing.

If `npm test` passes, the port is done — the whole engine layer is plain TypeScript with no
platform dependencies, which is exactly why this move is uneventful.

### Launch it

```bash
npm start
# then press `i`
```

That opens the app in the iOS Simulator. First launch takes 30–60 seconds while Metro bundles.

If pressing `i` fails, use the native build path instead — slower the first time, more reliable:

```bash
brew install cocoapods
npx expo run:ios
```

---

## Step 4 — Test it

Roughly ten minutes. Each step has a stated expected result, so a failure is unambiguous.

### A. First run

1. App opens on **Let's set up**.
2. Enter a nickname, grade `9`, leave the date `2028-05-06`. Tap **Start**.
   - *Expected:* lands on Home, greeting shows your nickname.
3. Home shows a week strip of seven dots and a card reading **Phase A · Foundation**.
   - *Expected:* "30 minutes, ready to go" with a question count around 20–25.

### B. The daily session — the core loop

4. Tap **Start session**.
   - *Expected:* progress bar, a block heading, and the first question.
5. Answer one question **wrong** on purpose.
   - *Expected:* your choice turns red, the correct one green, and **the explanation appears only
     now** — never before you commit. That ordering is the point: showing it earlier turns
     retrieval into re-reading, which is what destroys the benefit.
6. Answer one **right**.
   - *Expected:* green, plus an explanation.
7. Continue to a **Math** question.
   - *Expected:* fractions render stacked with a bar, square roots with an overbar — not raw
     `\frac{}{}`. This is the native renderer, not a WebView.
8. Find a **student-produced response** item (a text box, no choices). If the answer is `0.28`,
   try typing `7/25`.
   - *Expected:* marked **correct**. Equivalent forms are accepted, as on the real test.
9. Finish the session.
   - *Expected:* "X of Y correct", then Home shows **Session complete** and today's dot filled.

### C. Progress and honesty rules

10. Home → **Progress**.
    - *Expected:* eight domains listed. Mastery reads `—` until roughly 10 answers per skill —
      it refuses to show a number it cannot support.
11. Home → **Practice test** → **Start diagnostic**.
    - *Expected:* a timer counting down from 32:00, module label "Reading and Writing · Module 1".
      You can quit out; the point is that timing is real.
12. If you complete one, check the score.
    - *Expected:* a **range** like `1050–1170`, never a single number, plus a percentile band and
      a disclaimer. PRD §2.6 forbids a bare point estimate.

### D. Parent view and the privacy boundary

13. Home → **For parents**.
    - *Expected:* days practised, minutes, domain movement.
    - *Expected:* **no list of missed questions anywhere.** That is enforced in three places —
      the payload screen, the summary builder, and Postgres RLS — not by hiding UI.

### E. Settings

14. **Settings** → confirm programme details, content count **271**, bank version.
15. **Daily reminder** → set a time a couple of minutes ahead → **Turn reminder on**.
    - *Expected:* permission prompt, then confirmation. (Simulator notification delivery is
      unreliable — verify properly on a real device later.)
16. **Content sources and licences**.
    - *Expected:* every item accounted for by licence type.

### F. Offline — the hard requirement

17. Simulator menu → **Device → Network Link Conditioner**, or just turn off the Mac's Wi-Fi.
18. Force-quit the app, reopen, run a session.
    - *Expected:* **works identically.** No spinner, no error. The whole design rests on this;
      if it fails, that is the most serious possible bug.

---

## Step 5 — Onto a real iPhone

Only after the Simulator run passes.

```bash
npx expo run:ios --device
```

Plug the iPhone in via USB and pick it from the list. Xcode will ask for an Apple ID and team; a
free Apple ID gives 7-day builds on your own device, which is enough to confirm it works.

For a build that does not expire — and the one used daily — you need the
\$99/yr Apple Developer account:

```bash
eas device:create
eas build --platform ios --profile preview
```

A standalone build is also where notifications become reliable, which matters given the daily
reminder is part of the design.

---

## If something breaks

| Symptom | Cause | Fix |
| --- | --- | --- |
| `npm test` fails on Mac | bad install | `rm -rf node_modules && npm install` |
| Pressing `i` does nothing | no simulator runtime | Xcode → Settings → Components |
| Metro cache weirdness | stale cache | `npx expo start --clear` |
| `expo run:ios` pod errors | CocoaPods missing | `brew install cocoapods` |
| Blank screen, no error | JS crash before render | check the Metro terminal output |

Note `ios/` and `android/` are gitignored deliberately. Expo regenerates them from `app.json`, so
they are build output, not source — never hand-edit them.

---

## Re-adding keys on the Mac

Neither is in git.

```bash
cp .env.example .env.local        # then fill in Supabase values, if using them

echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.zshrc && source ~/.zshrc
```

The **tutor** key needs nothing here — it lives in the phone's keychain, not the project, so it
is unaffected by changing computers.
