# ADRAM LMS: gap analysis and roadmap to a Udemy-level marketplace

*Prepared 1 October 2026 from the current code (backend `lms`, `catalog`, `portal`, `accounts`; frontend React app).*

This document compares the ADRAM LMS with the 17 areas in the brief, lists what already exists, what is partly there and what is missing, and turns the gaps into database, API, frontend and admin work, ordered into three phases.

Status key: **Have** = built and tested · **Partial** = the base exists, the brief asks for more · **Missing** = not built.

---

## 1. Current structure

**Stack.** Django 6 + Django REST Framework + JWT (email code at every sign-in), React 19 + Vite + React Router, SQLite in development (PostgreSQL supported through `DB_ENGINE`). Private files are stored outside the web root and served through signed, time-limited links.

**Backend apps.**

| App | What it holds |
|---|---|
| `accounts` | Users, roles (Student, Instructor, Admin, Super Admin), email codes, activity log, Training/Scholarships sides |
| `catalog` | Courses (marketing fields, prices, badges, approval status), categories, scholarships |
| `lms` | Lessons, progress, quizzes, assignments, certificates, reviews, Q&A, notes, cart, orders, coupons, payouts, notifications, audit log, recommendations, downloads, enrolment decisions |
| `portal` | The scholarship side (applications, documents, services, messages, calls) and the enrolment table |
| `cms` | Admin-editable website content |

**Inside `lms`** the code is already split by concern: `access`, `builder`, `views` (player), `discovery`, `recommend`, `community`, `commerce`, `orders`, `payments` (provider registry), `instructor`, `administration`, `analytics`, `enrolment`, `materials`, `notify`, `audit`.

**Strengths to keep:** clean module boundaries, a payment-provider registry ready for gateways, a pluggable recommender (`LMS_RECOMMENDER` setting), signed media links with access re-checked on every request, an audit trail, around 230 automated tests.

**Structural gaps:** no background job queue, no video processing pipeline, no cache/CDN layer, no search index, no object storage, no monitoring. These limit several features below, so Phase 1 starts with them.

---

## 2. Feature-by-feature status

### 1. Course discovery
| Feature | Status | Notes |
|---|---|---|
| Recommendations (history, wishlist, enrolments, interests) | Have | Rule-based scorer in `lms/recommend.py`, swappable |
| Similar-student behaviour ("students also bought") | Missing | Needs co-enrolment matrix |
| AI recommendations | Missing | Plug into the recommender interface (Phase 3) |
| Personalised home rows | Partial | Catalogue rows + "Recommended for you"; no per-user home layout |
| Sorting: relevance, rating, popular, newest, price low/high | Have | `sort` parameter in catalogue search |
| Autocomplete, keyword suggestions | Have | Added 2 Oct 2026: courses, topics, instructors while typing |
| Typo correction | Have | Added 2 Oct 2026: "Did you mean" + automatic retry (in-app word list; move to PostgreSQL trigram / Meilisearch at scale) |
| Skill/topic browsing | Have | Topic pages /topics/<slug> added 2 Oct 2026 |
| Trending | Have | Added 2 Oct 2026: last 7 days' views + enrolments; row, badge, sort |
| Recently searched, saved filters | Have | Added 2 Oct 2026: recent, popular and saved searches |

### 2. Course cards and preview
| Feature | Status | Notes |
|---|---|---|
| Bestseller, Highest rated, Hot & new, Premium badges | Have | Admin-set |
| Trending badge | Have | Added 2 Oct 2026 |
| Enrolment count, last updated, language, subtitles on card | Have | Added 2 Oct 2026 |
| Hover preview: outcomes, duration, level, updated, buy | Have | |
| Hover preview: trailer autoplay, instructor, review summary | Have | Added 2 Oct 2026 (silent trailer) |

### 3. Video
| Feature | Status | Notes |
|---|---|---|
| YouTube, Vimeo, uploaded video | Have | |
| Signed URLs, access verification, resume, speed, fullscreen | Have | Resume works for all three sources |
| Picture-in-picture, keyboard shortcuts | Partial | Browser defaults only; no custom shortcuts |
| Encoding server, HLS, adaptive bitrate, 360p–1080p | Missing | Needs ffmpeg workers + storage |
| Automatic subtitles, transcripts, transcript search | Missing | Caption *languages* can be listed by admin, but no caption files |

