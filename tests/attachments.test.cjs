const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];

// Execute the actual app script. No Google scripts, credentials or network calls.
function app() {
  const elements = new Map();
  const element = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, contains() { return false; } } });
  const document = {
    addEventListener() {}, head: { appendChild() {} },
    createElement: element,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    querySelectorAll() { return []; },
  };
  const context = vm.createContext({ document, window: { addEventListener() {} }, console: { error() {} },
    atob, btoa, TextDecoder, TextEncoder, Uint8Array, Set, Map, decodeURIComponent });
  vm.runInContext(source, context);
  context.run = code => vm.runInContext(code, context);
  return context;
}

// Independently construct both wire MIME and Gmail's parsed representation.
function leaf(id, filename, body, type = 'application/octet-stream', extra = [], lb = '\r\n') {
  const headers = [{ name: 'Content-Type', value: type }];
  if (filename) headers.push({ name: 'Content-Disposition', value: `attachment; filename="${filename}"` });
  headers.push(...extra.map(([name, value]) => ({ name, value })));
  return {
    raw: headers.map(h => `${h.name}: ${h.value}`).join(lb) + lb + lb + body,
    payload: { partId: id, filename, mimeType: type.split(';')[0], headers,
      body: { size: body.length, attachmentId: 'download-' + id } },
  };
}

function multipart(children, { id = '', boundary = 'outer', lb = '\r\n', preamble = '', epilogue = '' } = {}) {
  const type = `multipart/mixed; boundary="${boundary}"`;
  return {
    raw: `Content-Type: ${type}${lb}${lb}${preamble}` + children.map(c => `--${boundary}${lb}${c.raw}${lb}`).join('') + `--${boundary}--${lb}${epilogue}`,
    payload: { partId: id, filename: '', mimeType: 'multipart/mixed', headers: [{ name: 'Content-Type', value: type }], parts: children.map(c => c.payload) },
  };
}

function strip(a, fixture, ids) {
  return a.stripMimeAttachments(fixture.raw, new Set(ids), fixture.payload);
}

function duplicateFixture() {
  return multipart([
    leaf('body', '', 'Email text', 'text/plain'),
    leaf('opaque-first', 'same.pdf', 'FIRST_ATTACHMENT'),
    leaf('opaque-second', 'same.pdf', 'SECOND_ATTACHMENT'),
  ]);
}

test('selects exactly one of two identically named attachments using opaque Gmail IDs', () => {
  const a = app();
  const fixture = duplicateFixture();
  const output = strip(a, fixture, ['opaque-second']);
  assert.ok(output.includes('FIRST_ATTACHMENT'));
  assert.ok(!output.includes('SECOND_ATTACHMENT'));
  const stub = a.parseMimePart(output).parts[2];
  assert.match(a.decodeMimeText(stub), /Attachment removed: same.pdf/);
});

test('an empty explicit selection leaves every original byte unchanged', () => {
  const a = app();
  const fixture = duplicateFixture();
  assert.equal(strip(a, fixture, []), fixture.raw);
  assert.throws(() => a.stripMimeAttachments(fixture.raw, null, fixture.payload), /Missing attachment selection/);
});

test('collectAttachments retains separate part IDs independently of download IDs', () => {
  const a = app();
  const list = [];
  a.collectAttachments(duplicateFixture().payload, list);
  assert.deepEqual(list.map(att => att.partId), ['opaque-first', 'opaque-second']);
  assert.equal(list[1].attachmentId, 'download-opaque-second');
});

test('selecting all displayed attachments leaves unnamed, unselected parts intact', () => {
  const a = app();
  const fixture = multipart([
    leaf('visible', 'file.pdf', 'REMOVE_VISIBLE'),
    leaf('unnamed', '', 'KEEP_UNNAMED', 'application/octet-stream', [['Content-Disposition', 'attachment']]),
  ]);
  const attachments = [];
  a.collectAttachments(fixture.payload, attachments);
  const output = strip(a, fixture, attachments.map(att => att.partId));
  assert.ok(output.includes('KEEP_UNNAMED'));
  assert.ok(!output.includes('REMOVE_VISIBLE'));
});

