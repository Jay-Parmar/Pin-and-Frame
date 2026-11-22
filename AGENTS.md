# Pin & Frame: agent instructions

## The project

Pin & Frame is a personal travel journal with a map, a trip timeline, and photos grouped by place. The local Windows app uses Django REST Framework, PostgreSQL, React, and TypeScript. It imports photos from phone folders, Google Takeout, and Instagram exports. The owner confirms photo assignments before they appear in the archive.

## Where to start

- Read [the design](docs/specs/2026-11-22-travelmap-design.md) and [implementation plan](docs/plans/2026-11-23-pin-and-frame-implementation.md) for the app boundaries and PR stack.
- Use [the Windows guide](docs/local-development.md) for setup, imports, tests, and recovery.
- The original [handoff](docs/handoff/2026-11-22-handoff.md) records the early options. Deployment is deferred. Recheck current free-tier limits before designing it. The deployment goal is $0 per month with no idle expiration or reset.

## Working preferences

- Keep originals, private catalog data, media, secrets, and backups outside Git. Use synthetic fixtures for tests and demos.
- Use straightforward code and short docstrings. Avoid em dashes. Commit small changes with one-line messages and omit co-author trailers.
- Stack dependent pull requests against their parent branches so they can be reviewed and merged in order.