### 4. Student analytics
| Feature | Status | Notes |
|---|---|---|
| Learning hours, lessons/courses completed, quiz average | Have | Training dashboard |
| Streak, goals, daily target, progress graph | **Done** | /student/progress page + dashboard streak card (lms/learning_analytics.py) |
| Assignment performance, skills achieved | Missing | |
| Completion prediction | Missing | |
| Continue learning everywhere | Have | Course page, dashboards, player, any device |

### 5. Quiz engine
| Feature | Status | Notes |
|---|---|---|
| Single choice, multiple answers, true/false, short answer | Have | |
| Fill in the blank, matching | **Done** | lms/questions.py; quiz player + editors |
| Random selection, shuffling (questions and choices), timer, attempts, pass mark, auto-grading, explanations | Have | |
| Question bank, categories, difficulty | **Done** | lms/question_bank.py, QuizRule random draws, CSV import, per-question stats |
| Quiz analytics (per question) | Missing | |

### 6. Assignments
| Feature | Status | Notes |
|---|---|---|
| Text and file submission, grading, feedback, resubmission | Have | |
| Multiple files, deadlines, rubrics | **Done** | lms/assignments.py: due date or days after enrolling, late policy, rubric grading, up to 10 files, /lms/me/deadlines/, send_deadline_reminders command |
| Peer review | Missing | |
| Plagiarism detection | Missing | Needs an external service or in-house similarity check |

### 7. Certificates
| Feature | Status | Notes |
|---|---|---|
| Certificate ID, public verification page, revocation, history | Have | |
| Custom templates | **Done** | lms/certificates.py: 3 layouts, accent colour, wording, per-course or default; certificate keeps its template |
| QR code, LinkedIn "Add to profile" | **Done** | QR points at FRONTEND_URL/certificate/<code> |

### 8. Community
| Feature | Status | Notes |
|---|---|---|
| Course Q&A threads, instructor and student replies, likes | Have | `Thread`, `Reply`, `ReplyLike` |
| Lesson-level questions | Have | Q&A tab in the player |
| Timestamped notes (private) | Have | |
| Pin discussions, mark best answer | **Done** | Thread.is_pinned (staff), Reply.is_accepted (asker), ThreadVote upvotes, sort by votes |
| Public timestamp comments, study groups | **Half** | Questions at a video moment with jump-to links (YouTube, Vimeo, uploads); study groups not done |

### 9. Instructor marketplace
| Feature | Status | Notes |
|---|---|---|
| Public profile: bio, headline, social links, ratings, courses | Have | |
| Profile video, followers | **Done** | Profile.intro_video_url; InstructorFollow, new-course alerts (lms/followers.py) |
| Analytics: views, enrolments, ratings, revenue | Have | |
| Conversion rate, engagement, completion rate | **Done** | Funnel: views → cart → order → paid → enrolled → started → finished, per course (/lms/instructor/funnel/) |

### 10. Instructor payments
| Feature | Status | Notes |
|---|---|---|
| Revenue sharing (platform commission per instructor) | Have | `LmsSettings.commission_percent`, per-order split |
| Earnings dashboard, payment history | Have | Admin records payouts |
| Withdrawal requests, revenue reports (export), tax information | Have | Added 2 Oct 2026: hold period, minimum, admin pay/reject queue, CSV report |

### 11. Marketing
| Feature | Status | Notes |
|---|---|---|
| Coupons (percent/amount, limits, notify students) | Have | |
| Flash sales (time-boxed sale price) | Have | Added 2 Oct 2026: timed sale price per course + flash sale campaigns with countdown |
| Bundles, gifts, referrals, affiliates | **Done** | Bundles + gifts (lms/gifting.py), referrals (lms/referrals.py), affiliates (lms/affiliates.py) |
| Campaigns, email campaigns, segments | **Done** | lms/campaigns.py: audience rules + saved segments, email + in-app, test send, click tracking, unsubscribe |

### 12. Admin analytics
| Feature | Status | Notes |
|---|---|---|
| Users, revenue, sales trend, course and instructor figures | Have | LMS overview + admin dashboard |
| Active users (DAU/MAU), engagement funnel | **Done** | ActiveDay (recorded at sign-in check), DAU/WAU/MAU, stickiness, cohort retention (lms/insights.py) |
| Forecasting, course quality score, fraud detection | **Done** | Revenue forecast with range + renewals, course quality score, fraud flags (/admin/insights) |

