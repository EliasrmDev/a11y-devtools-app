# a11y DevTools — Landing Page

Landing page for the [a11y DevTools](https://github.com/EliasrmDev/a11y-devtools-ext) Chrome extension — a web accessibility testing tool powered by axe-core.

## About

a11y DevTools is a Chrome extension that scans any webpage for WCAG 2.1/2.2 AA violations and gives you:

- A 0–100 accessibility score with letter grade (A–F)
- Colored DOM overlays highlighting violations by severity
- A full split-view DevTools panel with remediation hints
- Keyboard navigation for a zero-mouse workflow
- JSON export for CI pipelines and audits

## Tech stack

- Vanilla HTML, CSS, and JavaScript (no framework dependencies)
- Manifest V3 · Chrome extension
- [axe-core 4.9](https://github.com/dequelabs/axe-core) engine
- WCAG 2.1 / 2.2 AA rule coverage

## Project structure

```
├── index.html           # Landing page markup
├── styles.css           # Main stylesheet
├── reset.css            # CSS reset
├── main.js              # Landing page interactions
├── favicon.svg          # SVG favicon
├── favicon.ico          # ICO fallback
├── favicon-96x96.png    # PNG favicon
├── apple-touch-icon.png # iOS home screen icon
├── logo.svg             # Logo asset
├── og-image.png         # Open Graph image
├── site.webmanifest     # Web app manifest
└── web-app-manifest-*.png  # PWA icons
```

## Development

No build step required. Open `index.html` directly in a browser or serve with any static file server:

```bash
npx serve .
# or
python -m http.server
```

## Extension

Install the Chrome extension from the [Chrome Web Store](https://chromewebstore.google.com/detail/idikmoknbihljafgbjbbngnfogbnbjkb) or view the source at [EliasrmDev/a11y-devtools-ext](https://github.com/EliasrmDev/a11y-devtools-ext).

## License

MIT — see [LICENSE](./LICENSE) for details.

> This is an independent open-source project. Not affiliated with, endorsed by, or associated with Deque Systems or their products.