for (const encoding of ['7bit', 'base64', 'quoted-printable']) {
  test(`preserves an inline image referenced by ${encoding} HTML, while stripping an unused image`, () => {
    const a = app();
    const html = '<img src="cid:logo%40example">';
    const body = encoding === 'base64' ? Buffer.from(html).toString('base64').replace(/(.{12})/g, '$1\r\n')
      : encoding === 'quoted-printable' ? '<img src=3D"ci=\r\nd:logo%40example">' : html;
    const image = leaf('logo', 'same.png', 'KEEP_IMAGE', 'image/png', [['Content-ID', '<logo@example>']]);
    const fixture = multipart([
      multipart([leaf('html', '', body, 'text/html; charset=UTF-8', [['Content-Transfer-Encoding', encoding]]), image], { id: 'related', boundary: 'inner' }),
      leaf('unused', 'same.png', 'REMOVE_IMAGE', 'image/png'),
    ]);
    const output = strip(a, fixture, ['logo', 'unused']);
    assert.ok(output.includes(image.raw));
    assert.ok(!output.includes('REMOVE_IMAGE'));
    assert.ok(output.includes(body));
  });
}

test('decodes charset, HTML entities, percent escapes and CSS url references', () => {
  const a = app();
  const html = '<img src="c&#105;d&colon;logo%40example"><div style="background:url(cid:css@example)">';
  const encoded = Buffer.from(html, 'utf16le').toString('base64');
  const fixture = multipart([
    leaf('html', '', encoded, 'text/html; charset="utf-16le"', [['Content-Transfer-Encoding', 'base64']]),
    leaf('image', 'logo.png', 'KEEP_LOGO', 'image/png', [['Content-ID', '<logo@example>']]),
    leaf('css', 'css.png', 'KEEP_CSS', 'image/png', [['Content-ID', '<css@example>']]),
  ]);
  assert.equal(strip(a, fixture, ['image', 'css']), fixture.raw);
});

test('preserves quoted content IDs with parentheses and unquoted CSS references', () => {
  const a = app();
  const fixture = multipart([
    leaf('html', '', '<img src="cid:logo(foo)@example"><style>p {background:url(cid:css@example);}</style>', 'text/html'),
    leaf('logo', 'logo.png', 'KEEP_LOGO', 'image/png', [['Content-ID', '<logo(foo)@example>']]),
    leaf('css', 'css.png', 'KEEP_CSS', 'image/png', [['Content-ID', '<css@example>']]),
  ]);
  assert.equal(strip(a, fixture, ['logo', 'css']), fixture.raw);
});

test('preserves preamble, epilogue, CRLF and LF parts, folded headers, and boundary-like text', () => {
  const a = app();
  for (const lb of ['\r\n', '\n']) {
    const keep = leaf('body', '', `prefix --a.b+[] suffix${lb}--a.b+[]-not-a-boundary${lb}last line`, 'text/plain', [], lb);
    const remove = leaf('remove', 'file.txt', 'REMOVE', 'text/plain', [], lb);
    const fixture = multipart([keep, remove], { boundary: 'a.b+[]', lb, preamble: `PREAMBLE${lb}`, epilogue: `EPILOGUE${lb}` });
    fixture.raw = fixture.raw.replace('multipart/mixed; boundary=', `multipart/mixed;${lb}\tboundary=`);
    const output = strip(a, fixture, ['remove']);
    assert.ok(output.includes(keep.raw));
    assert.ok(output.includes(`PREAMBLE${lb}`));
    assert.ok(output.endsWith(`EPILOGUE${lb}`));
    assert.ok(output.startsWith(`Content-Type: multipart/mixed;${lb}\tboundary=`));
  }
});