### 13. Payments
| Feature | Status | Notes |
|---|---|---|
| Gateway architecture | Have | Provider registry in `lms/payments.py` |
| Orange Money, Afrimoney and card (card-payment link), proof upload + manual check | Have | Added 2 Oct 2026: per-method steps, payer details, duplicate transaction warning, ready-made rejection reasons |
| Refunds | Have | Admin refunds with reason |
| Card/PayPal/Stripe/mobile-money APIs, automatic verification (webhooks) | Missing | |
| Failed-payment recovery, subscriptions, instalments | **Mostly** | Premium plan alongside buying + instalments (lms/premium.py), manual payments; automatic renewals need a gateway |

### 14. Security
| Feature | Status | Notes |
|---|---|---|
| Second step at sign-in | Have | Email code every sign-in |
| Authenticator app (TOTP), recovery codes | Have | Added 2 Oct 2026; also asked after Google sign-in; admins reminded |
| Login history | Partial | Activity log records sign-ins |
| Device/session list, sign out other devices | Have | Added 2 Oct 2026; sign-out takes effect immediately |
| Download protection | Partial | Signed links, per-course download switches |
| DRM, anti-sharing (concurrent session limits, watermark) | Missing | |

### 15. Mobile readiness
| Feature | Status | Notes |
|---|---|---|
| API-first backend | Have | Everything goes through the REST API |
| API versioning, OpenAPI docs | Partial | `/api/v1/`, Swagger available |
| Push notifications, offline downloads, mobile payments | **Done** (payments stay manual) | lms/mobile.py: Expo push from every notification, offline licences + check-in, app config, ETag; guide in docs/MOBILE_API.md |

### 16. AI
All Missing. The recommender interface is the ready hook for AI recommendations.

### 17. Architecture
| Feature | Status | Notes |
|---|---|---|
| API-first, audit trail, logging config | Have | |
| PostgreSQL in production | Partial | Supported, not yet used |
| Background jobs, cache, CDN, object storage, monitoring | Missing | |

---

## 3. Missing modules

New backend modules (inside `lms` unless noted):

1. **`jobs` infrastructure** (project level): task queue for encoding, emails, analytics, AI.
2. **`media_pipeline`**: upload → transcode → HLS renditions → thumbnails → captions.
3. **`search`**: indexing, autocomplete, typo tolerance, search history, saved filters, trending.
4. **`learning_analytics`**: daily activity rollups, streaks, goals, predictions.
5. **`question_bank`**: reusable questions, categories, difficulty, new question types, per-question stats.
6. **`assessment`** (extends assignments): multiple files, deadlines, rubrics, peer review, similarity check.
7. **`certificates`** (extends): templates, QR, LinkedIn links.
8. **`marketing`**: flash sales, bundles, gifts, referrals, affiliates, campaigns, segments.
9. **`payouts`** (extends): withdrawal requests, tax profiles, statements.
10. **`billing`**: gateway adapters, webhooks, payment intents, retries, subscriptions, instalments.
11. **`security`** (in `accounts`): TOTP, recovery codes, sessions/devices, concurrent-stream limits.
12. **`mobile`**: push device tokens, offline licences.
13. **`ai`**: course assistant, instructor assistant, learning-path planner, usage limits.
14. **`ops`**: health checks, metrics, error tracking.

---

## 4. Database schema changes

Fields are indicative; every model also gets `created_at`/`updated_at`. **Bold** = new model.

### Discovery and search
- **SearchQuery**: user (nullable), session key, text, normalized text, results count, clicked course (nullable), created_at. Indexes on (user, created_at) and normalized text.
- **SavedSearch**: user, name, query text, filters (JSON), notify on new matches (bool).
- **CourseScore**: course (1:1), trending_score, quality_score, conversion_rate, completion_rate, refreshed_at. Filled nightly by a job.
- **CoEnrollment**: course_a, course_b, count. Powers "students also bought" (or computed on the fly at small scale).
- `Course`: add `skills` (JSON list), `search_vector` (PostgreSQL full-text, with a trigram index on title for typo tolerance).
- **Topic**: slug, name, description, parent topic. M2M `Course.topics_m2m` (replaces the free-text list over time).

