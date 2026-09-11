// Read-only audit of the target checkout. All writes use a disposable local store.
// Node 22.18+; node reproduce.mjs /absolute/path/to/roundprint-checkout
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const checkout = path.resolve(process.argv[2] || '');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout, encoding: 'utf8' }).trim();
assert.ok(revision.startsWith('9f9f364'), 'Use the audited revision 9f9f364');
const scratch = await mkdtemp(path.join(tmpdir(), 'roundprint-design-audit-'));
const priorDir = process.env.ROUNDPRINT_DATA_DIR;
const priorKey = process.env.ROUNDPRINT_PUBLISH_KEY;
const report = { revision, observations: [] };
try {
  process.env.ROUNDPRINT_DATA_DIR = scratch;
  process.env.ROUNDPRINT_PUBLISH_KEY = 'local-audit-only';
  const storeUrl = pathToFileURL(path.join(checkout, 'lib/server/project-store.ts')).href;
  const store = await import(storeUrl);
  const routeSource = await readFile(path.join(checkout, 'app/api/projects/[slug]/route.ts'), 'utf8');
  const importPath = "'../../../../lib/server/project-store'";
  assert.ok(routeSource.includes(importPath));
  const routeFile = path.join(scratch, 'route.mts');
  await writeFile(routeFile, routeSource.replace(importPath, JSON.stringify(storeUrl)));
  const route = await import(pathToFileURL(routeFile).href);
  const payload = (name) => ({
    version: 1, id: 'audit-project', name, savedAt: '2026-09-11T12:00:00.000Z',
    document: {
      layers: [{ id: 1, name: 'Uploaded image', kind: 'image', src: 'blob:http://localhost/upload-from-another-session', x: 375, y: 599, size: 750, rotation: 0, visible: true }],
      whiteIds: [1], varnishIds: [], material: 'white', topColor: '#181b1c', bottomColor: '#181b1c',
    },
    share: { version: 1, name, createdAt: '2026-09-11T12:00:00.000Z', material: 'white', topColor: '#181b1c', bottomColor: '#181b1c', artwork: 'data:image/png;base64,audit-fixture' },
  });
  const put = (body, key = 'local-audit-only') => route.PUT(new Request('http://localhost/api/projects/audit-project', {
    method: 'PUT', headers: { 'content-type': 'application/json', 'x-publish-key': key }, body: JSON.stringify(body),
  }));
  assert.equal((await put(payload('First'), 'wrong')).status, 401);
  assert.equal((await put(payload('First'))).status, 200);
  assert.equal((await put(payload('Second'))).status, 200);
  const saved = JSON.parse(await store.readProject('audit-project'));
  const files = await readdir(path.join(scratch, 'projects'));
  assert.equal(saved.name, 'Second');
  assert.deepEqual(files.sort(), ['audit-project.json', 'audit-project.meta.json']);
  report.observations.push({ case: 'save-twice', latest: saved.name, storedFiles: files, previousRevisionStored: false });
  assert.equal(saved.document.layers[0].src, payload('Second').document.layers[0].src);
  report.observations.push({ case: 'uploaded-layer-reference', persistedAs: 'blob URL unchanged; no asset persistence in this path' });
  assert.equal((await route.GET(new Request('http://localhost/api/projects/audit-project'))).status, 200);
  report.observations.push({ case: 'unauthenticated-read', result: 'full document is returned despite configured publish key' });
  const invalid = { ...payload('Invalid'), document: { layers: 'not-an-array' }, share: { artwork: 123 } };
  const accepted = await put(invalid);
  assert.equal(accepted.status, 200);
  report.observations.push({ case: 'invalid-document', status: accepted.status, result: 'invalid nested document and share accepted' });
  const concurrent = await Promise.allSettled(Array.from({ length: 6 }, (_, index) => store.writeProject('concurrent', JSON.stringify({ index }), { id: 'concurrent', name: String(index), savedAt: String(index) })));
  const failures = concurrent.filter((item) => item.status === 'rejected').map((item) => String(item.reason));
  report.observations.push({ case: 'concurrent-saves', attempts: concurrent.length, failures: failures.length, errors: failures.map((message) => message.replaceAll(scratch, '<scratch>')) });
  assert.ok(failures.length > 0, 'Concurrency issue did not reproduce in this run');
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (priorDir === undefined) delete process.env.ROUNDPRINT_DATA_DIR; else process.env.ROUNDPRINT_DATA_DIR = priorDir;
  if (priorKey === undefined) delete process.env.ROUNDPRINT_PUBLISH_KEY; else process.env.ROUNDPRINT_PUBLISH_KEY = priorKey;
  await rm(scratch, { recursive: true, force: true });
}
