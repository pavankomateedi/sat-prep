# Setting up on a brand-new MacBook

Written for a Mac with nothing installed. Every command is copy-pasteable, and each step says
what you should see when it worked.

**Total time: about an hour**, most of it Xcode downloading in the background. Start Step 2
first and do Steps 3-5 while it downloads.

Why the Mac matters: the iPad could not run this because Expo SDK 57 requires iOS 16.4+, and
Apple only allows the newest Expo Go on a physical device. The Mac's **iOS Simulator** has no
such limit — no Expo Go, no QR codes, no network involved.

---

## Step 1 — Open Terminal

Press **⌘ + Space**, type `Terminal`, press **Return**.

A window opens with a prompt ending in `%`. That is where every command below goes. Paste with
**⌘ + V**, run with **Return**.

Check which chip you have — it changes one step later:

```bash
uname -m
```

- `arm64` → Apple Silicon (M-series). Almost certainly you.
- `x86_64` → Intel.

---

## Step 2 — Start the Xcode download now

Xcode is ~10 GB and can take 30-60 minutes. Start it before anything else and let it run.

1. Open the **App Store** (⌘ + Space, type `App Store`).
2. Search **Xcode**.
3. Click **Get** / the cloud icon. Sign in with your Apple ID if asked.

Leave it downloading and carry on with Step 3 in Terminal.

> Xcode is what compiles the iOS app and provides the iPhone Simulator. There is no way around
> it on a Mac, and it is free.

---

## Step 3 — Command Line Tools

While Xcode downloads:

```bash
xcode-select --install
```

A dialog appears — click **Install**, accept the licence. Takes a few minutes.

If you see `command line tools are already installed`, that is fine. Move on.

---

## Step 4 — Homebrew

Homebrew installs developer tools. Paste this exactly:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

It asks for your **Mac login password** — typing shows nothing, no dots. That is normal. Type
it and press Return.

### The step people miss

On Apple Silicon, Homebrew installs somewhere the shell does not look by default. **If you skip
this, the next step fails with `brew: command not found`.**

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

On Intel, Homebrew installs to `/usr/local` and is already on the path — skip the two lines
above.

Confirm:

```bash
brew --version
```

You should see `Homebrew 4.x.x`. If you see `command not found`, the two lines above did not
run — try them again.

---

## Step 5 — Node, Watchman, Git

```bash
brew install node watchman git
```

Takes a few minutes. Confirm:

```bash
node --version    # v22 or newer
git --version     # 2.x
```

`watchman` makes the file-watcher fast on macOS. `git` — macOS ships an old one; this gets a
current one.

---

## Step 6 — Finish Xcode setup

Only once the App Store shows Xcode as installed.

