# Hosting the app

Three ways to get the app onto a phone, in increasing order of permanence. Start at the top and
move down as you need to.

| | Public URL? | Survives PC shutdown? | Needs | Good for |
| --- | --- | --- | --- | --- |
| Tunnel | yes | **no** | nothing | Testing today |
| EAS Update | yes | **yes** | free Expo account | Sharing a stable link |
| EAS Build | n/a — installed app | yes | Apple Developer, \$99/yr | The real thing |

A note on what "hosting" can mean here: this is a React Native app, so there is no website to
host. What gets hosted is the **JavaScript bundle**, which the Expo Go app downloads and runs.
The web target is not a usable option — the app depends on SQLite, SecureStore, and local
notifications, none of which work properly in a browser.

---

## 1. Tunnel — public link, running now

```powershell
cd <path-to>\sat-prep
npx expo start --tunnel
```

The terminal prints a QR code and a URL of the form
`exp://<random>-anonymous-8081.exp.direct`.

Works from **any** network — cellular, a friend's house, anywhere. It relays through Expo's
servers rather than your LAN.

**The catch:** it lives only as long as that terminal is open, and the URL changes each time you
restart. Fine for testing, not for handing to someone.

To find the URL without reading the QR code, look at `.expo/settings.json`:

```powershell
Get-Content .expo\settings.json
# { "urlRandomness": "58rmaaE" }  ->  exp://58rmaaE-anonymous-8081.exp.direct
```

---

## 2. EAS Update — a permanent link

This is what you want for a link that keeps working. It publishes the JS bundle to Expo's CDN,
so your PC does not need to be on.

### One-time setup

```powershell
npm install -g eas-cli

eas login
#   Create a free account at https://expo.dev first if you have not.

eas init
#   Links this folder to an Expo project.
#   Writes `extra.eas.projectId` and `owner` into app.json — commit that change.

eas update:configure
#   Adds the `updates` block to app.json.
```

### Publish

```powershell
eas update --branch preview --message "First build"
```

The command prints a permanent URL. Open it on the iPhone with Expo Go installed, and the app
loads. Re-run the same command after any change and the link serves the new version.

### Verify before publishing

```powershell
npm test
npm run typecheck
npx expo export --platform ios
```

An OTA update ships whatever is in your working tree. There is no build step to catch a mistake,
so run the checks yourself.

---

## 3. EAS Build — a real installed app

Expo Go is a shell that loads your JS. A standalone app has its own icon, works without Expo Go,
and can use notifications properly.

```powershell
eas device:create          # register the iPhone (opens a link to install a profile)
eas build --platform ios --profile preview
```

Requires an Apple Developer account (\$99/yr). The build runs on Expo's macOS machines, so this
works from Windows. When it finishes you get an install link.

For a single-family app, `preview` is the endpoint — no App Store listing, no review.

---

## Which link to give whom

- **Testing on your own phone today** → tunnel.
- **A stable link for the family** → EAS Update on the `preview` branch.
- **The student using it daily for two years** → EAS Build. Notifications and offline behaviour are
  both more reliable in a standalone app than inside Expo Go, and the daily reminder is a
  meaningful part of the design.
