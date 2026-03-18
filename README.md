# Gmail Cleanup & Attachment Stripper

A single-file, client-side web app for cleaning up your Gmail. Find large emails, preview them, trash what you don't need, and strip attachments from emails you want to keep.

Everything runs in your browser. No server, no backend, no data leaves your machine.

![Screenshot placeholder](screenshot.png)

## Features

- **Search by size** - find emails larger than a threshold (e.g. `larger:5M`)
- **Gmail search filters** - combine with any Gmail query (`has:attachment`, `older_than:1y`, `from:someone@example.com`, etc.)
- **Sortable results** - sort by sender, subject, date, or size
- **Email preview** - click any subject to see the full email with rendered HTML, headers, and attachment list
- **Bulk trash** - select and trash multiple emails at once
- **Strip attachments** - remove attachments while keeping the email body, inline images, labels, threading, and read/unread state intact. Originals go to Trash (recoverable for 30 days).
- **Session stats** - track how many emails you've processed and how much space you've freed
- **Persistent auth** - OAuth token cached in localStorage so you don't re-authenticate on every page load
- **Dark theme UI**

## Setup (one-time)

You need a Google Cloud project with the Gmail API enabled and OAuth credentials.

1. Go to [Google Cloud Console > APIs & Services](https://console.cloud.google.com/apis/dashboard)
2. Create a new project (or use an existing one)
3. Enable the **Gmail API**
4. Go to **Credentials** and create an **OAuth 2.0 Client ID**:
   - Application type: **Web application**
   - Authorized JavaScript origins: add `http://localhost:9123` (or whatever port you use)
5. Create an **API Key** (optionally restrict it to the Gmail API)
6. Go to **OAuth consent screen** > **Audience** and add your Gmail address as a test user (required while the app is in "Testing" mode)

## Usage

Serve the file over HTTP (Google OAuth requires it - you can't just open the HTML file directly):

```bash
# Python
python -m http.server 9123

# Node
npx serve -p 9123

# PHP
php -S localhost:9123
```

Open `http://localhost:9123` in your browser, enter your Client ID and API Key, and click Connect.

### Searching

- Set the size threshold (default 5 MB) and optionally add extra Gmail search filters
- Press Enter or click Search
- Results show sender, subject, date, size, and labels

### Trashing emails

Select emails with checkboxes (or Select All), then click **Trash Selected**. Emails move to Gmail's Trash and are auto-deleted after 30 days.

### Stripping attachments

Select emails and click **Strip Attachments**. For each email, the tool:

1. Downloads the raw MIME message
2. Parses the MIME structure and identifies attachment parts
3. Keeps inline images referenced by the HTML body (`cid:` references)
4. Replaces removable attachments with a text stub: `[Attachment removed: filename.pdf, ~2.5 MB]`
5. Re-inserts the stripped email with original labels, thread, and read/unread state preserved
6. Moves the original to Trash

### Previewing

Click any email subject to open a slide-out preview panel showing:
- From, To, Subject, Date headers
- Link to view the email in Gmail
- Attachment list with sizes
- Rendered HTML body (or plain text fallback)

## How it works

Single HTML file (~1400 lines) with inline CSS and JavaScript. Uses:
- [Google Identity Services](https://developers.google.com/identity/gsi/web) for OAuth 2.0
- [Google API Client Library (gapi)](https://github.com/google/google-api-javascript-client) for Gmail API calls
- Gmail API endpoints: `messages.list`, `messages.get`, `messages.insert`, `messages.trash`

No external JS dependencies beyond the two Google libraries loaded from CDN.

## Privacy

- Credentials (Client ID, API Key, OAuth token) are stored in `localStorage` only
- All API calls go directly from your browser to Google's servers
- No telemetry, analytics, or third-party requests

## License

MIT