Open **Xcode** once from Applications. It will offer to install additional components — accept.
Then quit it and run:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
xcodebuild -runFirstLaunch
```

`sudo` asks for your Mac password again.

Confirm a simulator exists:

```bash
xcrun simctl list devices available | grep iPhone
```

You should see lines like `iPhone 16 Pro (...) (Shutdown)`.

**If nothing prints:** open Xcode → menu **Xcode → Settings → Components** → install an iOS
Simulator runtime → re-run the command.

---

## Step 7 — Sign in to GitHub

The repository is **private**, so cloning needs authentication. The GitHub CLI is the least
painful way.

```bash
brew install gh
gh auth login
```

Answer the prompts:

- *What account?* → **GitHub.com**
- *Preferred protocol?* → **HTTPS**
- *Authenticate Git with your GitHub credentials?* → **Yes**
- *How would you like to authenticate?* → **Login with a web browser**

It shows a one-time code, then opens your browser. Paste the code, approve.

Confirm:

```bash
gh auth status
```

Should say `Logged in to github.com account pavankomateedi`.

---

## Step 8 — Get the code and run the tests

```bash
mkdir -p ~/dev
cd ~/dev
gh repo clone pavankomateedi/sat-prep
cd sat-prep
npm install
```

`npm install` takes 2-3 minutes and prints warnings about deprecated sub-dependencies. Warnings
are fine; errors are not.

Now the moment that tells you the whole port worked:

```bash
npm test
```

**Expect `Tests  254 passed (254)`.**

The entire learning engine — scheduling, mastery, scoring, the calculator — is plain TypeScript
with no Apple dependencies. If those 254 pass, everything except the screens is verified on this
machine.

```bash
npm run typecheck    # prints nothing = success
```

> Cloned to `~/dev/sat-prep` deliberately — a path with **no spaces**. Some Xcode build scripts
> still handle spaces badly, and it costs nothing to avoid.

---

## Step 9 — Launch the app

```bash
npm start
```

Wait for the QR code, then press the **`i`** key.

The iOS Simulator opens and the app builds. **First launch takes 1-2 minutes** — the progress
bar is Metro compiling. After that it is a few seconds.

You should land on **"Let's set up"**.

**If pressing `i` does nothing:** press **Ctrl + C** to stop, then use the slower but more
reliable native build:

```bash
brew install cocoapods
npx expo run:ios
```

First run takes 5-10 minutes as it generates the native project and compiles.

---

## Step 10 — Test it

About ten minutes. Each step says what should happen.

### Set up

1. Nickname: anything. Grade: `9`. Target date: leave `2028-05-06`. Tap **Start**.
   - *Expect:* Home screen, greeting with your nickname, a row of seven day-dots.

### The daily loop

2. Tap **Start session** → answer one question **wrong on purpose**.
   - *Expect:* your choice red, the right one green, and **the explanation appears only now**.
     Never before you commit — showing it earlier turns recall into re-reading.
3. Continue to a **Math** question.
   - *Expect:* fractions stacked with a bar, roots with an overbar. Not raw `\frac{}{}`.
4. Find a question with a **text box** instead of choices. If the answer is `0.28`, type `7/25`.
   - *Expect:* **correct** — equivalent forms are accepted, as on the real test.
5. On a Math question, tap **Calculator**. Type `2x^2 - 4`.
   - *Expect:* a graph. (This one was broken until last week — `2x` was misread as not
     containing a variable.)
6. Tap **Reference**.
   - *Expect:* formula sheet, plus a list of what the real sheet does **not** give you.

### Practice test

7. Home → **Practice test** → **Start diagnostic**.
   - *Expect:* a timer counting down from **32:00**.
8. Tap **☆ Flag**, then the **⊘** beside a choice.
   - *Expect:* the choice greys out and is struck through. Selecting a struck choice restores it.
9. Tap **All questions**.
   - *Expect:* a numbered grid — answered filled, flagged outlined. Tap any number to jump.
     **Scroll to the bottom: the submit button must be reachable.** (It was not, until last week.)

### Parent view and privacy

10. Home → **For parents**.
    - *Expect:* days practised, minutes, domain movement.
    - *Expect:* **no list of missed questions.** Enforced in three places, not by hiding UI.

### The hard requirement

11. Turn off the Mac's **Wi-Fi**. Force-quit the app in the Simulator (**⌘ + Shift + H** twice,
    swipe up), reopen, run a session.
    - *Expect:* **works identically.** No spinner, no error. The whole design rests on this — a
      failure here is the most serious possible bug.

---

## Step 11 — Onto a real iPhone

Only after the Simulator run passes.

### Free, expires after 7 days

```bash
npx expo run:ios --device
```

Plug the iPhone in by USB, unlock it, tap **Trust This Computer**, and pick it from the list.
Xcode asks for an Apple ID and team — a free Apple ID works.

On the phone: **Settings → General → VPN & Device Management → trust the developer profile**.

### Permanent (needs Apple Developer, $99/yr)

```bash
npm install -g eas-cli
eas login
eas init
eas device:create        # follow the link on the iPhone to register it
eas build --platform ios --profile preview
```

The build runs on Expo's servers; you get an install link when it finishes. This is the one
Vedansh should use daily — notifications are only reliable in a standalone build.

After that, shipping updates needs no rebuild:

```bash
eas update --branch preview --message "New questions"
```

---

## If something goes wrong

| What you see | Why | Fix |
| --- | --- | --- |
| `brew: command not found` | Step 4's PATH lines were skipped | Re-run the two `eval` lines |
| `npm test` fails | bad install | `rm -rf node_modules && npm install` |
| Pressing `i` does nothing | no Simulator runtime | Xcode → Settings → Components |
| `xcrun: error: unable to find utility` | Xcode path not set | Re-run Step 6's `xcode-select -s` |
| Clone asks for a password | not signed in | `gh auth login` (Step 7) |
| Odd Metro errors | stale cache | `npx expo start --clear` |
| `pod install` fails | CocoaPods missing | `brew install cocoapods` |

`ios/` and `android/` are gitignored deliberately — Expo regenerates them from `app.json`, so
they are build output, not source. Never edit them by hand.

---

## Optional extras

**Neither is needed for the app to work.** Skip both unless you want them.

```bash
# Grow the question bank (runs on this Mac, not on the phone)
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.zshrc && source ~/.zshrc
npm run content:generate -- --plan --count 30

# Cloud backup and the parent's own login
cp .env.example .env.local     # then fill in the two Supabase values
```

The in-app tutor's key is entered in **Settings** on the phone, not here — it lives in the
device keychain and is unaffected by changing computers.
