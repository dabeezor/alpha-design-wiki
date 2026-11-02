// Deploy one design-wiki image tag through Komodo and prove it landed.
// Node 22, no dependencies. API call shapes follow render-review/Jenkinsfile.
//
// Env: KOMODO_API_KEY, KOMODO_API_SECRET, TAG_FILE (tags/<slug>.env), TAG_VAR, TAG,
//      VERIFY_URL (body must equal TAG), REQUIRED_SERVICES (comma list),
//      KOMODO_URL (default http://10.10.10.10:9120), STACK (default design-wiki).
const env = process.env;
const KOMODO_URL = env.KOMODO_URL || 'http://10.10.10.10:9120';
const STACK = env.STACK || 'design-wiki';
const { TAG_FILE, TAG_VAR, TAG, VERIFY_URL } = env;
const REQUIRED_SERVICES = (env.REQUIRED_SERVICES || '').split(',').map((s) => s.trim()).filter(Boolean);
for (const k of ['KOMODO_API_KEY', 'KOMODO_API_SECRET', 'TAG_FILE', 'TAG_VAR', 'TAG', 'VERIFY_URL']) {
  if (!env[k]) { console.error(`${k} is not set`); process.exit(2); }
}

const POLL_SECONDS = 300;      // time for VERIFY_URL to show TAG
const POLL_INTERVAL_MS = 5000;
const DEPLOY_ATTEMPTS = 2;
const UPDATE_SECONDS = 300;    // ceiling for one Komodo Update
const BUSY_SECONDS = 300;      // wait for an Update that already runs
const SERVICE_SECONDS = 90;
const STABLE_READS = 2;