### Video
- **VideoAsset**: lesson (FK), source file, status (uploaded, processing, ready, failed), duration_seconds, error, storage prefix.
- **VideoRendition**: asset, height (360/480/720/1080), bitrate, playlist path, size.
- **CaptionTrack**: asset or lesson, language, label, kind (auto/manual), VTT file, status.
- **TranscriptSegment**: lesson, start_seconds, end_seconds, text. Full-text index for transcript search.
- `Lesson`: add `video_asset` (FK nullable). Keep `video_file` for older lessons until they are migrated.

### Learning analytics
- **LearningDay**: user, date, seconds, lessons_completed, quizzes_passed (unique per user+date). Written from progress heartbeats.
- **LearningGoal**: user, daily_minutes, weekly_days, target_course (nullable), reminder_time.
- **Skill**: name, slug. **CourseSkill**: course, skill, level. **UserSkill**: user, skill, earned_from (course), earned_at.

### Quiz engine
- **QuestionBank**: owner (instructor), course (nullable), title.
- **QuestionCategory**: bank, name.
- `Question`: add `bank` (FK nullable), `category` (FK nullable), `difficulty` (easy/medium/hard), `points`; new kinds `fill_blank` and `matching`, `data` (JSON: blanks with accepted answers; matching pairs).
- **QuizRule**: lesson, bank, category (nullable), difficulty (nullable), count. "Draw 5 hard questions from category X."
- `QuizAttempt`: add per-question breakdown (JSON) for analytics.
- **QuestionStat**: question, attempts, correct, average time (job-maintained).

### Assignments
- `Lesson`: add `due_at`, `late_policy` (accept/penalty%/reject), `allow_multiple_files`, `max_files`.
- **SubmissionFile**: submission, file, filename, size (replaces the single file field over time).
- **Rubric**: lesson, title. **RubricCriterion**: rubric, title, description, max_points, order. **RubricScore**: submission, criterion, points, comment.
- **PeerReviewAssignment**: submission, reviewer (student), due_at, status. **PeerReview**: assignment, scores (JSON), comment, submitted_at.
- **SimilarityReport**: submission, score, matches (JSON), provider, created_at.

### Certificates
- **CertificateTemplate**: name, background image, layout (JSON: positions/fonts for name, course, date, ID, signature, QR), is_default.
- `Course`: add `certificate_template` (FK nullable).
- `Certificate`: add `template` (FK), `pdf_file` (generated once).

### Community
- `Thread`: add `is_pinned`, `is_locked`, `accepted_reply` (FK nullable), `lesson_timestamp` (seconds, nullable), `upvotes` count.
- **ThreadVote**: thread, user (unique). The existing `ReplyLike` already covers replies.
- **StudyGroup** (Phase 2/3): course, name, members (M2M), visibility.

### Instructor marketplace and payouts
- `Profile`: add `intro_video_url`, `follower_count`.
- **Follow**: follower, instructor (unique).
- **TaxProfile**: instructor, legal name, tax ID, country, address, form status.
- **PayoutMethod**: instructor, kind (mobile money/bank), details (encrypted JSON), is_default.
- **WithdrawalRequest**: instructor, amount, method, status (requested, approved, paid, rejected), admin note, payout (FK to existing `Payout` once paid).
- **EarningEntry** (ledger): instructor, order item (nullable), type (sale, refund, payout, adjustment), amount, balance_after, available_on (holding period). The source of truth for balances and reports.

### Marketing
- `Course`: add `sale_starts_at`, `sale_ends_at` (flash sales on the existing sale price).
- **Bundle**: title, slug, price, courses (M2M), is_published.
- **Gift**: order item, sender, recipient email, message, redeem code, redeemed_by, redeemed_at.
- **ReferralCode**: user, code. **Referral**: code, referred user, first order, reward status.
- **Affiliate**: user, commission percent, status. **AffiliateClick**: affiliate, course, ip hash, created_at. `Order`: add `affiliate` (FK nullable), `referral` (FK nullable).
- **Segment**: name, rules (JSON: role, side, enrolled in, inactive for N days, country…).
- **Campaign**: name, segment, channel (email/in-app/push), subject, body, schedule, status, stats (sent, opened, clicked).

