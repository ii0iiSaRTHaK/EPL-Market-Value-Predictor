# Player Value / Living Green

This redesign uses the registered ThreeUI **SylvaHero / Living Green** source revision `05f359ce157a`. It keeps the Node/Python prediction API and adds a small React island for the requested component. The remaining application uses native HTML, CSS, and JavaScript.

## Run

```powershell
npm ci
npm run build
npm start
```

Open `http://localhost:3001`. The compiled frontend is checked in, so `node server.js` also serves the current build immediately. The existing Python environment and model requirements in README.md still apply to predictions.

Edit `src/Scene.tsx` for the app integration, `src/page.html` for the surrounding page, `src/app.css` for styling, and `src/app.js` for search/results. Rebuild after edits. Do not edit the verified vendor files or canonical document.

## Source integrity

- `vendor/threeui/source-manifest.json` records the supplied SHA-256 hashes for all seven registered source files and all three required binary assets.
- The five supplied React/CSS source files are preserved byte-for-byte under `vendor/threeui/src/`.
- The exact canonical HTML, local Three.js runtime, photographs, and Lexend font were obtained from the published `@designcodeio/threeui@1.2.0` archive and copied to their original `public/landing-pages/` paths. Every file matches the supplied hash. The current live HTML URL differs, so it was not used.
- The published npm component differs from the registered component. This app therefore resolves the requested import to a local package containing the registered source. The build extracts the `SylvaHero` function body verbatim, together with its constants, and compiles it against the exact registered frame, typography hook, and recipes. Unrelated unpublished page imports are excluded. Only the requested `living-green` variant is supported; other variants deliberately throw rather than display a substitute.
- The extra Fragment Mono font referenced by the shared CSS comes from ThreeUI's public source at commit `68802d5428071ada5c20db8094b1649e6bb770ed`. It is bundled locally. Living Green uses Lexend.
- `.gitattributes` disables newline conversion on the verified source and assets, preserving hashes on Windows checkouts.
- `npm run verify:source` runs before every build and rejects modified registered files or assets.

`Scene.tsx` uses all the requested props. The source's own `applyScene` extension changes live text and connects native controls to the parent application's scouting and model sections. The canonical file's authored structure, styles, shader code, animation, responsive rules, native metal controls, pollen, flowers, ferns, and butterfly are unchanged on disk.

## Product changes

- Botanical hero with Player Value copy, local Lexend, and functional navigation/primary controls.
- Responsive scouting room, player-name suggestions, accessible keyboard search, clear control, announcements, and cancellation of stale requests.
- Valuation layout with seasonal context, honest zero/missing statistics, model limitations, loading, error/retry, and clear-result states.
- The three existing API routes and trained model remain in place. The server adds the MIME types needed for local JPEG and WOFF2 assets.

## Verification

```powershell
npm run build
npm test
```

Tests exercise search cancellation and response races, keyboard selection, zero versus missing values, error/retry behavior, HTML escaping, suggested searches, and the actual compiled React component against the canonical source DOM. Asset-route tests verify the server returns the exact scene bytes and correct media/font MIME types.

Browser visual/GPU QA is **not verified in this execution environment**. The supported in-app browser timed out reaching the local server, including its LAN address. The installed browser's launcher exited before rendering because its crash handler could not start. These are recorded limits; DOM tests do not establish WebGL rendering, frame rate, visual layout, or pointer effects. Check the hero, native liquid-metal controls, butterfly, keyboard navigation, and search at desktop, tablet, and mobile widths in a normal local browser before merging.

Full live model inference is also unverified here: the bundled Python environment does not contain the required joblib, scikit-learn, or XGBoost packages. No model or dependency pins were changed for the UI work.
