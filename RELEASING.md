# How to Release a New Version

## Steps

1. **Bump the version** in three files:
   - `src/00-header.js` — `@version` line
   - `src/01-state.js` — `const VERSION` line
   - `package.json` — `"version"` field

2. **Build and test locally:**
   ```bash
   npm run build:min
   ```
   Paste the built file into Tampermonkey and verify in the browser.

3. **Commit and push:**
   ```bash
   git add -A
   git commit -m "bump version to 1.2.9"
   git push origin main
   ```

4. **Create the release:**
   ```bash
   npm run release
   ```
   This tags the commit as `vX.Y.Z` and pushes the tag. GitHub Actions then builds the minified `.user.js` and creates a release at https://github.com/margibs/tom-overlay/releases.

## Reverting to a Previous Version

- **From GitHub:** Download the `.user.js` from the [Releases page](https://github.com/margibs/tom-overlay/releases) and paste it into Tampermonkey.
- **From git:** `git checkout v1.2.7 -- tribes-of-malaya-overlay.user.js`

## What Happens in Tampermonkey

Tampermonkey checks `@updateURL` periodically (roughly every day) for version changes. When it detects a newer `@version`, it downloads the new script from `@downloadURL`.

Both URLs point to the `main` branch:
```
https://raw.githubusercontent.com/margibs/tom-overlay/main/tribes-of-malaya-overlay.user.js
```

So as long as you push the built file to `main`, Tampermonkey will auto-update. You can also force an update manually: **Tampermonkey dashboard → click the script → Check for updates**.

Note: The GitHub Releases page is a separate archive — it's for you to download old versions if needed, not what Tampermonkey checks.