### Billing
- **PaymentIntent**: order, provider, provider reference, amount, currency, status, raw response (JSON), expires_at.
- **WebhookEvent**: provider, event id (unique), payload, processed_at. Makes webhooks safe to receive twice.
- **Plan**: name, price, interval (month/year), includes (all premium courses / a bundle).
- **Subscription**: user, plan, status, current_period_end, provider reference, cancel_at.
- **InstallmentPlan**: order, count, schedule (JSON), status.

### Security and mobile
- **TOTPDevice**: user, secret (encrypted), confirmed_at. **RecoveryCode**: user, code hash, used_at.
- **UserSession**: user, refresh token id, device name, user agent, IP, last_seen, revoked_at. Enables "sign out other devices" and limits on simultaneous viewing.
- **PushDevice**: user, platform (android/ios/web), token, last_seen.
- **OfflineLicence**: user, lesson, device, expires_at (mobile offline viewing).

### AI
- **AIConversation**: user, course, lesson (nullable), kind (course assistant, instructor assistant).
- **AIMessage**: conversation, role, content, tokens in/out.
- **AIUsage**: user, date, tokens, cost (for limits and billing).
- **ContentChunk**: course, lesson, text, embedding (pgvector). Lets the assistant answer from the course's own material.

---

## 5. Backend API requirements

All under `/api/v1/`. Existing endpoints keep working.

**Search and discovery**
- `GET lms/search/suggest/?q=` autocomplete (titles, topics, instructors), with corrected spelling.
- `GET lms/search/?q=&sort=&filters…` add `did_you_mean`, skills and topic filters.
- `GET|DELETE lms/me/searches/` recent searches. `GET|POST|DELETE lms/me/saved-searches/`.
- `GET lms/trending/`, `GET lms/topics/`, `GET lms/topics/<slug>/`.
- `GET lms/me/home/` personalised rows (continue, because you viewed X, students also bought, trending in your topics).

**Video**
- `POST lms/manage/lessons/<id>/video/` upload (chunked/resumable for large files), starts transcoding.
- `GET lms/manage/videos/<id>/status/` processing progress.
- `GET lms/lessons/<id>/stream/` returns a signed HLS master playlist URL (short expiry, bound to user).
- `GET lms/lessons/<id>/captions/`, `GET lms/lessons/<id>/transcript/?q=` search inside the transcript.

**Learning analytics**
- `GET lms/me/analytics/?range=` hours per day, streak, quiz/assignment performance, skills, predictions.
- `GET|PUT lms/me/goal/`.

**Quizzes**
- `CRUD lms/manage/banks/`, `/banks/<id>/questions/`, `/banks/<id>/categories/`, `POST /banks/<id>/import/` (CSV).
- `CRUD lms/manage/lessons/<id>/quiz-rules/`.
- `GET lms/manage/lessons/<id>/quiz-stats/` per-question difficulty and discrimination.

**Assignments**
- Submissions accept multiple files. `CRUD lms/manage/lessons/<id>/rubric/`.
- `POST lms/manage/submissions/<id>/grade/` with rubric scores.
- `GET lms/me/peer-reviews/`, `POST lms/peer-reviews/<id>/`.
- `GET lms/manage/submissions/<id>/similarity/`.

**Certificates**
- `CRUD lms/admin/certificate-templates/`, `GET lms/certificates/<code>/pdf/`, `GET lms/certificates/<code>/linkedin/` (prefilled "Add to profile" link). The QR code points to the public verification page.

**Community**
- `POST lms/threads/<id>/vote/`, `POST lms/manage/threads/<id>/pin/`, `POST lms/threads/<id>/accept/<reply_id>/`.
- `GET lms/lessons/<id>/threads/?at=seconds` timestamp comments.

**Instructors**
- `POST|DELETE lms/instructors/<id>/follow/`.
- `GET lms/instructor/analytics/funnel/` views → cart → orders → completions.
- `GET|POST lms/instructor/withdrawals/`, `GET|PUT lms/instructor/tax-profile/`, `CRUD lms/instructor/payout-methods/`.
- `GET lms/instructor/statements/?month=` (CSV/PDF).