test('supports quoted boundaries containing spaces and leaves delimiter whitespace unchanged', () => {
  const a = app();
  const fixture = multipart([leaf('file', 'x.txt', 'DELETE')], { boundary: 'a b' });
  fixture.raw = fixture.raw.replace('--a b\r\n', '--a b \t\r\n');
  const output = strip(a, fixture, ['file']);
  assert.ok(output.includes('--a b \t\r\n'));
  assert.ok(!output.includes('DELETE'));
});

test('uses UTF-8 base64 stubs for filenames that Gmail decoded from encoded headers', () => {
  const a = app();
  const fixture = multipart([leaf('file', 'encoded.txt', 'DELETE')]);
  fixture.payload.parts[0].filename = '\u03b1\u03c1\u03c7\u03b5\u03af\u03bf.txt';
  const output = strip(a, fixture, ['file']);
  assert.ok(a.decodeMimeText(a.parseMimePart(output).parts[0]).includes(fixture.payload.parts[0].filename));
  assert.doesNotThrow(() => a.stringToB64Url(output));
});

test('rejects stale IDs, duplicate IDs, header mismatches and structure mismatches', () => {
  const a = app();
  assert.throws(() => strip(a, duplicateFixture(), ['missing']), /Cannot safely match/);
  const duplicate = duplicateFixture();
  duplicate.payload.parts[2].partId = duplicate.payload.parts[1].partId;
  assert.throws(() => strip(a, duplicate, ['opaque-first']), /structures do not match/);
  const headers = duplicateFixture();
  headers.payload.parts[1].headers[0].value = 'image/png';
  assert.throws(() => strip(a, headers, ['opaque-first']), /headers do not match/);
  const tree = duplicateFixture();
  tree.payload.parts.pop();
  assert.throws(() => strip(a, tree, ['opaque-first']), /structures do not match/);
});

test('rejects malformed multipart messages instead of rebuilding a partial message', () => {
  const a = app();
  const fixture = duplicateFixture();
  fixture.raw = fixture.raw.replace('--outer--\r\n', '');
  assert.throws(() => strip(a, fixture, ['opaque-first']), /Incomplete MIME boundaries/);
});

test('refuses selected containers and root attachments instead of dropping message headers', () => {
  const a = app();
  const root = leaf('', 'root.pdf', 'KEEP_ROOT');
  assert.throws(() => strip(a, root, ['']), /Cannot safely match/);
  const container = multipart([leaf('nested', 'file.pdf', 'KEEP')], { id: 'container', boundary: 'inner' });
  container.payload.filename = 'container.mime';
  assert.throws(() => strip(a, multipart([container]), ['container']), /Cannot safely match/);
});

for (const [encoding, body, charset] of [
  ['base64', '!!!', 'UTF-8'], ['quoted-printable', 'src=XY', 'UTF-8'],
  ['x-unknown', 'HTML', 'UTF-8'], ['7bit', 'HTML', 'invalid-charset'],
  ['7bit', '<img src="cid:x&unknown;">', 'UTF-8'],
]) {
  test(`rejects undecodable or ambiguous HTML (${encoding}, ${body}, ${charset})`, () => {
    const a = app();
    const fixture = multipart([
      leaf('html', '', body, `text/html; charset=${charset}`, [['Content-Transfer-Encoding', encoding]]),
      leaf('image', 'x.png', 'KEEP', 'image/png', [['Content-ID', '<x>']]),
    ]);
    assert.throws(() => strip(a, fixture, ['image']));
  });
}

function mockGmail(a, fixture, { failInsert = false } = {}) {
  const calls = [];
  a.gapi = { client: { gmail: { users: { messages: {
    async get(args) {
      calls.push(['get', args]);
      return { result: args.format === 'raw' ? { raw: Buffer.from(fixture.raw, 'latin1').toString('base64url') }
        : { payload: fixture.payload, labelIds: ['INBOX', 'UNREAD'], threadId: 'thread' } };
    },
    async insert(args) { calls.push(['insert', args]); if (failInsert) throw new Error('insert failed'); return { result: { id: 'new' } }; },
    async trash(args) { calls.push(['trash', args]); return { result: {} }; },
  } } } } };
  return calls;
}

