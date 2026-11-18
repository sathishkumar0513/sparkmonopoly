# Contributing

1. Use Node.js 22.7 or newer and run `npm ci`.
2. Keep rules and deterministic behavior in the pure TypeScript engine; add focused reducer or bot tests for rule changes.
3. Keep theme-specific names, prices, and currency in validated theme data. Add new interface strings to every locale.
4. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run simulate:instant` before opening a pull request.
5. Include a short description of behavior changes and screenshots for visible UI changes. Do not include unlicensed logos or sound assets.
