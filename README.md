# Gmail Cleanup & Attachment Stripper

Single-file, client-side web app for cleaning up Gmail. Find large emails, preview them, trash what you don't need, strip attachments from emails you want to keep. Everything runs in your browser and no data leaves your machine.

![Selecting emails for attachment stripping](screenshot-select.jpg)

![Result after stripping 31 messages, 364.7 MB saved](screenshot-result.jpg)

## Features

- Search by size with Gmail query filters (`larger:5M`, `has:attachment`, `older_than:1y`, etc.)
- Sortable results by sender, subject, date, or size
- Email preview - click any subject to see the full rendered email with headers and attachment list
- Bulk trash
- Strip attachments - removes attachments while keeping the email body, inline images, labels, threading, and read/unread state. Originals go to Trash (recoverable for 30 days).
- Session stats showing how many emails processed and space freed
- OAuth token cached in localStorage so you don't re-authenticate on every page load

## Setup

You need a Google Cloud project with the Gmail API enabled and OAuth credentials.

1. Go to [Google Cloud Console > APIs & Services](https://console.cloud.google.com/apis/dashboard)
2. Create a project (or use an existing one)
3. Enable the **Gmail API**
4. Go to **Credentials**, create an **OAuth 2.0 Client ID**:
   - Application type: **Web application**
   - Authorized JavaScript origins: `http://localhost:PORT` (pick any port, e.g. `http://localhost:9123`)
5. Create an **API Key** (optionally restrict it to the Gmail API)
6. Go to **OAuth consent screen** > **Audience**, add your Gmail address as a test user (required while the app is in "Testing" mode)

## Usage

The file must be served over HTTP - Google OAuth won't work from a `file://` URL. Pick any port and use it consistently with the JavaScript origin you set up above.

```bash
python -m http.server 9123
# or: npx serve -p 9123
# or: php -S localhost:9123
```

Open `http://localhost:9123` in your browser, enter your Client ID and API Key, click Connect.

### Stripping attachments

Select emails and click **Strip Attachments**. For each email:

1. Downloads the raw MIME message
2. Parses the MIME structure, identifies attachment parts
3. Keeps inline images referenced by the HTML body (`cid:` references)
4. Replaces attachments with a text stub: `[Attachment removed: filename.pdf, ~2.5 MB]`
5. Re-inserts the stripped email with original labels, thread, and read/unread state
6. Moves the original to Trash

## How it works

Single HTML file with inline CSS and JavaScript. Uses [Google Identity Services](https://developers.google.com/identity/gsi/web) for OAuth and [gapi](https://github.com/google/google-api-javascript-client) for Gmail API calls (`messages.list`, `messages.get`, `messages.insert`, `messages.trash`). No other dependencies.

## Privacy

- Credentials stored in `localStorage` only
- API calls go directly from your browser to Google
- No telemetry, analytics, or third-party requests

## License

MIT
