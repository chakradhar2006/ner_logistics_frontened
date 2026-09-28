# NER Logistics — Frontend

A React + Vite recreation of the NER Logistics reference prototype. The visual
design (colors, typography, cards, buttons, spacing, radii) and the page
markup were extracted directly from the reference HTML file and reassembled
into reusable, routed React components, so the app looks and behaves like
the reference at both desktop and mobile breakpoints.

## Run it

```bash
npm install
npm run dev
```

Then open the printed local URL (defaults to http://localhost:5173).

To produce a production build:

```bash
npm run build
npm run preview
```

## Structure

```
src/
  components/     Sidebar, Topbar, MoreMenu (mobile hamburger sheet), PageShell
  fragments/       Raw HTML fragments extracted from the reference (imported with ?raw)
  legacy/          Ported vanilla-JS behavior (navigation, uploads, chat, weather, profile)
  pages/           One component per route (Login, Register, Dashboard, Roads, ...)
  styles/          variables.css, global.css, components.css (from the reference),
                    overrides.css (adapts the "device mockup" CSS to a real responsive app)
  App.jsx           Routes
  main.jsx          Entry point
```

## Notes

- Every page is responsive: the same component renders a desktop sidebar
  layout and a mobile full-screen layout, switching purely via CSS at the
  900px breakpoint (see `styles/overrides.css`). Nothing is duplicated as
  separate routes.
- The mobile hamburger ("More") menu is a real overlay component with the
  same white-card styling as the rest of the app, and lists every page.
- Live weather uses the free Open-Meteo API (no key required) and falls back
  to a fixed location if geolocation is denied.
- Desktop versions of Alerts, Deliveries, and Reports were not present in the
  reference (only mobile) — they were built to match the same panel/table/
  card design tokens used everywhere else, so navigation from the sidebar
  always lands somewhere real.
