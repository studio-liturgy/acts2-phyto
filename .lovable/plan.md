## Goal

Submit the feedback form directly from the site (no `mailto:`) and append each submission as a row in your Google Sheet `1CyehD4sCN1U6rozbdbQDcSnnmTQESVq2TMK_dwXsGhM`. Add an optional "your email" field so users can include a reply address.

## Changes

### 1. `src/routes/feedback.tsx`
- Add optional **"Your email (optional)"** input above the textarea.
- Replace the `mailto:` submit with a `fetch` POST to a new server route.
- Client-side Zod validation: category required; message 1–5000 chars; email optional but valid + ≤255 chars if provided.
- Submit states: idle / submitting / success / error. On success, show "Thanks — we got your feedback" and reset the form.

### 2. New server route `src/routes/api/public/feedback.ts`
- POST handler under `/api/public/feedback` so it works for unauthenticated visitors and bypasses the site password gate.
- Validates payload server-side with Zod (same rules as client).
- Appends a row to your sheet via the Google Sheets connector gateway:
  - `POST https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/1CyehD4sCN1U6rozbdbQDcSnnmTQESVq2TMK_dwXsGhM/values/Sheet1!A:E:append?valueInputOption=RAW`
  - Headers: `Authorization: Bearer ${LOVABLE_API_KEY}`, `X-Connection-Api-Key: ${GOOGLE_SHEETS_API_KEY}`.
  - Row values: `[timestamp_iso, category, message, reply_email_or_blank, user_agent]`.
- Simple in-memory rate limit (5/min per IP) to discourage spam.
- Returns `{ ok: true }` on success, `400` on validation error, `502` if the Sheets call fails.

### 3. Google Sheets connector setup (one-time)
- Connect Google Sheets via the connector picker so `GOOGLE_SHEETS_API_KEY` becomes available server-side.
- The Google account you connect must have **edit access** to the sheet.
- Recommended sheet header row (row 1, tab named `Sheet1`): `Timestamp | Category | Message | Reply Email | User Agent`. If your tab is named something else, tell me and I'll use that name in the range.

## Notes
- Spreadsheet ID is hardcoded server-side; never trusted from the client.
- The optional user email is stored as a cell value only — never used as a `From` address or sent anywhere else.
- Nothing is sent to the Sheet until the connector is linked; meanwhile the form will return a clean error.

Ready to implement on approval — I'll trigger the Google Sheets connection prompt as the first step.
