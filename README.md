# Spark Monopoly

Spark Monopoly is an original, client-side business strategy board game for 2–6 people sharing one device. Choose a world, take turns, grow a portfolio, and see who builds the strongest business empire. It is a static Vite application and can be hosted on Vercel, Netlify, or GitHub Pages.

## Features

- Hot-seat games for 2–6 human or bot players, with seeded randomness and save/continue.
- International, India, and Tamil Nadu themes, validated from lazy-loaded JSON.
- English and Tamil interface, optional house rules, property management, auctions, trading, and bot simulations.
- Animated dice, tile-by-tile token movement, rent and cash effects, event history, sound controls, and a winner summary.
- Full, reduced, and off animation settings; keyboard and screen-reader support.
- Offline app shell after the first successful load, with a prompt when an update is available.

## Screenshots

Add current screenshots to `docs/screenshots/` and replace these placeholders before publishing:

- Main menu: `docs/screenshots/main-menu.png`
- Game board: `docs/screenshots/game-board.png`
- Winner summary: `docs/screenshots/game-summary.png`

## Requirements and setup

Use Node.js 22 (22.7 or newer) and npm. The app uses Vite 6.

```powershell
npm ci
npm run dev
```

Vite prints the local URL, normally `http://localhost:5173/`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server. |
| `npm run typecheck` | Run the TypeScript check. |
| `npm run lint` | Lint TypeScript and TSX source. |
| `npm test` | Run unit and integration tests once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run build` | Typecheck and create the production site in `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm run simulate` | Run a seeded batch of bot-only simulations (200 games by default). |
| `npm run simulate:instant` | Run 20 seeded two-player bot games, typically in under a few seconds. |
| `npm run analyze` | Build and create `dist/bundle-report.html`. |

Simulation controls include `SIM_GAMES`, `SIM_SEED`, `SIM_THEME`, and `SIM_PLAYERS`. For example:

```powershell
$env:SIM_GAMES = "20"
$env:SIM_THEME = "tamilnadu"
npm run simulate
```

The default simulation is deterministic for a given seed and player-count sequence. The CLI reports wins, draws, economy totals, and recent actions for capped draws.

## Architecture

- `src/engine/` is pure TypeScript. `gameReducer(state, action)` returns the next state; seeded random helpers keep rolls and deck shuffles reproducible. Rule tests live beside the reducer and bot engine.
- `src/themes/` contains theme JSON, the runtime schema validator, lazy theme loading, and currency formatting. The engine reads names, costs, and currency from the selected theme.
- `src/store/` contains the Zustand game store. It persists autosaves and bounded net-worth history through `src/game/safeStorage.ts`; if browser storage is blocked or full, it falls back to memory and displays a notice.
- `src/components/`, `src/screens/`, and `src/App.tsx` contain the React UI. Screens and theme data are loaded on demand.
- `src/components/animationQueue.ts` orders visual reactions to engine events and has a watchdog so one stalled animation cannot block later actions.
- `src/ui/motion.ts` centralizes shared durations, easing, and motion-level resolution.
- `src/i18n/` contains English and Tamil resources. The locale test ensures matching key paths.
- `src/audio/` plays short synthesized WAV tones by default and supports replacing them with licensed audio files.

Event history and undo snapshots are deliberately bounded to keep long sessions finite. The event log retains the latest 1,000 entries, undo retains 100 frames, and net-worth history retains 500 points.

## Authoring a theme

Create a UTF-8 JSON file in `src/themes/` and add a lazy loader and metadata entry in `src/themes/index.ts`. The validator in `src/themes/themeSchema.ts` runs when a theme is loaded; `npm test` runs the theme validation tests.

Top-level fields:

- `id`, `name`, optional `name_ta`, `description`, and `description_ta`: stable identifier and localized display text.
- `currency`: `symbol`, `format` (`before` or `after`), and `shortScale` labels for thousand, million, billion, and optional lakh/crore.
- `palette`: `primary`, `secondary`, `accent`, `background`, `surface`, and `text` colors; `backgroundStyle` is a theme style identifier.
- `tiles`: exactly 40 ordered board spaces. The validator requires one Go, 22 properties across eight color groups, four transports, two utilities, three Chance spaces, three Community Chest spaces, one of each tax space, Jail, Free Parking, and Go To Jail.
- `cards`: exactly 16 unique Chance cards and 16 unique Community Chest cards.

Tile fields by type:

- `go`: `salary`.
- `property`: `price`, `mortgageValue`, `rent` (`base`, `colorSetDouble`, four `houses` values, and `hotel`), `houseCost`, `colorGroup`, `icon`, `businessFact`, and optional Tamil name/fact.
- `transport`: `price`, `mortgageValue`, four `rentByCount` values, `icon`, and `businessFact`.
- `utility`: `price`, `mortgageValue`, two `diceMultipliers`, `icon`, and `businessFact`.
- Chance/Community Chest spaces: only the type and display names.
- Tax spaces: `amount`; Jail, Free Parking, and Go To Jail spaces have display names.

Each card has a unique `id`, English `text`, optional `text_ta`, and an `effect`. Supported effects are `move`, `moveRelative`, `pay`, `collect`, `jail`, `getOutOfJailFree`, `repair`, and `payEachPlayer`. Keep effect values non-negative; movement destinations must be valid board indices.

To add a fourth theme, copy a current theme JSON, replace its data while preserving the schema and board order, add its metadata plus a dynamic `import()` in `src/themes/index.ts`, and add or extend a test in `src/themes/themes.test.ts`. Do not add theme prices, currency, or property names to the engine.

## Localization

Add the same nested UI keys to `src/i18n/en.json` and `src/i18n/ta.json`; `src/i18n/locales.test.ts` fails when their key paths differ. Register a new locale resource in `src/i18n/index.ts`, add it to the language selector, and update the document language mapping in `src/App.tsx`. Localized theme names and cards use the optional `_ta` fields.

Use [REVIEW.md](./REVIEW.md) to track translation checks. Ask a fluent reviewer to validate Tamil phrasing and layout before release.

## Bots and sound

The bot policy is in `src/engine/bots/`. Use `runBotGame` for one deterministic simulation and `src/engine/bots/simulate.ts` for batch runs; these calls do not use React or animation delays.

Sound definitions are in `src/audio/soundRegistry.ts`. To use real recordings, add appropriately licensed `.wav` files under `public/audio/` and map the relevant `SoundId` values in `SOUND_ASSETS` to paths such as `"/audio/dice-roll.wav"`. Unmapped sounds continue to use generated tones.

## Deployment

Run `npm run build`; the deployable static output is `dist/`.

### Vercel

Import the repository, use the standard npm install/build settings, and set the output directory to `dist`. `vercel.json` supplies the SPA rewrite, cache rules, and security headers.

### Netlify

Set the build command to `npm run build` and the publish directory to `dist`. `netlify.toml` provides the SPA rewrite and headers; `public/_redirects` is an equivalent fallback rewrite.

### GitHub Pages subpath

Set `VITE_BASE` to the repository path, including the leading and trailing slash, when building:

```powershell
$env:VITE_BASE = "/your-repository/"
npm run build
```

On macOS/Linux: `VITE_BASE=/your-repository/ npm run build`. Vite asset URLs and React Router use the configured base. Publish the contents of `dist/` at that subpath. GitHub Pages does not apply the Vercel/Netlify response headers; use a CDN or another host if those headers are required.

The web manifest and service worker cache the application shell and generated chunks, including the theme modules, for offline use after the first online visit. The main brand image is `public/spark-monopoly-logo.png`; its 192px and 512px favicon/PWA versions are in `public/icons/`. Replace `example.com` in `public/robots.txt`, `public/sitemap.xml`, and the Open Graph/Twitter URL and image in `index.html` before publishing. Hashed assets are immutable; the HTML and service worker are configured not to cache.

## Troubleshooting

- If install/build reports a Node engine error, use Node 22.7 or newer and rerun `npm ci`.
- If an update prompt does not appear, install the production build, load it once online, and publish a changed build before checking for updates.
- To test offline behavior, load the deployed app once, wait for the service worker to install, then use the browser's offline mode and reload.
- If saves do not survive a browser restart, check storage permissions and available space. The in-memory fallback only lasts for the current tab session.
- If a theme fails validation, inspect the browser console for the field/category and check its board counts, unique ids, card effects, and currency schema.
- If a route returns a host-level 404, verify the SPA rewrite and deploy `dist/`, not the source folder.

See [LEGAL.md](./LEGAL.md) for the project notice.