const headers = {
  'Content-Type': 'application/json',
  'X-Api-Key': env.KOMODO_API_KEY,
  'X-Api-Secret': env.KOMODO_API_SECRET,
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(path, body) {
  const res = await fetch(KOMODO_URL + path, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} failed: HTTP ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

const OID = '$oid';
const updateIdOf = (u) => (u && ((u._id && u._id[OID]) || u.id)) || null;

// Komodo keys Updates by the Stack id, not its name.
async function stackId() {
  const stack = await call('/read/GetStack', { stack: STACK });
  return (stack._id && stack._id[OID]) || stack._id || stack.id;
}

async function waitWhileBusy(id) {
  const deadline = Date.now() + BUSY_SECONDS * 1000;
  while (Date.now() < deadline) {
    const { updates = [] } = await call('/read/ListUpdates', { query: { 'target.type': 'Stack', 'target.id': id }, page: 0 });
    const running = updates.find((u) => u.status === 'InProgress' || u.status === 'Queued');
    if (!running) return;
    console.log(`Komodo update ${updateIdOf(running)} is ${running.status} on ${STACK}; waiting`);
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`${STACK} still has an Update in progress after ${BUSY_SECONDS}s.`);
}

async function readTagFile() {
  const stack = await call('/read/GetStack', { stack: STACK });
  const remote = (stack.info && stack.info.remote_contents) || [];
  const entry = remote.find((f) => f.path === TAG_FILE || f.path.endsWith('/' + TAG_FILE));
  return entry ? entry.contents : null;
}

// Never throws: unreachable and not-yet-restarted look the same, so keep polling.
async function servedTag() {
  try {
    const res = await fetch(VERIFY_URL, { signal: AbortSignal.timeout(5000) });
    return res.ok ? (await res.text()).trim() : null;
  } catch { return null; }
}

function failedSteps(update) {
  return (update.logs || [])
    .filter((l) => l.success === false)
    .map((l) => `[${l.stage}] ` + String(l.stderr || '(no stderr)').trim().split('\n').slice(-15).join('\n'))
    .join('\n');
}

async function waitForUpdate(id) {
  const deadline = Date.now() + UPDATE_SECONDS * 1000;
  while (Date.now() < deadline) {
    const update = await call('/read/GetUpdate', { id });
    if (update.status === 'Complete') return update;
    await sleep(POLL_INTERVAL_MS);
  }
  return null;
}

const stateOf = (s) => String((s.container && s.container.state) || s.state || 'unknown').toLowerCase();

// A missing required service counts as not running, so a rename fails here.
async function servicesNotRunning() {
  const deadline = Date.now() + SERVICE_SECONDS * 1000;
  let stable = 0;
  let bad = [];
  while (Date.now() < deadline) {
    const list = await call('/read/ListStackServices', { stack: STACK });
    const byName = Object.fromEntries(list.map((s) => [s.service, s]));
    bad = REQUIRED_SERVICES
      .filter((n) => !byName[n] || stateOf(byName[n]) !== 'running')
      .map((n) => `${n} is ${byName[n] ? stateOf(byName[n]) : 'missing from the Stack'}`);
    stable = bad.length === 0 ? stable + 1 : 0;
    if (stable >= STABLE_READS) return [];
    await sleep(POLL_INTERVAL_MS);
  }
  return bad;
}

// Returns null when the deploy is sound, else { message, retry }.
async function deployProblem(updateId) {
  const update = await waitForUpdate(updateId);
  if (!update) return { retry: false, message: `Komodo update ${updateId} was still running after ${UPDATE_SECONDS}s.` };
  if (!update.success) return { retry: true, message: `Komodo update ${updateId} finished as FAILED. Failed step:\n${failedSteps(update)}` };
  const bad = await servicesNotRunning();
  if (bad.length) return { retry: true, message: `Komodo update ${updateId} succeeded, but these services must run and do not: ${bad.join(', ')}.` };
  return null;
}

async function main() {
  await waitWhileBusy(await stackId());

  const line = `${TAG_VAR}=${TAG}`;
  const contents = [
    '# Written by the Jenkins pipeline of one wiki repository for main.',
    '# ONE writer, whole file. Do not hand-edit: the next build overwrites it.',
    line,
  ].join('\n') + '\n';
  await call('/write/WriteStackFileContents', { stack: STACK, file_path: TAG_FILE, contents });

  // Read back: a file not declared in the Stack config is accepted but never injected.
  const after = await readTagFile();
  if (after === null) {
    throw new Error(`${TAG_FILE} is not declared in ${STACK} remote_contents. Add it to additional_env_files for ${STACK} in home-lab/komodo/resources.toml and seed the file on the NAS before this pipeline runs.`);
  }
  if (!after.split('\n').includes(line)) {
    throw new Error(`wrote ${TAG_FILE} but Komodo read it back without ${line}. This file must have exactly one writer.`);
  }
  console.log(`wrote ${line} to ${TAG_FILE}`);

  let lastProblem = `${VERIFY_URL} still does not report ${TAG}.`;
  for (let attempt = 1; attempt <= DEPLOY_ATTEMPTS; attempt++) {
    const update = await call('/execute/DeployStack', { stack: STACK });
    const updateId = updateIdOf(update);
    if (!updateId) throw new Error('DeployStack returned no update id, so the deploy result cannot be checked.');
    console.log(`DeployStack ${attempt}/${DEPLOY_ATTEMPTS} triggered (update ${updateId}); waiting up to ${POLL_SECONDS}s for ${VERIFY_URL} to report ${TAG}`);

    const deadline = Date.now() + POLL_SECONDS * 1000;
    let seen = null;
    while (Date.now() < deadline && seen !== TAG) {
      seen = await servedTag();
      if (seen !== TAG) await sleep(POLL_INTERVAL_MS);
    }
    if (seen !== TAG) {
      lastProblem = `${VERIFY_URL} reports ${seen ?? 'nothing (unreachable)'}, not ${TAG}.`;
      console.log(`not converged after deploy ${attempt}: ${lastProblem}`);
      continue;
    }
    console.log(`verified: ${VERIFY_URL} reports ${TAG}`);

    const problem = await deployProblem(updateId);
    if (problem === null) {
      console.log(`verified: Komodo update ${updateId} succeeded` + (REQUIRED_SERVICES.length ? ` and ${REQUIRED_SERVICES.join(', ')} run` : ''));
      return;
    }
    lastProblem = problem.message;
    console.log(`not converged after deploy ${attempt}: ${problem.message}`);
    if (!problem.retry) break;
  }
  throw new Error(`the deploy did not land: ${lastProblem} The image is published; the deploy failed.`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
