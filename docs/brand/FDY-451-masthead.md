# FDY-451 · BRAND-1g · Faraday masthead on Signal Room

Workstream CC-BRAND-MASTHEAD-1.0 (parent FDY-444). Package source: Faraday-Workbench PR #55
(`packages/faraday-masthead`, v1.0.0).

## What changed
- **Vendored** `packages/faraday-masthead/` → `lib/faraday-masthead/`, all files (VERSION, MANIFEST.json,
  check-drift.mjs, scripts, static, test). Untouched; `node lib/faraday-masthead/check-drift.mjs` →
  "faraday-masthead 1.0.0: vendored copy matches its manifest".
- **Drift check in CI:** `npm run check:masthead` (= the drift script) runs in `.github/workflows/ci.yml`
  before Typecheck.
- **Every route renders the masthead:** `app/layout.tsx` renders `<Masthead appName="Signal Room"
  homeHref="/signal-room">` and the AppBar above `{children}`, so `/signal-room`, the `/` redirect target and
  the 404 page all carry it. `/signal-room`'s `<main>` gets `id="main"` for the skip link.
- **AppBar:** `components/brand/SignalRoomAppBar.tsx` — one link, Feed → `/signal-room`, `aria-current`
  derived from `usePathname()` so it stays right when more routes arrive.
- `tsconfig.json`: `allowImportingTsExtensions: true` (the vendored `Masthead.tsx` imports `../core.ts`;
  `noEmit` was already on). Next 14.2's webpack resolved the `.ts` import with no other change.

## Not changed (DON'T list)
Feed logic, filters, follows, cadence settings, data reads, API routes: untouched. No Supabase call was added
(no `auth.getUser()` in the layout).

## Routes covered
| Route | Masthead | AppBar current |
|---|---|---|
| `/signal-room` | yes | Feed |
| `/` (307 → `/signal-room`) | yes (via target) | Feed |
| 404 | yes (layout) | none |
| Feed builder | **not routed on main** (see below) | — |

## Decisions
1. **The feed builder has no route.** `components/signal-room/SignalRoom.tsx` (Compose / My configurations,
   cadence + delivery pickers) was unmounted in 7a441bf when the live feed replaced it on `/signal-room`.
   Mounting it would add taxonomy/company reads and expose the activate (token-burn) path — both outside this
   issue's DON'T list and a product decision. So the AppBar carries only "Feed". For the screenshot, the builder
   was rendered under the real layout in a **local, uncommitted** route with a two-item fake taxonomy
   (`FDY-451-feed-builder-harness-*.png`), to show the masthead + AppBar sit correctly above it. Its
   Compose/My configurations tabs are page-level controls and stay in the component.
2. **No email / "Sign in" → `/signal-room`.** The app has no sign-in route and no page reads the user (only API
   routes call `auth.getUser()` from shared Supabase cookies). Passing an email would need a new Supabase read in
   the layout. `signInHref` points at the app's own home so it never 404s. Follow-up: Signal Room needs a real
   sign-in/account route; then pass the email.
3. **`loadFonts`** is on: the app references `var(--font-*)` but never defines or loads IBM Plex Serif /
   Bricolage Grotesque / IBM Plex Mono.

## Verification
- `npm run check:masthead` ✅ · `npm run typecheck` ✅ · `npm test` ✅ 56/56 (vitest, same as main) ·
  vendored unit tests `node --experimental-strip-types --test lib/faraday-masthead/test/masthead.test.ts`
  ✅ 16/16 · `npm run build` ✅ (`NEXT_PUBLIC_SIGNAL_ROOM_LIVE=false`, as CI).
- `npm run lint`: **pre-existing, not configured** — `next lint` opens the interactive ESLint setup prompt on main
  too; no ESLint config exists in the repo.
- Playwright (build + start, deviceScaleFactor 1) at 380 and 1440: one `header[role=banner]`, wordmark centre =
  viewport/2 (190 / 720), `scrollWidth` = viewport (no horizontal overflow), AppBar 49 px and fully visible,
  `#main` present. 380 px avatar menu opens with "Signal Room" + "Sign in".
- Feed data is Supabase-backed and blocked from this container, so `/signal-room` shows its own
  "not configured" notice under the masthead. No fixture mode exists in the repo.

## Screenshots
`docs/brand/FDY-451-signal-room-{380,1440}{,-top}.png`, `FDY-451-signal-room-380-menu-open.png`,
`docs/brand/FDY-451-feed-builder-harness-{380,1440}{,-top}.png`.
