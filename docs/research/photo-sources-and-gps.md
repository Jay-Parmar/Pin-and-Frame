# Getting photos with dates and GPS out of Instagram, Google Photos and phones (verified 2026-11-21)

These facts come from a research agent reading official docs and primary sources, meaning code that parses real exports. Meta and Google publish no schema for their exports, so field names come from parsing code and sample data.

## Bottom line
- **Where coordinates come from:**
  - Google Takeout JSON sidecars.
  - Original files copied off the phone by USB.
  - Instagram's export JSON, for some posts only.
- **No official API returns photo locations:** neither the Instagram API nor the Google Photos Picker API.
- **Phone-browser uploads usually lose GPS,** because of iOS and Android privacy protections.

## 1. Instagram APIs
- **Basic Display API:** this was the API for personal accounts. Meta announced its deprecation on 2024-09-04, and it stopped working on 2024-12-04.
  - The remaining Instagram APIs cover only professional (Business/Creator) accounts.
  - Sources: Meta's changelog (https://developers.facebook.com/docs/instagram-platform/changelog) and community thread (https://developers.secure.facebook.com/community/threads/1089913112732648), plus third-party coverage.
- **IG Media object:** it has no location (official, high confidence: https://developers.facebook.com/docs/instagram-platform/reference/instagram-media).
  - The reference lists `location`, `location_name`, `latitude` and `longitude` as not supported.
  - `location_id` exists only when publishing a post.

## 2. Instagram "Download your information" export (JSON)
- **Path today:** `your_instagram_activity/media/posts_1.json`.
  - Earlier exports used `your_instagram_activity/content/`, and before that `content/`.
  - Images are in `media/posts/YYYYMM/`.
- **Each post has:**
  - `title`: the caption.
  - `creation_timestamp`: when it was posted, in Unix seconds.
  - `media[]`: each item has `uri`, `creation_timestamp`, `title` and `media_metadata`.
- **GPS:**
  - It appears only in an optional block, `media_metadata.photo_metadata.exif_data[].latitude/longitude` (or `video_metadata`).
  - The block sits next to `date_time_original`, `device_id` and `source_type`.
  - Real 2024–25 samples had only `camera_metadata: {has_camera_metadata: false}`. Expect GPS on some posts only.
- **No place names** in the current format. The old export (around 2020, `media.json`) had a `location` string.
- **Image files:**
  - They're recompressed copies with no EXIF at all: no GPS and no capture date.
  - Five sample images were 1440×1440 px.
  - Some files named `.webp` are actually JPEG.
- **Export options:** JSON or HTML, media quality and date range.
- **Not confirmed:** the maximum resolution at "High" quality.
- **Sources** (primary: parsing code and real export data):
  - https://github.com/marcomaroni-github/instagram-to-bluesky (types "as of 2025/02/11", plus sample JSON and images in `transfer/`)
  - https://github.com/tomshafer/instagram-archive-metadata (says the media come "sans metadata")
  - https://gist.github.com/afonsofrancof/6fcc469e9070dae10ff93561c7b35621
  - Path confirmed 2026-11-20: https://github.com/companionintelligence/Companion-Memory/issues/3605
  - Old `location` field: https://github.com/sfomuseum/go-sfomuseum-instagram
  - Meta help page (it didn't load for the agent): https://help.instagram.com/181231772500920

## 3. Google Takeout for Google Photos
- **Files:** they come as stored, with EXIF intact. They're originals only if they were backed up at Original quality.
- **JSON sidecar fields:**
  - `title`: the original filename.
  - `creationTime`: the upload time.
  - `photoTakenTime.timestamp`: when the photo was taken, in Unix seconds, UTC, with no time-zone offset.
  - `geoData` and `geoDataExif`: latitude, longitude, altitude and spans. A value of 0.0 means no location.
  - `geoData` reportedly includes location edits made in Google Photos. Those edits are never written into the file.
- **Quirks:**
  - Sidecars are named `X.jpg.supplemental-metadata.json`.
  - Long names are cut to about 46–47 characters (for example `.supplemental-me.json`).
  - Duplicates: `X(1).jpg` pairs with `X.jpg.supplemental-metadata(1).json`.
  - `-edited` copies (localized, for example `-bearbeitet` or `-modifié`) and Live Photo videos have no JSON of their own; they share the original's.
  - Some items have no JSON at all.
  - A file and its JSON can land in different zip parts.
  - Pair files using the JSON `title`, not the filename.
- **No reports found** of location data going missing in 2025–26 exports.
- **Sources:**
  - Primary parsing code: https://github.com/simulot/immich-go (`adapters/googlePhotos/matchers.go`, `json.go`, `docs/misc/google-takeout.md`) and https://github.com/timelinize/timelinize/blob/main/datasources/googlephotos/takeoutarchive.go
  - Google help: https://support.google.com/photos/answer/6153599

## 4. Google Photos APIs
- **Library API:**
  - Since 2025-03-31 it only reaches items the app itself uploaded. The readonly, sharing and full library scopes return 403.
  - Reading a user's photos now goes through the Picker API (official: https://developers.googleblog.com/en/google-photos-picker-api-launch-and-library-api-updates/).
- **Picker API:**
  - It returns `id`, `createTime` (when the photo was created), `type` and `mediaFile`.
  - `mediaFile` has baseUrl, mimeType, filename, width, height, camera make and model, focal length, aperture, ISO and exposure (fps for video). There's no location.
- **Downloads:** a download with `=d` keeps "all the Exif metadata except the location metadata", so GPS is stripped.
- **Limits:**
  - A baseUrl stays valid for 60 minutes and needs an OAuth bearer header.
  - Each session allows up to 2000 picked items.
  - The picker can't run inside an iframe.
- **Sources** (official):
  - https://developers.google.com/photos/picker/reference/rest/v1/mediaItems
  - https://developers.google.com/photos/picker/guides/media-items
  - https://developers.google.com/photos/picker/reference/rest/v1/sessions

## 5. Phones
- **USB copy (Explorer or Windows Photos):**
  - Copies the original files with GPS and capture date, HEIC included.
  - Users report that the iPhone's "Automatic" JPEG conversion keeps metadata.
  - With iCloud "Optimize Storage" on, originals must download to the phone first (https://support.apple.com/en-us/120267).
- **iCloud.com / iCloud for Windows:** choose "Unmodified Original". Community reports say "Most Compatible" downloads have wrong or missing metadata.
- **Google Photos download:** keeps the phone's original location, but not location edits made in Google Photos (official: https://support.google.com/photos/answer/6153599).
- **Where location gets stripped:**
  - The iOS share sheet, under Options → Location (https://support.apple.com/guide/personal-safety/ips0d7a5df82/web).
  - iOS 16.4+ Safari uploads drop GPS unless location is turned on in the picker's Options (https://bugs.webkit.org/show_bug.cgi?id=257534).
  - Android 10+ hides photo location from apps without `ACCESS_MEDIA_LOCATION`. Browsers don't have it, so browser uploads, sharing, email and Quick Share often lose GPS, while USB keeps it (https://developer.android.com/training/data-storage/shared/media, https://shkspr.mobi/blog/2026/04/android-now-stops-you-sharing-your-location-in-photos/).
  - WhatsApp strips EXIF unless the photo is sent as a document (third-party sources only).
