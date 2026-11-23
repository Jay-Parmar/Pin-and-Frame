# Pin & Frame implementation plan

Build the local Windows app as a stack of six feature pull requests. Each branch starts from the previous branch. Run app checks against synthetic data before opening the stack.

| Branch | Work | Verification |
| --- | --- | --- |
| `feat/local-app` | Set up Django 5.2 LTS, DRF, PostgreSQL settings, React, TypeScript, and Vite. Add a locally created owner and same-origin session login. Document setup on Windows. | Django checks, frontend type check and build, owner login with CSRF. |
| `feat/travel-catalog` | Add trips, places, visits, and the photo catalog. Keep visit order on the trip and expose map summaries and paginated place photos. Add protected thumbnail and display routes. | Apply the migrations on PostgreSQL. Check repeat visits, ordering, filters, pagination, and anonymous image access. |
| `feat/photo-import` | Import device folders, extracted Takeout, and Instagram posts folders or ZIPs. Decode actual image bytes, preserve source observations, create stripped WebP derivatives, and reuse exact duplicates. Record per-item errors and skip unsupported video entries. | Use synthetic EXIF, HEIC, Takeout, and Instagram fixtures. Rerun a failed batch and confirm that only complete photo copies are available. |
| `feat/import-review` | Create trips and visits in the UI. Show import runs and place suggestions. Approve, defer, or ignore photos and change visit assignments or dates. | Verify batch approval, same-photo review on rerun, and unchanged approved assignments on reimport. |
| `feat/travel-viewer` | Connect the map, timeline, and responsive galleries. Use the selected trip, place, and visit to filter views. Support keyboard photo navigation and a list when the map is unavailable. | Run the frontend build and browse a sample trip through the API in a local browser. Check keyboard and map fallback behavior. |
| `feat/local-acceptance` | Document the complete workflow, run a sample trip, and check database and media restore. Keep real source files and derivatives outside the repository. | Run backend tests on PostgreSQL and check the application using synthetic data. Smoke-test the Instagram ZIP privately in a separate catalog. |

## Integration points

- Owner sessions and CSRF are shared by the frontend and photo routes. Vite proxies `/api` to Django. Use the same loopback host in both servers.
- Keep user data in PostgreSQL and in a configurable media directory. Use UUIDs in browser URLs and relative keys for media storage. Keep originals in the owner's backup.
- `GET /api/v1/trips/` lists trips. Trip detail includes ordered visits with nested places. The map endpoint is `/api/v1/places/map/`. The paginated gallery at `/api/v1/places/{id}/photos/` accepts an optional visit filter.
- Use `manage.py import_photos --source device|takeout|instagram --trip TRIP_ID PATH` from the backend. Optional `--from-date` and `--to-date` arguments select inputs by date. Instagram import reads posts manifests and referenced photos, including when a filename extension differs from the bytes.
- Import run and item lists are under `/api/v1/imports/`. The review endpoint accepts photo IDs, the intended state, and a visit for approval. Existing corrected dates and assignments are preserved by repeat imports.

Keep each commit to one change with a one-line message. Open all pull requests with their parent as base and leave them open for review.