**Marketing**
- `CRUD lms/admin/flash-sales/` (or the sale-window fields on courses), `CRUD lms/admin/bundles/`, `GET lms/bundles/<slug>/`.
- `POST shop/gifts/`, `POST shop/gifts/redeem/`.
- `GET lms/me/referral/`, `GET lms/r/<code>` (records the referral, then redirects).
- `CRUD lms/admin/affiliates/`, `GET lms/affiliate/me/`.
- `CRUD lms/admin/segments/` with `GET …/preview/` (count), `CRUD lms/admin/campaigns/` with `POST …/send/`.

**Billing**
- `POST shop/orders/<id>/pay/` creates a payment intent with the chosen provider and returns the redirect or USSD/STK instructions.
- `POST shop/webhooks/<provider>/` verifies the signature, records the `WebhookEvent`, marks the order paid.
- `POST shop/orders/<id>/retry/`, `GET|POST shop/plans/`, `POST shop/subscriptions/`, `POST shop/subscriptions/<id>/cancel/`.

**Security**
- `POST auth/2fa/totp/setup/`, `/confirm/`, `/disable/`, `POST auth/2fa/recovery-codes/`.
- `GET auth/sessions/`, `DELETE auth/sessions/<id>/`, `POST auth/sessions/revoke-others/`.

**Mobile**
- `POST devices/push/`, `DELETE devices/push/<token>/`.
- `POST lms/lessons/<id>/offline-licence/`.
- All list endpoints paginated, with `ETag`/`If-None-Match` for cheap refreshes.

**AI**
- `POST ai/course-assistant/` {course, lesson?, question} answers from the course material, with citations to lessons.
- `POST ai/lessons/<id>/summary/`.
- `POST ai/instructor/outline/`, `/quiz/`, `/assignment/`, `/description/` (drafts the instructor reviews before saving).
- `GET ai/me/learning-path/`.

**Admin analytics**
- `GET lms/admin/analytics/` adds DAU/WAU/MAU, cohort retention, forecast, quality scores.
- `GET lms/admin/fraud/` flags: many failed payments, refund abuse, shared accounts, coupon abuse.

---

## 6. Frontend pages and components

**Students**
- Search bar with autocomplete dropdown (suggestions, recent searches, "Did you mean…").
- Search results: save-this-search button, skill and topic filters.
- Topic pages (`/topics/:slug`), Trending row, personalised home (`/` for signed-in students).
- Course card: Trending badge, enrolment count, language and subtitles line.
- Hover preview: muted trailer, instructor line, rating summary.
- Video player built on hls.js:
  - quality menu (Auto/360/480/720/1080), captions menu
  - keyboard shortcuts (space, ←/→ 5 s, J/L 10 s, F, M, C, < >), picture-in-picture button
  - transcript side panel with search and click-to-seek
- Learning analytics page (`/student/analytics`):
  - hours chart, streak, goal ring
  - quiz and assignment performance, skills, completion forecast
- Goal setting dialog; streak and goal widgets on the Training dashboard.
- Quiz runner: fill-in-the-blank and matching question components.
- Assignment: multiple-file uploader, due date and late notice, rubric view, peer review page.
- Certificate page: QR code, "Add to LinkedIn", download PDF.
- Q&A: vote buttons, pinned threads at the top, accepted answer, timestamp comments on the video timeline.
- Instructor profile: intro video, Follow button, follower count.
- Gift checkout, redeem-a-gift page, bundle page, referral page (`/student/referrals`).
- Subscription plans page and plan management.
- Security settings: authenticator setup, recovery codes, devices and sessions.
- AI assistant drawer in the player ("Ask about this lesson", "Summarise").

**Instructors**
- Video upload with progress and processing status; caption editor.
- Question bank manager (categories, difficulty, CSV import); quiz rules editor; per-question stats.
- Rubric builder; grading view with rubric scores.
- Funnel analytics; withdrawal requests; tax profile; payout methods; monthly statements.
- AI helpers in the course builder (outline, quiz, assignment, description) with "insert" and "discard".

---

## 7. Admin panel changes

