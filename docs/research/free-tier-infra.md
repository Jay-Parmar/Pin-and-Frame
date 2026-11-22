# Free-tier infrastructure research (verified 2026-11-21)

These facts come from web searches and from three research agents reading official docs. "Official" means the provider's own docs, pricing, changelog or terms; anything else is marked. Free tiers change often, so re-check exact numbers before relying on them.

## Summary
- **Best fit:** Cloudflare Workers for the site and R2 for the photos. R2 almost certainly needs a payment method, but it costs $0 within the free limits.
- **No-card option:** store the photos as Workers static assets (up to 20,000 files per version).
- **Vercel:** fine for hosting the site, not for photos.
- **Render free and Supabase free:** unsuitable, because they expire, sleep or pause.
- **Firebase Storage:** needs a card and gives only 5 GB free.

## Cloudflare

### R2
- **Free per month** (official, https://developers.cloudflare.com/r2/pricing/):
  - 10 GB-month of Standard storage.
  - 1M Class A operations (writes and lists).
  - 10M Class B operations (reads).
  - Free egress, including through the Workers API, the S3 API and r2.dev.
  - Infrequent Access storage has no free tier.
- **Payment method:** very likely required, though no doc says so outright. Treat it as needing a card.
  - The get-started guide says to "Complete the checkout flow to add an R2 subscription" (https://developers.cloudflare.com/r2/get-started/).
  - The billing policy says to have a valid payment method before enabling subscriptions (https://developers.cloudflare.com/billing/understand/billing-policy/).
  - A September 2025 status notice, seen only through third-party mirrors, told first-time R2 users without a payment method to add one.
  - Some marketing pages say "no credit card required" to start building.
- **Above the free tier** (official, https://developers.cloudflare.com/billing/manage/spend-management/):
  - Usage is billed automatically, not blocked.
  - Spending limits don't cover R2 ("A Workers limit does not include… R2"). Only budget email alerts are available.
  - Standard storage list price is about $0.015/GB-month (not re-verified this session).
- **r2.dev public URLs** (official, https://developers.cloudflare.com/r2/buckets/public-buckets/, https://developers.cloudflare.com/r2/platform/limits/):
  - "rate-limited and should only be used for development purposes."
  - Going beyond hundreds of requests per second returns 429 errors.
  - No caching, WAF or Access.
- **Custom domain for a bucket** (official, https://developers.cloudflare.com/dns/zone-setups/partial-setup/):
  - The domain must be a zone in the same account.
  - Partial (CNAME) setup is Business/Enterprise only, so on the Free plan the domain's nameservers must be on Cloudflare.
- **Serving through a Worker on workers.dev:**
  - Works with no domain, using an R2 binding (https://developers.cloudflare.com/r2/api/workers/workers-api-usage/).
  - Every request that hits the Worker counts toward the Free plan's 100,000 requests/day. Past that, visitors get Error 1027 (official, https://developers.cloudflare.com/workers/platform/limits/).
  - Each read is also a Class B operation.

### Workers static assets and Pages
- **Workers static assets, Free plan** (official, https://developers.cloudflare.com/workers/platform/limits/):
  - 20,000 files per version.
  - 25 MiB per file.
  - No documented total size.
- **Static requests** (official, https://developers.cloudflare.com/workers/platform/pricing/):
  - "Requests to static assets are free and unlimited" and don't count against the request limit.
  - Exceptions: paths routed to the Worker first (`run_worker_first`), and Workers Cache if it's turned on.
- **Bandwidth:** no cap is documented for Workers or Pages (https://developers.cloudflare.com/pages/functions/pricing/). The terms allow temporary limits for "undue burden".
- **Pages, Free plan** (official, https://developers.cloudflare.com/pages/platform/limits/, https://developers.cloudflare.com/changelog/2026-01-23-pages-file-limit-increase/):
  - 20,000 files per site. Paid plans were raised to 100,000 on 2026-01-23.
  - 25 MiB per file.
  - 500 builds/month.
  - 100 projects per account.
- **Pages status:** not deprecated, but Cloudflare steers new projects to Workers static assets. Sources: the official migration guide (https://developers.cloudflare.com/workers/static-assets/migrate-from-pages/) plus third-party blogs.

### Access (Zero Trust Free plan)
- **Plan limits** (official, https://www.cloudflare.com/plans/sase-zero-trust/): up to 50 users, 24-hour log retention.
- **Workers:** Access protects a Worker's workers.dev hostname and previews, with no domain needed (official, https://developers.cloudflare.com/workers/configuration/cloudflare-access/).
- **Pages:** the built-in toggle covers only preview URLs. The production *.pages.dev address needs a documented workaround (https://developers.cloudflare.com/pages/platform/known-issues/).
- **Payment details:** setup asks for them even on the Free plan: "this step is still needed but you will not be charged" (official, https://developers.cloudflare.com/cloudflare-one/setup/).
- **Login methods:**
  - Since 2026-06-18, new accounts default to Cloudflare-account login, which only members of your own account can use (https://developers.cloudflare.com/changelog/post/2026-06-18-cloudflare-idp-default/).
  - You can add a one-time PIN by email (https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/).
  - You can add Google, which works with ordinary Gmail accounts (https://developers.cloudflare.com/cloudflare-one/identity/idp-integration/google/).
  - No doc restricts either method by plan, so Free-plan availability is inferred.

### D1, Images, inactivity, terms
- **D1, Free plan** (official, https://developers.cloudflare.com/d1/platform/pricing/):
  - 5M rows read and 100k rows written per day.
  - 5 GB total, 500 MB per database, 10 databases.
  - Limits reset at 00:00 UTC; queries fail once you hit them.
- **Images, Free plan** (official, https://developers.cloudflare.com/images/pricing/):
  - 5,000 unique transformations per month. Past that, new ones return error 9422, cached ones keep working and nothing is charged.
  - URL-based transformations need a domain (a zone).
  - The Images binding in a Worker counts as unique transformations. Whether it works on workers.dev isn't documented.
- **Inactivity:** no inactivity-deletion policy was found, which isn't a guarantee there isn't one. Related clauses:
  - Free services can be ended at Cloudflare's "sole discretion" (https://www.cloudflare.com/terms/, §2.6).
  - workers.dev and pages.dev subdomains may be renamed with about a week's notice (https://www.cloudflare.com/service-specific-terms-developer-platform/, item 7).
  - On non-payment, data in usage-based services "may be deleted" after 30 days (billing policy).
- **Serving many photos:**
  - The May 2023 terms update allows large files when "hosted by a Cloudflare service like Stream, Images, or R2" (https://blog.cloudflare.com/updated-tos/).
  - The current CDN terms (updated 2026-09-28) require "Paid Services (e.g., the Developer Platform, Images, and Stream)" for video and large files. They may limit the CDN for "a disproportionate percentage of pictures" (https://www.cloudflare.com/service-specific-terms-application-services/).
  - Whether free-tier R2 or Workers counts as "Paid Services" isn't stated. The blog post's intent suggests photos hosted in R2 are fine.

## Vercel (Hobby plan)
- **Live site:** the current production deployment is never deleted, on any plan, even when a team is over the 10 GB Deployment Storage limit. A site that isn't redeployed for months stays online. (Official: https://vercel.com/docs/deployment-retention, updated 2026-09-16.)
- **Retention history:**
  - The 2026-04-27 changelog set 30-day default retention for Hobby. It kept the 10 most recent production deployments plus aliased ones (https://vercel.com/changelog/hobby-projects-now-default-to-30-day-deployment-retention).
  - The 2026-09-16 changelog cut that to the 3 most recent production deployments plus the 3 most recent of any type. It removed protection for preview deployments, and it deletes older unprotected deployments immediately when a team is over 10 GB (https://vercel.com/changelog/hobby-projects-now-retain-fewer-deployments-to-free-up-storage).
  - Deleted deployments' unique URLs return 410.
- **Terms** (official, https://vercel.com/legal/terms, dated 2026-10-19; https://vercel.com/docs/plans/hobby):
  - Hobby is for personal or non-commercial use only (§4).
  - No inactivity pausing is documented. But Vercel may disable or remove Hobby projects "with or without notice" and may terminate accounts inactive for an extended period (§19.1).
- **30-day lockout:** going over a Hobby usage limit locks that feature until 30 days pass. This may be where the "30 days" belief came from.
- **Blob on Hobby, per month** (official, https://vercel.com/docs/vercel-blob/usage-and-pricing):
  - 1 GB stored.
  - 10K simple operations and 2K advanced operations.
  - 10 GB data transfer.
  - Overage isn't charged; Blob is blocked until 30 days pass.
- **Unconfirmed:** community threads from September 2026 report deployment storage not being reclaimed after deployments are deleted.

## Render (free)
- **Free web services** (official, https://render.com/docs/free):
  - Spin down after 15 minutes without inbound traffic. Spin-up "takes about one minute."
  - Local filesystem changes are "lost every time the service redeploys, restarts, or spins down." Free services can't attach disks.
  - 750 free instance hours per workspace per month.
- **Bandwidth** (official, https://render.com/docs/outbound-bandwidth): the Hobby workspace includes 5 GB of outbound bandwidth per month. Without a payment method on file, going over suspends all free services for the rest of the month.
- **Free Postgres** (official, https://render.com/changelog/free-postgresql-instances-now-expire-after-30-days-previously-90, https://render.com/docs/free):
  - Expires 30 days after creation (90 days for databases created before 2024-05-20).
  - A 14-day grace period, then it's deleted with all its data.
  - 1 GB, no backups, one per workspace.
- **Static sites** (official, https://render.com/docs/static-sites, https://render.com/pricing):
  - Free, and the docs mention no expiry. "Deploy websites for free, forever" on the pricing page is marketing wording.
  - They count against the 5 GB bandwidth.

## Firebase and Google
- **Cloud Storage needs Blaze** (official, https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024, updated 2026-11-18; https://firebase.google.com/docs/projects/billing/firebase-pricing-plans):
  - Required since 2026-02-03 (some localized pages say 02-02).
  - Spark projects get 402/403 errors; their data is kept but can't be accessed.
  - Creating a new default bucket has needed Blaze since 2024-10-30. New buckets are named `PROJECT_ID.firebasestorage.app`.
  - Blaze links a Cloud Billing account, which needs a payment method.
- **No-cost use for `*.firebasestorage.app` buckets** (official, https://firebase.google.com/pricing, https://cloud.google.com/storage/pricing, https://cloud.google.com/free/docs/free-cloud-features):
  - 5 GB-months stored.
  - 100 GB/month downloaded.
  - 5K uploads/month and 50K downloads/month.
  - Only for buckets in us-central1, us-west1 and us-east1, counted together per billing account.
  - The per-day figures (1 GB/day, 20K uploads/day, 50K downloads/day) apply only to legacy `*.appspot.com` buckets.
- **The Google account's 15 GB:**
  - It's "shared across Gmail, Google Drive, and Google Photos" and is separate from Firebase/Cloud Storage, which is billed as Google Cloud usage. This is a conclusion from two official sources: https://support.google.com/accounts/answer/9312312 and the Firebase pricing docs.
  - Google now says "up to 15 GB" (wording since about March 2026).
  - Per Engadget (2026-05-14), Google is testing 5 GB for some new accounts in select regions until a phone number is linked.
- **Spark plan, no card** (official, https://firebase.google.com/docs/hosting/usage-quotas-pricing, https://firebase.google.com/docs/firestore/quotas):
  - Hosting: 10 GB storage. Data transfer is "10 GB/month" in the docs but "360 MB/day" on the pricing page. Going over disables the site until next month.
  - Firestore: 1 GiB stored; 50K reads, 20K writes and 20K deletes per day; 10 GiB/month outbound; one free database per project.
  - No Cloud Storage at all.
  - No Firebase inactivity-deletion policy was found. Google may delete Google accounts unused for 2 years (https://support.google.com/accounts/answer/12418290); the effect on projects is unclear.

## Other storage options
- **Supabase free** (official, https://supabase.com/docs/guides/platform/free-project-pausing, https://supabase.com/pricing, https://supabase.com/changelog/27497-paused-free-plan-projects-are-restorable-for-90-days):
  - Pauses a project after a week of low activity (paid plans never pause).
  - Restorable for 90 days (an older docs URL says 1 year).
  - 0.5 GB database per project, 1 GB file storage, 2 active projects.
- **Cloudinary free** (official, https://cloudinary.com/pricing/compare-plans, https://cloudinary.com/documentation/developer_onboarding_faq_credits, https://cloudinary.com/documentation/ts_why_is_my_account_disabled_and_how_can_i_recover_my_disabled_account):
  - 25 credits/month, no card, and "use the free plan for as long as you want."
  - 1 credit = 1,000 transformations, or 1 GB managed storage, or 1 GB bandwidth. Storage counts what you hold now, including derived copies.
  - Max image size 10 MB (25 MP).
  - Over-quota accounts can be disabled; 30 days later, all environments and assets are permanently removed. No inactivity-deletion clause was found.
- **Backblaze B2** (official, https://www.backblaze.com/cloud-storage/pricing, https://www.backblaze.com/docs/cloud-storage-create-and-manage-buckets):
  - First 10 GB free, no card to sign up, then $6.95/TB-month.
  - The first public bucket needs a verified email plus payment history, or a small card payment.
  - Egress is free up to 3x average stored data, then $0.01/GB. It's free with no limit through partner CDNs (Cloudflare, Fastly, bunny.net).
- **GitHub Pages** (official, https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits):
  - 1 GB maximum published site, 100 GB/month soft bandwidth limit.
  - Repos ideally under 1 GB (under 5 GB strongly recommended); files over 100 MiB are blocked.
  - Intended "primarily as a showcase for personal and organizational projects." Significantly excessive bandwidth may be throttled or suspended.
- **Google Drive as an image host:** not supported.
  - Google's October 2023 post told apps relying on Drive download URLs to move to publishing or "Embed item" iframes by 2024-01-02 (https://workspaceupdates.googleblog.com/2023/10/upcoming-changes-to-third-party-cookies-in-google-drive.html).
  - AppSheet help says `uc?export=view` links won't display images (https://support.google.com/appsheet/answer/14453216).
  - `drive.google.com/thumbnail?id=` and `lh3.googleusercontent.com/d/` are undocumented workarounds. Users report low resolution and throttling (December 2024) and "Too Many Requests" errors (November 2025); these are third-party reports.
  - Drive API thumbnail links are "Not intended for direct usage on web applications" (official).
- **Oracle Cloud Always Free** (official, https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm, https://docs.oracle.com/en-us/iaas/Content/GSG/Tasks/signingup_topic-Sign_Up_for_Free_Oracle_Cloud_Promotion.htm):
  - 20 GB of Object Storage across tiers after the trial (10 GB per tier on paid or trial accounts).
  - 50,000 requests and 10 TB of egress per month.
  - A card is required at sign-up, as a verification hold.
  - Idle reclamation applies only to compute. If more than 20 GB is stored when the trial ends, all objects are deleted.
- **ImageKit free** (official, https://imagekit.io/plans/, https://imagekit.io/docs/how-pricing-works, https://imagekit.io/lp/imagekit-forever-free-plan):
  - 20 GB bandwidth/month, 3 GB storage (doesn't reset), 25 MB max image.
  - Two outside storage locations can be connected without counting toward the 3 GB.
  - Going over stops the feature until you upgrade.
  - "No credit card needed," per its free-plan page (medium-high confidence).

## Map tiles
**OpenFreeMap** (the project's own pages: https://openfreemap.org, https://github.com/hyperknot/openfreemap):
- Free vector tiles for MapLibre GL.
- No registration, API keys or cookies, and no stated limits on map views or requests.
- OpenStreetMap attribution is required.
- Provided as-is; it may change or be discontinued. It can be self-hosted from its repo.
- Example style URL: `https://tiles.openfreemap.org/styles/liberty`.
