# AdvoCal – Legal Calendar App

A React Native (Expo) mobile application for Indian advocates to manage court hearings, cases, clients, and legal deadlines.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile App | React Native 0.83 + Expo SDK 55 |
| Navigation | expo-router (file-system routing) |
| Styling | NativeWind v4 + Tailwind CSS v3 |
| Backend / DB | Supabase (Postgres + Auth + Storage + Edge Functions) |
| Build tooling | pnpm 10 + Expo EAS Build |
| Web Admin Panel | React + Vite (in `/admin`) |

---

## Project Structure

```
advocal/
├── src/
│   ├── app/                    # expo-router screens & layouts
│   │   ├── _layout.tsx         # Root layout (auth + navigation)
│   │   ├── index.tsx           # Landing / splash screen
│   │   ├── (auth)/             # Sign-in, Sign-up screens
│   │   └── (app)/              # Protected app screens
│   │       ├── (tabs)/         # Bottom-tab screens (Home, Calendar, Cases, Profile)
│   │       └── ...             # Detail/modal screens
│   ├── components/
│   │   ├── ui/                 # Base UI components (Button, Card, Dialog, …)
│   │   └── *.tsx               # Feature-level components
│   ├── lib/
│   │   ├── utils.ts            # cn() helper
│   │   └── theme.ts            # NAV_THEME color constants
│   ├── client/
│   │   └── supabase.ts         # Supabase client singleton
│   ├── ctx.tsx                 # SessionProvider + useSession hook
│   └── global.css              # Tailwind CSS variable definitions
├── assets/                     # App icon, adaptive icon, images
├── plugins/                    # Expo config plugins (Gradle fixes)
│   ├── withAndroidBuildConfig.js
│   └── withStripAsyncStorageMaven.js
├── patches/                    # pnpm patches for native-module fixes
│   ├── expo@55.0.6.patch
│   ├── @react-native-async-storage__async-storage@2.2.0.patch
│   ├── @react-native-async-storage__expo-with-async-storage@1.0.0.patch
│   └── @shopify__react-native-skia@2.4.18.patch
├── supabase/
│   ├── migrations/             # Database schema migrations (SQL)
│   ├── functions/              # Edge Functions (Deno/TypeScript)
│   └── config.toml             # Local Supabase config
├── admin/                      # Web Admin Panel (React + Vite)
├── app.json                    # Expo app configuration
├── eas.json                    # EAS Build profiles
├── package.json
├── pnpm-lock.yaml              # Lockfile – MUST be committed
├── babel.config.js
├── metro.config.js
├── tailwind.config.js
├── tsconfig.json
└── .env                        # Local env vars (NOT committed)
```

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 18 | https://nodejs.org |
| pnpm | 10.x | `npm i -g pnpm@10` |
| EAS CLI | latest | `npm i -g eas-cli` |
| Java JDK | 17 | Required only for local Android builds |
| Android Studio | latest | Required only for local Android builds |

---

## Setup

### 1. Clone & install

```bash
git clone <your-repo-url> advocal
cd advocal
pnpm install
```

> **Important**: Always use `pnpm install`, never `npm install`. The `pnpm-lock.yaml` lockfile pins exact versions and applies critical patches for Android builds.

### 2. Configure environment variables

```bash
cp .env.example .env
# Edit .env and fill in your Supabase project values
```

Get the values from your Supabase dashboard → **Settings → API**.

### 3. Run in development (Expo Go / web)

```bash
pnpm start          # starts Metro bundler
# Press 'a' for Android emulator, 'i' for iOS simulator, 'w' for web
```

---

## Building the APK

### Option A: EAS Build ✅ Recommended (no local Android SDK needed)

EAS Build is Expo's managed cloud build service. **Free tier: 30 builds / month.**

```bash
# 1. Log in to your Expo account (create one free at expo.dev)
eas login

# 2. Link your project (first time only)
eas build:configure

# 3. Build a release APK
eas build --platform android --profile preview

# The APK download URL is printed when the build completes (~15 min).
```

Available EAS profiles (defined in `eas.json`):

| Profile | Output | Use case |
|---|---|---|
| `development` | Debug APK | Internal testing |
| `preview` | Release APK | Sharing with testers / clients |
| `production` | AAB (App Bundle) | Google Play Store submission |

### Option B: Local build (requires Android Studio + JDK 17)

```bash
# 1. Generate the android/ folder
npx expo prebuild --platform android --clean

# 2. Accept Android SDK licences (once)
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses

# 3. Build
cd android
./gradlew assembleRelease

# APK location:
# android/app/build/outputs/apk/release/app-release.apk
```

---

## Database & Backend (Supabase)

### Apply migrations

```bash
# Install Supabase CLI
npm i -g supabase

# Link to your project
supabase link --project-ref YOUR_PROJECT_ID

# Push all migrations
supabase db push
```

### Deploy Edge Functions

```bash
supabase functions deploy
```

### Local development with Supabase

```bash
supabase start       # starts local Postgres + Auth + Storage
supabase stop
```

---

## Web Admin Panel

The admin panel lives in `/admin` (React + Vite).

```bash
cd admin
npm install
npm run dev          # local dev at http://localhost:5173

# Build for production
npm run build        # output in admin/dist/
```

Deploy `admin/dist/` to any static host (Firebase Hosting, Netlify, Vercel, etc.).

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous public key |
| `EXPO_PUBLIC_FUNCTIONS_URL` | ✅ | Edge Functions base URL (same as SUPABASE_URL) |
| `EXPO_PUBLIC_FUNCTIONS_ANON_KEY` | ✅ | Anon key for Edge Function calls |
| `EXPO_PUBLIC_APP_ID` | optional | Internal app identifier |

For EAS builds, these are injected via the `env` block in `eas.json` (already configured).

---

## Key Config Files

### `app.json`
Expo app configuration – app name, bundle ID (`com.advocal.app`), permissions, icons, splash screen, and config plugins.

### `eas.json`
EAS Build profiles. Edit `env` blocks if you change your Supabase project.

### `plugins/withAndroidBuildConfig.js`
Custom Expo config plugin that:
- Pins Gradle to **8.13** (prevents Gradle 9 `IBM_SEMERU` crash)
- Removes spurious `compileClasspath` block from async-storage
- Applies other Android build fixes

### `patches/`
pnpm patches applied at install time:
- `expo@55.0.6.patch` — pins expo-audio / expo-video versions
- `@react-native-async-storage__expo-with-async-storage@1.0.0.patch` — neutralises broken `local_repo` maven injection

---

## Troubleshooting

### APK build fails with `IBM_SEMERU` error
The config plugin `withAndroidBuildConfig.js` pins Gradle to 8.13. Make sure you ran `pnpm install` (not `npm install`) so the lockfile is respected.

### APK build fails with `local_repo` maven error
The pnpm patch for `expo-with-async-storage` must be applied. Run `pnpm install` — pnpm automatically applies patches recorded in `pnpm-lock.yaml`.

### `Module not found` errors after adding a new package
Always use `pnpm exec expo install <package-name>` — never `pnpm add` or `npm install`. This ensures Expo SDK version compatibility.

### EAS build error: "project not found"
Run `eas build:configure` to link the project to your Expo account, then retry.

---

## Scripts

| Command | Description |
|---|---|
| `pnpm start` | Start Metro bundler |
| `pnpm run lint` | Run biome linter (0 errors required) |
| `pnpm run android` | Run on Android emulator |
| `pnpm run ios` | Run on iOS simulator |
| `pnpm run web` | Run in browser |

---

## License

Proprietary – © AdvoCal. All rights reserved.