- **Analytics:** DAU/WAU/MAU, cohorts, revenue forecast, course quality scores, instructor leaderboard, fraud flags.
- **Marketing:** flash sales calendar, bundles, gift codes, referral and affiliate programmes and payouts, segments, campaigns with send stats.
- **Payments:** gateway settings per provider (keys, live/test), webhook log, failed payments with retry, subscriptions, instalments.
- **Instructor finance:** withdrawal queue (approve → pay → record), tax profiles, ledger and statements.
- **Content:** certificate template designer; video processing queue; caption review.
- **Moderation:** pin/lock threads, similarity reports.
- **Security:** user sessions (force sign-out), 2FA status per user, require 2FA for admins.
- **AI:** turn assistants on/off per course, monthly usage and cost caps.
- **Operations:** job queue health, storage usage, error rates.

---

## 8. Development priority order

Ordered by value to ADRAM and by dependency (later items need earlier ones):

1. **Infrastructure:** PostgreSQL, Redis, background jobs, object storage + CDN, error monitoring. Almost everything below needs it.
2. **Automatic payments:** postponed by decision (2 Oct 2026). Payment stays manual: Orange Money, Afrimoney or card through a card-payment link, with proof checked by an admin. Revisit once a merchant account with an API is available.
3. **Video pipeline:** HLS with adaptive quality, signed playlists, and player upgrades (quality, shortcuts, PiP). This is the core product experience on slower connections.
4. **Search:** autocomplete, typo tolerance, trending, recent and saved searches.
5. **Instructor money:** ledger, withdrawal requests, statements, tax info. Needed before inviting outside instructors.
6. **Security:** authenticator-app 2FA for staff, sessions/devices, concurrent-stream limit.
7. **Learning analytics:** streaks, goals, charts.
8. **Quiz bank and new question types, assignment deadlines/rubrics/multiple files.**
9. **Certificates:** templates, QR, LinkedIn.
10. **Community:** votes, pins, accepted answers, timestamp comments.
11. **Marketing:** flash sales, bundles, gifts, referrals, then affiliates, segments and campaigns.
12. **Subscriptions and instalments.**
13. **Captions and transcripts** (automatic speech-to-text).
14. **Mobile:** push, offline licences.
15. **AI assistants and AI recommendations.**
16. Peer review, plagiarism checks, fraud scoring, forecasting.

---

## 9. Technology stack

Keep what works (Django + DRF, React + Vite) and add:

| Need | Suggested choice | Why |
|---|---|---|
| Database | **PostgreSQL** (with `pg_trgm`, full-text search, later `pgvector`) | Concurrency, search, typo tolerance and AI embeddings without extra services |
| Cache and queue broker | **Redis** | Caching, rate limits, job broker |
| Background jobs | **Celery** + Celery Beat (or Dramatiq) | Transcoding, emails, nightly scores, campaigns |
| Video processing | **ffmpeg** workers producing HLS (CMAF) renditions; **hls.js** in the browser | Adaptive streaming; self-hosted keeps costs predictable. Managed alternative: Mux, Cloudflare Stream or AWS MediaConvert |
| Storage and CDN | S3-compatible object storage (e.g. Cloudflare R2, Backblaze B2, AWS S3) via `django-storages`, behind a CDN (e.g. Cloudflare) with signed URLs | Cheap bandwidth for video, global caching |
| Search | Start with PostgreSQL full-text + trigram; move to **Meilisearch** or OpenSearch past a few thousand courses | Autocomplete and typo tolerance |
| Payments | Provider adapters in the existing registry: a mobile-money aggregator covering Orange Money and Africell Money in Sierra Leone, a card gateway that serves Sierra Leone, PayPal; Stripe only if a supported entity exists | Verify each provider's Sierra Leone coverage and payout terms before building |
| Speech-to-text | Whisper (self-hosted on a GPU worker) or a hosted transcription API | Automatic subtitles and transcripts |
| AI | Claude API, e.g. `claude-sonnet-5-5` for the course and instructor assistants and `claude-haiku-4-5-20251001` for quick summaries and suggestions; embeddings in `pgvector` for answering from course material | Quality answers grounded in each course, with per-user cost limits |
| 2FA | `django-otp` (TOTP + static recovery codes) | Standard authenticator apps |
| Push | Firebase Cloud Messaging (Android and web) + APNs (iOS) | |
| Mobile apps | React Native (Expo) or Flutter, both using the same REST API | Code sharing with the web team (React Native) or strong offline video support (Flutter) |
| Monitoring | Sentry (errors), Prometheus + Grafana or a hosted APM, uptime checks | |
| Deployment | Docker images; Nginx/Caddy; Gunicorn/Uvicorn; separate worker containers | |

