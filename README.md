# Campus Connect — NWU

A campus-only social PWA for NWU students: welcome/landing screen, full
auth flow (signup with email OTP verification + login + forgot/reset
password), a post-signup welcome moment and first-time coach-mark tour,
the core app shell (home feed, create-post, likes/comments, notifications,
student search, profile — own and read-only view of other students), and
a settings screen — all running on a real Supabase backend (Auth,
Postgres + RLS, Storage), installable as a PWA. No build step — plain
HTML/CSS/JS, Supabase JS loads from CDN in the browser.

## Run it locally

Any static file server works (browsers block PWA/service-worker features on
`file://`). From this folder:

```
npx serve .
```
or
```
python3 -m http.server 8080
```

Then open the printed `localhost` URL. On mobile, your browser's menu will
show an "Install app" / "Add to Home Screen" option once served over
`https` or `localhost`.

## Wire up Supabase

This is now actually wired up — not a placeholder. Here's what to do to get
a working, testable copy running end to end:

**1. Reuse the survey site's existing Supabase project** — the free tier
caps you at 2 active projects, so rather than juggling that, this app's
tables live in the same project as the survey. Nothing here collides with
what's already there: the survey uses `survey_responses` and
`list_suggestions`; this app adds `profiles`, `posts`, `comments`,
`likes`, and `notifications` — different names, same project, no
conflicts. (If you ever do want them fully separate later — e.g. once
you're ready to put the survey away for good — pause or delete the survey
project first, or upgrade to Pro, then move this to its own project.)

**2. Run the schema.** Open that project's SQL Editor → New query → paste
in the entire contents of `supabase-schema.sql` from this folder → Run.
This creates every table this app needs (`profiles`, `posts`, `comments`,
`likes`, `notifications`), locks them down with row-level security so
people can only edit their own stuff, creates the `get_email_for_username`
lookup function login needs, and sets up the two Storage buckets
(`avatars`, `post-media`) with their own policies.

**3. Fix the signup email template — this step is easy to miss and the
6-digit code screen won't work without it.** By default, Supabase emails
people a clickable *link* to confirm signup, not a *code*. This app's
signup Step 2 has 6 individual digit boxes, so it needs an actual code:
go to **Authentication → Email Templates → Confirm signup**, and make
sure the template includes `{{ .Token }}` (the 6-digit code) rather than
only `{{ .ConfirmationURL }}`. Supabase's docs have the exact template
snippet if the default doesn't already show it.

**4. Fill in `supabase-config.js`** with that same project's URL and anon
key (Settings → API in the Supabase dashboard) — the exact same values
already sitting in the survey site's config.

**5. Open the app and test the whole loop**: create an account → check
your email for the code → enter it → fill in your profile → you should
land in the feed. Then try posting, liking, commenting, viewing another
account's profile, logging out, and logging back in with your email +
password.

**What's real now vs. still a placeholder:**
- ✅ Signup, email verification, login, logout, forgot/reset password
  (the emailed link now lands on a real "choose a new password" screen),
  posting (with photos/video), liking, commenting, notifications,
  viewing/editing profiles — all hit the real database.
- ⚠️ Settings → Change password / Delete account are still just toasts
  saying "not built yet" — untouched, same as before.

