// Local browser QA with synthetic email and mocked Gmail writes only.
// Run: node tests/browser-fixture.cjs, then open http://127.0.0.1:9124
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

const children = [
  { id: 'html', name: '', type: 'text/html; charset=UTF-8', body: Buffer.from('<p>Synthetic email for attachment selection testing.</p><img src="cid:logo@example" alt="Inline logo">').toString('base64') },
  { id: 'first', name: 'same.pdf', type: 'application/pdf', body: 'FIRST_ATTACHMENT' },
  { id: 'second', name: 'same.pdf', type: 'application/pdf', body: 'SECOND_ATTACHMENT' },
  { id: 'logo', name: 'logo.png', type: 'image/png', body: 'INLINE_IMAGE', cid: '<logo@example>' },
].map(part => ({ ...part, headers: [
  { name: 'Content-Type', value: part.type },
  ...(part.name ? [{ name: 'Content-Disposition', value: `attachment; filename="${part.name}"` }] : [{ name: 'Content-Transfer-Encoding', value: 'base64' }]),
  ...(part.cid ? [{ name: 'Content-ID', value: part.cid }] : []),
] }));
const headers = [
  { name: 'Content-Type', value: 'multipart/mixed; boundary="fixture"' },
  { name: 'From', value: 'Fixture <fixture@example.test>' },
  { name: 'To', value: 'review@example.test' },
  { name: 'Subject', value: 'Duplicate attachment fixture' },
  { name: 'Date', value: 'Tue, 06 Oct 2026 10:00:00 +0000' },
];
const headerText = list => list.map(h => `${h.name}: ${h.value}`).join('\r\n');
const raw = headerText(headers) + '\r\n\r\n' + children.map(p => `--fixture\r\n${headerText(p.headers)}\r\n\r\n${p.body}\r\n`).join('') + '--fixture--\r\n';
const fixture = { id: 'fixture-message', threadId: 'fixture-thread', labelIds: ['INBOX'],
  raw: Buffer.from(raw).toString('base64url'),
  payload: { partId: '', filename: '', mimeType: 'multipart/mixed', headers, parts: children.map(p => ({
    partId: p.id, filename: p.name, mimeType: p.type.split(';')[0], headers: p.headers,
    body: { size: p.body.length, data: p.id === 'html' ? p.body : Buffer.from(p.body).toString('base64url') },
  })) },
};
const setup = `
const fixture = ${JSON.stringify(fixture)};
let insertedFixture = null;
window.gapi = {client: {gmail: {users: {messages: {
  get: async args => ({result: args.format === 'raw' ? {raw: fixture.raw} : fixture}),
  insert: async args => {
    insertedFixture = b64UrlToString(args.resource.raw);
    if (!insertedFixture.includes('FIRST_ATTACHMENT') || insertedFixture.includes('SECOND_ATTACHMENT') || !insertedFixture.includes('INLINE_IMAGE')) {
      throw new Error('Fixture failed: wrong attachment removed or inline image lost');
    }
    return {result: {id: 'fixture-copy'}};
  },
  trash: async () => {
    if (!insertedFixture) throw new Error('Fixture failed: trash before insert');
    document.getElementById('user-info').textContent = 'PASS: second duplicate removed; first duplicate and inline image preserved';
    return {result: {}};
  }
}}}}};
document.getElementById('setup-panel').style.display = 'none';
document.getElementById('app').style.display = 'block';
document.getElementById('user-info').textContent = 'Local fixture: uncheck the first same.pdf, then strip';
messages = [{id: fixture.id, from: 'Fixture <fixture@example.test>', subject: 'Duplicate attachment fixture',
  date: new Date('2026-10-06T10:00:00Z'), dateRaw: '2026-10-06', size: 12000000, labelIds: ['INBOX']}];
renderTable(); updateStatus();
`;
let html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
for (const line of [
  "loadScript('https://apis.google.com/js/api.js', onGapiLoad);",
  "loadScript('https://accounts.google.com/gsi/client', onGisLoad);",
  "window.addEventListener('load', loadCredentials);",
]) {
  assert.ok(html.includes(line));
  html = html.replace(line, '');
}
html = html.replace('</script>', setup + '\n</script>');
http.createServer((req, res) => {
  if (req.url !== '/') { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}).listen(9124, '127.0.0.1', () => console.log('Synthetic browser fixture: http://127.0.0.1:9124'));