**On DRM.** Full DRM (Widevine/FairPlay) needs a licence service and is costly. A practical level for ADRAM: AES-128-encrypted HLS with short-lived keys tied to the signed-in user, a visible moving watermark (name/email), a limit on simultaneous streams per account, and offline viewing only inside the mobile app. Full DRM can be added later through a managed video provider.

**On plagiarism.** Commercial services such as Turnitin need a licence. An in-house first step is comparing submissions within a course (text similarity) and flagging matches for the instructor.

---

## 10. Implementation roadmap

Rough sizes: S ≈ days, M ≈ 1–2 weeks, L ≈ 3+ weeks, for one full-stack developer.

### Phase 1: Essential marketplace (about 8–12 weeks)
1. Infrastructure: PostgreSQL, Redis, Celery, object storage + CDN, Sentry, health checks (M)
2. ~~Payment gateway adapter~~ postponed. Done instead: manual Orange Money / Afrimoney / card payments with clearer steps and checks (2 Oct 2026)
3. Video pipeline: chunked upload, ffmpeg HLS renditions 360–1080p, signed playlists, processing status (L)
4. Player upgrade: hls.js, quality menu, keyboard shortcuts, PiP (S)
5. ~~Search: autocomplete, typo tolerance, trending score + badge, recent and saved searches~~ done 2 Oct 2026 (topic pages still to do)
6. ~~Instructor finance: withdrawal requests, tax details, yearly sales report~~ done 2 Oct 2026
7. ~~Security: TOTP 2FA, recovery codes, sessions/devices list and sign-out~~ done 2 Oct 2026 (admins are reminded; not yet enforced)
8. ~~Flash-sale windows on the existing sale price~~ done 2 Oct 2026, plus flash sale campaigns
9. ~~Card and hover additions~~ done 2 Oct 2026

### Phase 2: Udemy-level features (about 10–14 weeks)
1. Learning analytics: daily activity, streaks, goals, charts, skills, completion forecast (M) **Done**
2. Question bank: categories, difficulty, rules, fill-in-the-blank, matching, CSV import, per-question stats (M) **Done**
3. Assignments: multiple files, deadlines and late policy, rubrics, rubric grading (M) **Done**
4. Certificates: template designer, generated PDF, QR, LinkedIn (M) **Done** (PDF via the browser's print / save as PDF)
5. Community: votes, pinning, accepted answers, timestamp comments on the timeline (S/M) **Done**
6. Instructor marketplace: followers, intro video, funnel and completion analytics (S/M) **Done**
7. Marketing: bundles, gifts, referrals, affiliates, segments, email campaigns (L) **Done**
8. Subscriptions (premium plan) and instalments (M/L) **Done** (manual renewals)
9. Admin analytics: DAU/MAU, cohorts, quality score, fraud flags, revenue forecast (M) **Done**
10. Mobile readiness: push tokens and sending, API pagination/ETag review, offline licence endpoints (M) **Done**

### Phase 3: AI-powered learning platform (about 8–12 weeks)
1. Course content indexing (lessons, transcripts, documents → embeddings) (M)
2. AI course assistant in the player: answers with links to the lessons it used, lesson summaries (M)
3. AI instructor assistant: outlines, quizzes, assignments, descriptions as editable drafts (M)
4. Automatic subtitles and transcripts with search (M)
5. AI learning paths and an AI recommender behind the existing recommender interface (M)
6. Peer review and in-course similarity checks (M)
7. Mobile apps (Android/iOS) on the same API with offline learning (L, separate track)

---

## 11. Decisions needed before building

1. **Hosting budget for video:** self-hosted ffmpeg + object storage, or a managed video service.
2. **Payment providers:** which mobile-money and card providers ADRAM can open merchant accounts with in Sierra Leone.
3. **AI:** monthly budget and whether AI features are for all students or Premium only.
4. **Instructors:** commission rate, holding period before earnings can be withdrawn, minimum withdrawal, tax documents required.
5. **Premium plan:** whether a subscription replaces or sits alongside one-off purchases.
6. **Mobile apps:** React Native or Flutter, and whether they are built in-house.