If something doesn't work when you test it, the browser's console (or
SPCK's equivalent) will show the actual Supabase error — copy that back
to me rather than just "it broke," and I can tell you exactly what's wrong
far faster.

## Project structure

The CSS and JS used to be single ~1,100-line files, which made it hard to
find anything. They're now split by what they actually do — each file
covers one part of the app, in the same order they used to appear in the
original file (so nothing about how the app behaves changed, only how it's
organized). `index.html` loads all of them, in order, via multiple
`<link>`/`<script>` tags.

**CSS** (`css/`), loaded in this order:
| File | What's in it |
|---|---|
| `base.css` | Color variables, reset, base typography, ambient background, auth screen's desktop split-panel frame |
| `app-shell.css` | The logged-in app layout — bottom tab bar on mobile, 3-column layout on desktop |
| `forms.css` | Every input: header/back-button row, username field, OTP boxes, buttons, password field, small animations, avatar upload, autocomplete, department-picker modal |
| `loading.css` | Branded loading overlay, skeleton "shimmer" placeholders, avatar circles |
| `feed.css` | Post cards, notifications list |
| `profile-composer.css` | Profile "ID card" header, create-post composer, comments, "install this app" banner |
| `screens.css` | Welcome/landing screen, post-signup welcome, profile top bar, Settings, signup step indicator |

**JavaScript** (`js/`), loaded in this order:
| File | What's in it |
|---|---|
| `data-faculties.js` | The faculty/department list used by the pickers |
| `ui-helpers.js` | Screen navigation, bottom tab bar, toasts, the branded loading overlay, signup step indicator |
| `auth.js` | Signup (all 3 steps), login, forgot password |
| `data.js` | Talks to Supabase: fetches profiles/posts/notifications, caches people so the same person isn't re-fetched on every post, and the name/initials/avatar helpers |
| `feed.js` | Post card rendering, likes, comments popup |
| `notifications.js` | The notifications tab |
| `profile.js` | Viewing profiles (yours and others'), edit-profile |
| `create-post.js` | The "write a post" screen |
| `app-shell.js` | App boot-up after login, Settings, service worker, "install this app" prompt |

**Want to change something?** Find it in the table above, open that one
file — it'll be a few hundred lines at most instead of scrolling through
everything. `Ctrl+F`/`Cmd+F` within that file for a button ID or class name
(visible in the browser's dev tools "Inspect Element") gets you to the
exact spot fast.

## What's built

- 3-step signup: username field (6-16 chars, letters/numbers/underscores,
  live validity checkmark — no verified-student tie, since UG number was
  dropped as the identifier), password (8+ chars, upper/lower/number, live
  animated checklist, show/hide toggle), profile step with a working photo
  upload (click-to-select + live preview), type-ahead faculty search, and an
  animated bottom-sheet modal for department selection
- OTP auto-verifies the instant the 6th digit is entered — no manual
  "Verify" tap
- A custom branded loading overlay (two spinning rings + pulsing dot in the
  NWU palette) between steps and on async actions, instead of a generic
  spinner
- Continue/Finish buttons stay disabled (visibly greyed out) until every
  required field on that screen is valid
- Slide + fade transitions between screens, back-arrow navigation on every
  step (smart on Step 2 — steps back from OTP to email before leaving the
  step entirely)
- Ambient animated background + glass card surface, hover/press
  micro-interactions on buttons, for a more premium feel than the previous
  flat version
- Login (username + password) and forgot-password (username → OTP to
  email on file)
- PWA manifest + service worker (offline app-shell caching, installable)
- **Home feed** — skeleton cards on first load (shimmer, shaped like real
  post cards) that swap to real mock posts after a simulated network delay.
  Post cards show avatar (real photo or initials), name, faculty/level,
  relative timestamp, text, and media (image grid or video). Chronological,
  no algorithmic sorting, per 01.
- **Likes** — tap to toggle, count updates instantly everywhere that post
  is rendered (feed, own profile, other student's profile).
- **Comments** — tap the comment icon to open a bottom-sheet modal, read
  existing comments, add your own; the comment count on the post card
  updates live.
- **Create post** — a dedicated full-screen composer (not a modal buried
  in the feed, per 02), text up to 600 chars, plus media: up to 3 images
  *or* one video. The video picker actually reads file duration and
  rejects anything over 30 seconds before it's attached. Photo/video
  buttons disable each other once one type is picked, per the locked 02
  spec, and new posts land at the top of the feed and on your own profile
  instantly.
- **Notifications** — single list, newest first, unread items visually
  distinct with a dot; an unread-count badge shows on the bell icon in
  both the sidebar and bottom nav. Tapping a notification marks it read,
  jumps to the referenced post in the feed (scrolls + briefly highlights
  it), and opens the comments modal directly if it was a comment
  notification.
- **Profile (own)** — avatar, name, faculty/level, and a grid of your own
  posts, with an empty state + CTA into the composer if you haven't
  posted yet. **Edit profile** is a separate screen (not inline editing),
  reusing the exact same faculty-typeahead + department-modal widget from
  signup step 3 — that widget was refactored into `createFacultyPicker()`
  so both screens share one implementation.
- **Profile (other students)** — tapping a name/avatar anywhere in the
  feed opens a read-only version of that layout (same info, their posts,
  no edit button). A handful of mock students (`MOCK_STUDENTS` in
  `app.js`) exist so this is testable before real accounts do.
- **Welcome / landing screen** — the true entry point now, before signup.
  Headline + short blurb about the app, staggered entrance animation,
  "Join campus life" / "Already have an account? Log in" buttons, and
  Terms/Privacy links.
- **Post-signup welcome** — after finishing signup, a short animated
  "You're in." moment (checkmark draw-in, the student's first name, "Your
  campus just got a little more connected") that auto-advances into the
  feed after ~2.6 seconds — no button needed.
- **Settings screen** — gear icon at the top of Profile. Edit profile
  link, a change-password placeholder, notification toggles (Likes /
  Comments / Campus announcements), a private-profile toggle, Privacy
  Policy / Terms of Use links, app version, Log out (clears the session,
  returns to the welcome screen), and a Delete account placeholder.
- **Progress stepper** — signup steps 1–3 use a numbered node-and-line
  stepper (checkmark for completed steps, pulsing ringed node for the
  current step, greyed node for upcoming ones), matched to a reference
  style you sent, themed in NWU green instead of the reference's blue.
- **Visual redesign pass** — feed, notifications, and profile were
  reworked to stop reading as a generic social-app template: post cards
  and notification rows share a signature shape (one sharp corner, three
  rounded, a thin left accent bar that brightens on hover/unread),
  avatars are a "campus badge" squircle instead of a plain circle, section
  headers carry a small rotated-square accent mark, timestamps use the
  monospace type in small caps for a more structured feel, the bottom nav
  floats as a pill with a softly pulsing create button, cards stagger in
  on load, and liking a post triggers a small stamp-press + particle-burst
  micro-interaction instead of a plain scale. Empty states (Explore,
  notifications, no-posts-yet) got real icon treatments instead of plain
  text. Settings and the composer were left in the simpler, utility-card
  style on purpose — they're task screens, not social ones.
- **Privacy Policy / Terms of Use screens** — reachable from the welcome
  screen and Settings. Currently placeholder body copy — swap in the real
  text once you send it over (`screen-privacy` / `screen-terms` in
  `index.html`, both single `<div class="legal-body">` blocks — safe to
  replace directly with formatted policy text).
- **Tablet & desktop layouts (≥768px)** — this stopped being "the mobile
  view scaled up" and became a real responsive web app:
  - The phone-shaped floating card is gone at ≥768px; the app fills the
    real viewport like an ordinary website.
  - **Signup & login** split into a persistent two-panel layout: a green
    brand panel (logo, tagline, blurb) on the left, the actual form on
    the right — the standard "designed for desktop" SaaS auth pattern.
  - **The welcome/landing screen** becomes a proper wide hero — bigger
    type, the floating icons spread across the full canvas — instead of
    a narrow centered column.
  - **The logged-in app (≥768px)** keeps the sidebar nav (already
    existed) but now runs a real centered feed column instead of
    stretching edge to edge.
  - **At ≥1200px**, a persistent right rail appears alongside the feed —
    mini profile card, a "Campus pulse" mock stats widget, and quick
    links to Explore/Settings — turning it into a proper 3-column
    dashboard rather than just a wider single column.
  - Task screens (create-post, edit-profile, settings, legal pages) get
    a centered, readable max-width column at wider sizes instead of
    stretching full width.
  - Mobile (<768px) is untouched — verified with a regression pass.
- **Desktop layout fix + redesign (round 2)** — the split-panel auth
  layout had a CSS specificity bug: the desktop override for
  `.screen-auth` was losing to an earlier-defined base rule with equal
  specificity, so login/signup silently fell back to stacked mobile
  spacing while still partially rendering side-by-side — the cut-off,
  scrolling, oddly-spaced look from the bug report. Fixed by scoping the
  override to `#app .screen-auth` so it reliably wins. The feed layout
  was also reworked to stop looking like a generic sidebar+feed+rail
  dashboard: at ≥1200px, `#feed-posts` now renders as a staggered
  2-column editorial masonry grid (CSS columns, `break-inside: avoid`)
  instead of one long list — profile/other-student post lists stay
  single-column on purpose, since that's a personal history, not a
  discovery feed. The sidebar also got a thin tri-color gradient top
  accent and a bolder wordmark for more of a masthead feel instead of a
  plain dashboard nav.

## Important: clearing the old cached version

If you tested an earlier build, your browser likely has the old files
cached by the service worker and won't show new changes automatically.
Before testing updates going forward:

1. Open DevTools → Application tab → Service Workers → **Unregister**
2. Application tab → Storage → **Clear site data**
3. Hard refresh (Ctrl/Cmd + Shift + R)

Or just test in an Incognito/Private window during development — it never
picks up a stale service worker.

## Not built yet

Student search is real (queries `profiles` directly). Everything else in
the dashboard shell beyond Home/Notifications/Profile is still a UI-only
placeholder screen, not a working feature: Marketplace, Chats,
Communities, Groups, Lost & Found, Help & Support. Also not built: Org/Dept
pages, change-password, delete-account (both are placeholder buttons in
Settings), and a `bio`/private-profile column in the database (the Edit
Profile fields exist but don't persist — see the schema note above).

## Latest round: interrupted-signup recovery + README cleanup

- **Fixed a real bug**: someone who verified their email OTP but closed
  the app before finishing Step 3 (so their Auth account exists but no
  `profiles` row does) used to see **"Wrong email or password"** on their
  next login attempt — misleading, since their credentials were correct.
  Login and session-restore now both detect this specific case and resume
  them straight into Step 3 to finish their profile instead.
- Removed the long-stale "Mock data — replace this in phase 05" section
  and fixed the opening summary — both still described the pre-Supabase,
  `app.js`/`MOCK_STUDENTS` version of this app, well after phase 05 was
  actually finished.
- Fixed a stale "comes with real auth in phase 05" reference on the
  delete-account placeholder.

## Latest round: post-signup dashboard shell

New this round (UI only — most of these are intentional "Coming soon"
placeholders, not full features yet):

- **Nav restructure**: bottom nav is now Home / Marketplace / Notifications
  / Profile. Create moved out of the tab bar into a floating **+** button
  (`#fab-create`) that fades while scrolling — desktop keeps its own inline
  Create button in the sidebar, unchanged.
- **Chats** icon, top-right of Home → `screen-chats` (placeholder).
- **Mobile drawer** (`#drawer-panel`, opened via `#drawer-toggle`): Groups,
  Communities, Lost & Found, Help & Support, App Settings, Log out. Fully
  wired into the back-button history system — Android back closes the
  drawer instead of exiting the app. Desktop doesn't need this; the same
  five links were added to the existing sidebar rail's "Quick links" card
  instead.
- **Five new placeholder screens**: `screen-chats`, `screen-communities`,
  `screen-groups`, `screen-lost-found`, `screen-help` — same "Coming soon"
  empty-state style as the old Explore screen.
- **Edit Profile**: added a Bio field and a Private/Public toggle.
  **UI-only for now** — there's no `bio` or `is_private` column in
  Supabase yet, so Bio only persists for the current session (resets on
  next login) and the toggle doesn't save anywhere. Needs a schema change
  to actually wire up.
- **First-time coach-mark tour** (`js/onboarding.js`): highlights the +
  button, Chats, the drawer/menu, and the Notifications/Marketplace/Profile
  tabs, once, the first time someone lands on the dashboard after signup,
  login, or a restored session. Tracked via `localStorage` (not
  per-account — a new browser/device will see it again). Replayable
  anytime from Settings → "Take the tour again" or Help & Support.

## Latest round: mobile bug fix + PWA install prompt

- **Fixed:** the desktop split-panel's brand half (logo/tagline/blurb) on
  signup/login was rendering on mobile too, stacked above the actual
  form. It's hidden by default now and only switches on at ≥768px.
- **PWA install prompt:** a bottom banner appears once the browser
  reports the app is installable (`beforeinstallprompt`), with an
  Install button that triggers the real native install flow. iOS Safari
  has no such API, so it gets a different banner with manual "Share →
  Add to Home Screen" instructions instead. Neither banner shows if the
  app is already running installed (standalone mode).

## Latest round: login switched from username to email

**Why:** logging in with a username required looking up the matching
email server-side on every attempt — an extra moving part, and a minor
information-leak risk (a lookup function that responds differently for
real vs fake usernames). Login and Forgot Password now take an email +
password directly, same as most apps. Usernames still exist and are
still required at signup, unique, and now genuinely displayed on
profiles — they're just no longer a login credential.

**Two manual steps this needs in the Supabase dashboard — the code
alone doesn't take care of these:**

1. **Run the new SQL.** Open SQL Editor → New query → paste and run
   just this (the full `supabase-schema.sql` also has it now, if you're
   setting up fresh):
   ```sql
   create or replace function username_available(p_username text)
   returns boolean
   language sql
   security definer
   set search_path = public
   as $$
     select not exists (
       select 1 from profiles where lower(username) = lower(p_username)
     );
   $$;

   grant execute on function username_available(text) to anon, authenticated;
   ```
   This is what lets signup Step 1 tell someone "that username is taken"
   immediately, before they've even created an account.

2. **Set your production URL in Supabase's Auth settings** — this is
   the actual fix for the reset-password link landing on
   `localhost refused to connect`. Go to **Authentication → URL
   Configuration** and make sure:
   - **Site URL** is set to `https://campus-connect-224y.vercel.app/`
   - **Redirect URLs** includes that same URL (Supabase rejects
     redirecting to a URL that isn't on this allow-list)

   The code now also refuses to send a reset link pointing at
   `localhost`/`127.0.0.1` on its own — if you test "forgot password"
   from a local dev server, the email link points at the production
   URL above instead, since that's the only address your phone (or
   anyone else) can actually reach.

