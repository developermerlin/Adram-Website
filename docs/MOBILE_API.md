# ADRAM API for the mobile apps

For the developers building the Android and iOS apps. The apps use the same API as the website, under
`https://<backend>/api/v1/`. Everything below is live and covered by tests (`backend/lms/tests_mobile.py`).

## 1. Starting up

`GET /lms/app/config/` (no sign-in) tells the app:

```json
{
  "api_version": "v1",
  "min_app_version": "1.2.0",
  "features": {"premium": true, "instalments": true, "referrals": true, "affiliates": true, "push": true, "offline": true},
  "offline": {"days": 30, "devices": 3},
  "currency": "NLe",
  "site": "https://adram…"
}
```

If the app's version is older than `min_app_version`, show "Please update". `min_app_version` is null when any version is allowed.
Hide the parts of the app whose feature is `false`. Admins change all of these under Orders & coupons → Settings.

## 2. Signing in

- `POST /auth/login/` with email and password. It returns tokens, or a challenge when a code or authenticator is needed.
- `POST /auth/otp/verify/` completes the challenge.
- Send `Authorization: Bearer <access>` on every request.
- Refresh with `POST /auth/token/refresh/`.
- Each sign-in is a device. When the person signs it out from Profile → Devices, its tokens stop working at once (`401`, code `session_revoked`).

## 3. Push notifications

After sign-in, register the phone's push token:

```
POST /lms/me/devices/   {"token": "ExponentPushToken[…]", "kind": "expo", "platform": "android", "app_version": "1.2.0"}
DELETE /lms/me/devices/ {"token": "…"}          # on sign-out
```

- Every notification the person gets on the website is also pushed.
- Each push has `data.link`, a website path such as `/learn/web/lesson/12` or `/orders/5`. Open the matching screen.
- Tokens that Expo reports as no longer registered are forgotten automatically.
- `kind: "fcm"` tokens are stored, but are only sent once Firebase credentials are configured on the server. Expo needs no keys, so build with Expo push tokens.

## 4. Saving bandwidth (ETag)

- Every `GET` response has an `ETag` header.
- Send it back as `If-None-Match` next time. If nothing changed, the answer is `304 Not Modified` with no body: keep what you have.
- Use this for the course list, My learning, notifications and the course outline.
- Long lists are already capped (e.g. 100–300 rows). The catalogue (`/lms/catalog/`) is paged with `?page=&page_size=`.

## 5. Offline lessons

Uploaded videos, documents and lesson files can be kept on the phone. YouTube and Vimeo lessons can't: they answer `400` with code `not_saveable`.

```
POST /lms/lessons/<id>/offline/       {"device_id": "<stable id of this phone>"}
→ 201 {"id": 7, "lesson": {...}, "expires_at": "...", "files": [{"kind": "video", "name": "...", "url": "/api/v1/lms/media/..."}]}
```

- Download each `url` within 6 hours (the links are signed) and store the files encrypted inside the app.
- Keep the lesson playable offline until `expires_at`. After that, the app must check in before playing it again.
- A student can keep saved lessons on `offline.devices` phones. Saving from one more phone answers `400`, code `device_limit`, with the list of devices.
- Check in whenever the app comes online, at least every few days:

```
POST /lms/me/offline/check-in/   {"device_id": "..."}
→ {"keep": [... renewed licences with new expires_at ...], "remove_lessons": [12, 40]}
```

  Delete the lessons listed in `remove_lessons` right away. This happens when the student lost access through a refund, the end of Premium, or an overdue instalment.
- `GET /lms/me/offline/?device_id=` lists what this phone may keep.
- `DELETE /lms/me/offline/<id>/` is for when the student removes a download.

## 6. Learning progress

Progress is shared with the website, so the student continues where they stopped on either.

- `POST /lms/lessons/<id>/progress/` with `{position, spent, completed}`.
- Played offline? Send the saved progress when back online.

## 7. Paying

Payments are manual (Orange Money, Afrimoney or a card link). Open the website's order page (`/orders/<id>`) in an in-app browser, or build the same flow:
- `GET /lms/orders/<id>/` returns `how_to_pay`.
- `POST /lms/orders/<id>/payment/` sends the proof (multipart: `method`, `transaction_id`, `payer`, `receipt`).