test('inserts the selected replacement before trashing, preserving labels and thread', async () => {
  const a = app();
  const calls = mockGmail(a, duplicateFixture());
  await a.stripOneMessage('message', new Set(['opaque-second']));
  assert.deepEqual(calls.map(c => c[0]), ['get', 'get', 'insert', 'trash']);
  const inserted = calls[2][1];
  assert.equal(inserted.internalDateSource, 'dateHeader');
  assert.deepEqual(inserted.resource.labelIds, ['INBOX', 'UNREAD']);
  assert.equal(inserted.resource.threadId, 'thread');
  const raw = Buffer.from(inserted.resource.raw, 'base64url').toString('latin1');
  assert.ok(raw.includes('FIRST_ATTACHMENT'));
  assert.ok(!raw.includes('SECOND_ATTACHMENT'));
});

test('makes no writes on parser failure or a no-op, and does not trash when insert fails', async () => {
  const a = app();
  let calls = mockGmail(a, duplicateFixture());
  await assert.rejects(a.stripOneMessage('message', new Set(['missing'])));
  assert.ok(calls.every(c => c[0] === 'get'));
  calls = mockGmail(a, duplicateFixture());
  assert.equal(await a.stripOneMessage('message', new Set()), 0);
  assert.ok(calls.every(c => c[0] === 'get'));
  calls = mockGmail(a, duplicateFixture(), { failInsert: true });
  await assert.rejects(a.stripOneMessage('message', new Set(['opaque-first'])), /insert failed/);
  assert.ok(!calls.some(c => c[0] === 'trash'));
});

function stubView(a) {
  a.run(`renderTable = updateStatus = updateSessionStats = showProgress = hideProgress = closeStripModal = closePreview = renderStripModal = () => {};
    toast = () => {};`);
}

test('bulk review and execution carry exact IDs through partial and all-checked selections', async () => {
  const a = app();
  mockGmail(a, duplicateFixture());
  stubView(a);
  a.run("selectedIds = new Set(['message']);");
  await a.confirmStrip();
  assert.equal(a.run('stripReviewData[0].attachments[1].partId'), 'opaque-second');
  const selections = [];
  a.stripOneMessage = async (id, ids) => { selections.push([...ids]); return 1; };
  a.toggleStripAtt(0, 0, false);
  await a.executeSelectiveStrip();
  a.toggleStripAtt(0, 0, true);
  await a.executeSelectiveStrip();
  assert.deepEqual(selections, [['opaque-second'], ['opaque-first', 'opaque-second']]);
});

test('preview checkbox selection targets the second duplicate attachment', async () => {
  const a = app();
  stubView(a);
  a.fixture = duplicateFixture();
  a.run("collectAttachments(fixture.payload, previewAttachments); currentPreviewMsgId = 'message';");
  a.document.querySelectorAll = () => [{ dataset: { attIdx: '1' } }];
  let selected;
  a.stripOneMessage = async (id, ids) => { selected = [...ids]; return 1; };
  await a.stripFromPreview();
  assert.deepEqual(selected, ['opaque-second']);
});

test('failed bulk strips remain visible and selected for review', async () => {
  const a = app();
  stubView(a);
  a.run(`messages = [{id: 'failed'}, {id: 'success'}]; selectedIds = new Set(['failed', 'success']);
    stripReviewData = messages.map(m => ({msgId: m.id, attachments: [{partId: 'file', checked: true}]}));`);
  a.stripOneMessage = async id => { if (id === 'failed') throw new Error('unsafe MIME'); return 1; };
  await a.executeSelectiveStrip();
  assert.deepEqual(Array.from(a.run('messages'), m => m.id), ['failed']);
  assert.deepEqual([...a.run('selectedIds')], ['failed']);
});
