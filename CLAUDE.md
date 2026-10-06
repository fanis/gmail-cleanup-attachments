# Gmail Cleanup & Attachment Stripper

## What this is

Single-file client-side web app (index.html) for Gmail cleanup. Uses Gmail API via Google's gapi JS library + Google Identity Services for OAuth. No backend, no build step.

## Architecture

Everything is in `index.html` - HTML, CSS, JS inline. The only external loads are Google's two API scripts (gapi and GIS), loaded dynamically after all functions are defined (important: onload handlers must reference functions that already exist).

### Key API flows

- **Search**: `messages.list` with Gmail query syntax (`larger:10M`, etc.), paginated via `nextPageToken`
- **Preview**: `messages.get` with `format=full` for body/attachment structure, `messages.attachments.get` for attachment data
- **Trash**: `messages.trash` (recoverable 30 days)
- **Strip attachments**: `messages.get` with `format=full` and `format=raw`, validate Gmail's MIME tree against the raw message, strip selected part IDs, `messages.insert` with `internalDateSource=dateHeader` to re-insert the stripped copy with labels/thread/read state, then `messages.trash` the original

### MIME stripping in JavaScript

The MIME parser is hand-written (no library). It:
- Splits headers from body at a blank line and parses complete multipart delimiter lines
- Maps opaque Gmail part IDs to raw parts after checking child counts, MIME types, and identity headers
- Carries explicit sets of selected part IDs through both bulk review and preview; never selects by filename
- Decodes base64/quoted-printable HTML and declared charsets before resolving `cid:` references
- Preserves referenced inline images and replaces selected attachments with UTF-8, base64-encoded text/plain stubs
- Preserves untouched bytes, including preambles, epilogues, and delimiter whitespace
- Stops before Gmail writes on uncertain structure, missing IDs, unsupported selected containers/root attachments, or undecodable HTML

Regression tests: `node --test tests/attachments.test.cjs`. Synthetic browser fixture: `node tests/browser-fixture.cjs`. Both avoid live Gmail and credentials. The parser remains deliberately conservative and does not implement every MIME or HTML syntax variation.

### Auth

- OAuth token cached in localStorage with expiry tracking
- On page load, restores saved token if not expired, auto-connects
- Sign Out revokes token and clears localStorage

## OAuth scope

`gmail.modify` - covers read, trash, insert. Does NOT cover permanent delete (that needs `mail.google.com` full scope).

## Key decisions and learnings

- Gmail API `messages.insert` (not `import`) for re-inserting stripped messages. `import` runs spam filtering which can misclassify your own mail.
- `internalDateSource=dateHeader` is required on insert or the message appears as "just received"
- Gmail deduplicates by Message-ID header. Insert new copy first, then trash original.
- External Google scripts must be loaded AFTER inline JS defines the callback functions. Originally used `<script onload="fn()">` before the inline script - broke because fn wasn't defined yet. Fixed by loading scripts dynamically at end of inline block.
- Blob URLs work better than data URLs for image preview (handles large images)
- PDF preview via data URLs in iframes doesn't work reliably across browsers - removed from previewable types
- `selectedIds` (Set) persists across page navigation but clears on fresh search. `selectedMeta` (Map) tracks size/metadata for cross-page totals.

## Files

- `index.html` - the app (everything)
- `credentials.json` - OAuth client credentials (gitignored)
- `token.json` - cached auth token (gitignored)
- `LICENSE` - MIT
- `README.md` - setup and usage docs
- `screenshot-*.jpg` - README images
