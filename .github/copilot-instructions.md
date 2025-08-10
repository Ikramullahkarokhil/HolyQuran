# Copilot Instructions for HolyQuran Expo App

## Project Overview
- This is a cross-platform mobile app built with [Expo](https://expo.dev) and React Native, supporting Android and iOS.
- The main app logic is in the `app/` directory, using file-based routing (`_layout.jsx`, `index.jsx`, and tab folders).
- Key features include Tazbih counter, Surah details, Allah's names, Bookmarks, Daily Dua, and multi-language support.
- Data (Quran, Surah names, recitations) is stored in `assets/QuranData/` and `assets/recitations.json`.

## Developer Workflows
- **Install dependencies:** `npm install`
- **Start development server:** `npx expo start` (use Expo Go, emulator, or simulator)
- **Reset project:** `npm run reset-project` (moves starter code to `app-example/` and creates a blank `app/`)
- **Android/iOS native code:** See `android/` and `ios/` folders for platform-specific files.

## Patterns & Conventions
- **State management:** Uses React hooks and local state. Persistent state (e.g., Tazbih counter) is stored with `AsyncStorage`.
- **Theme and localization:**
  - Theme colors from `components/Theme.js` and `store/useThemeStore.js`.
  - Localization via `react-i18next` and JSON files in `locales/`.
- **Audio:** Uses `expo-audio` for sound playback (see Tazbih feature).
- **Navigation:** Uses `@react-navigation/native` and file-based routing in `app/`.
- **UI components:** Uses `react-native-paper` for buttons, icons, and modals.
- **Recitations:** Data loaded from `assets/recitations.json` and displayed in Tazbih.

## Integration Points
- **Quran data:** JSON files in `assets/QuranData/` for multi-language support.
- **Audio files:** Located in `assets/audio/`.
- **Images:** Located in `assets/images/`.
- **Native code:** Android and iOS folders for platform-specific configuration and assets.

## Examples
- **Tazbih Counter:** See `app/Tazbih/index.jsx` for patterns:
  - Persistent counter with AsyncStorage
  - Sound/vibration/silent modes
  - Modal for setting max count
  - Recitation navigation using local JSON
- **Localization:**
  - Use `useTranslation()` from `react-i18next`
  - Language files in `locales/`
- **Theme:**
  - Use `useTheme()` from `react-native-paper`
  - Custom colors in `components/Theme.js`

## Tips for AI Agents
- Always use file-based routing for new screens/components in `app/`.
- Use hooks for state and effects; prefer `AsyncStorage` for persistence.
- Follow existing patterns for modals, navigation, and theming.
- Reference assets and data from the correct folders (`assets/`, `locales/`).
- For platform-specific features, check `android/` and `ios/` for configuration.
- Use `expo-audio` for sound playback and ensure audio files are in `assets/audio/`.
- allways use the latest docs for refrence .
- iam on expo sdk 53.
- use the theme colors from `components/Theme.js` and `store/useThemeStore.js` for consistency.

---
_If any section is unclear or missing, please provide feedback for further refinement._
