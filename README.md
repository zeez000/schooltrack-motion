# SchoolTrack / Motion Concept

A calm, interactive school-day design prototype. The name is provisional. All children, schools, routes, check-ins, and attendance records are fictional.

## See it

Run `npm run dev` with Node.js 22+, then open http://localhost:4173.

Run `npm run build` to generate `dist/`. Open `dist/preview.html` directly for a self-contained preview: no package installation or server is needed for that file.

## This version

Warm ivory, forest green, a restrained glass notification card, an illustrated home-to-school route, sliding role controls, independently recorded journey steps, and a desktop drawer that becomes a mobile bottom sheet.

The parent view has two sample children, Today/Journey/Attendance/Updates screens, a September sample calendar, event details, return-journey simulation, and persistent in-session activity. The teacher view has student search, selection, review and confirmation. The school view has route filtering, assigned-student counts, and a missing-update exception.

Use **Change scenario** to try regular travel, family drop-off, a missing boarding record, or unavailable updates. A later event never automatically confirms an earlier one. Retry never invents a new check-in. Reset restores the demonstration.

## Implementation

Original HTML, CSS and JavaScript, with native Web Animations and CSS transitions. GSAP 3.13.0 is an optional async CDN enhancement for the hosted hero; the whole application remains usable without it. It is not requested by local-file previews or reduced-motion sessions. This version does not install every reference library or reuse their component source.

No runtime framework or package download is required. The earlier React/Vite concept was not used as the production preview because its package installation could not be verified in the execution environment. This dependency-free version was built and interaction-tested instead.

Design references: [SmoothUI](https://smoothui.dev/) for restrained glass, segmented navigation, stepper and drawer ideas; [GSAP](https://gsap.com/) for motion direction; and the user-selected micro-interaction galleries. The illustration, layout, styling and application logic are original implementations, not copied gallery components. Sound, Three.js, React Spring, Anime.js, Lenis and DialKit are not installed in this version.

## Important boundary

This is not a production student-safety service. There is no login, backend, live GPS, real attendance database, verified parent identity, background push messaging, or enforced role access. Role controls are for design review, not security. No location permission is requested and no student data is transmitted. Session data resets on refresh. Hosted pages optionally request GSAP from jsDelivr.

The calendar is an independently labelled fictional historical dataset, not a reflection of the scenario controls. Route graphics are schematics, not geographic maps or child positions.

## Checks

`npm test` runs 8 structural/script checks. `npm run build` creates the static site and portable HTML.

`python tests/browser_test.py` runs the browser interaction suite when Python Playwright and Chromium are installed. The included QA report records 22 passing checks, including independent-event scenarios, teacher confirmation, route filters, focus trapping, Escape/focus restoration, reduced motion, and page overflow at 320, 375, 390, 640, 768, 1024 and 1440 pixels. Local preview bytes were rendered in Chromium because network browser navigation was blocked. Safari, Firefox and the optional hosted GSAP enhancement were not tested.

## GitHub Pages

In repository **Settings > Pages**, choose **GitHub Actions** as the source. The included workflow tests, builds and uploads a Pages artifact on every push to `main`, then deploys when Pages is enabled. Pages administration is a separate permission from pushing source code.

## Files

- `site/`: editable HTML, CSS and JavaScript
- `scripts/`: dependency-free development server and build
- `tests/`: structural and browser checks
- `QA.md`: tested behaviour and remaining boundaries
- `.github/workflows/deploy.yml`: test, build, publish
