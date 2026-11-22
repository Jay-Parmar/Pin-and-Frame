# TravelMap: agent instructions

## The project
A personal web app for someone who travels a lot. It shows every place they've been on a map, along a timeline, with each place's photos collected together. Photos come from their Instagram posts and their phone's camera roll.

It must cost $0 to run, and nothing may expire, sleep or reset. They want to open it months later and find it still working. They have no storage server, only a Google account (15 GB).

## Current state (2026-11-22)
- No code yet; there are only planning docs.
- The infrastructure was researched on 2026-11-21 and a stack was recommended to the user. Full write-up: `docs/handoff/2026-11-22-handoff.md`.
- **Recommended, not yet confirmed:**
  - Static website on Cloudflare Workers.
  - Web-sized photo copies in Cloudflare R2 (10 GB free).
  - One JSON data file written by an import script.
  - MapLibre map with OpenFreeMap tiles.
  - Cloudflare Access (Google login) to keep the site private.
  - A batch import script that runs on the user's PC.
- **Waiting on the user.** The last message asked how they want to add photos:
  1. After each trip, from their PC (recommended). They copy phone photos over USB or from a Google Takeout download, add their Instagram export, and run one command.
  2. From their phone while traveling. This needs an upload page, a login and a small backend. Phones strip GPS from uploads, so each batch needs its place tapped on a map.
- The same message stated two assumptions for the user to correct:
  - A card on file for Cloudflare is OK. R2 and Access ask for one, and it's $0 within the free limits.
  - The site is private to the user and people they invite.

## How to continue
1. Read `docs/handoff/2026-11-22-handoff.md`, then `docs/handoff/conversation.md` for the user's exact words and the full last answer.
2. If the user hasn't answered the open question, ask it again. Ask one question at a time, and state defaults as proposals they can correct.
3. Some things are still worth learning as the conversation goes; ask about them only when the answer changes the build:
   - Rough photo count.
   - iPhone (HEIC) or Android.
   - Whether videos matter.
   - Who else will view it.
4. When the open points are settled, write a design doc at `docs/specs/YYYY-MM-DD-travelmap-design.md`. Cover:
   - Intent.
   - Goals and non-goals.
   - Constraints.
   - The approaches considered and the one picked.
   - The decided parts.
   - What's left to the builder.

   Get the user's approval of the doc.
5. Then write an implementation plan, then build. Don't write product code, scaffold the project or install dependencies before the design doc is approved.

This follows the superpowers brainstorming → writing-plans workflow the project started with. If those skills are installed for Codex, use them.

## Hard constraints
- $0 per month, and nothing that expires, sleeps or deletes data when idle. That rules out:
  - Render's free web services and free Postgres.
  - Supabase free projects.
  - Firebase Storage without a card.
- Photo GPS survives only in originals copied over USB and in Google Takeout. The Instagram API, the Google Photos Picker API and phone-browser uploads all drop location. Design the import around that. See `docs/research/photo-sources-and-gps.md`.
- Free-tier numbers were verified on 2026-11-21 and change often. Re-check exact numbers before depending on them. See `docs/research/free-tier-infra.md`.

## Working preferences
- Answer in chat, or write Markdown files in this repo and give the path. Don't publish hosted pages.
- Give options with a clear recommendation and the reason. Keep the language plain.
