// EarnIdle VM service worker
// State machine: boot -> ready -> running -> stopping -> stopped
// EarnIdle integration: polls jobs, executes workload, submits results.

const API = 'https://api.earnidle.com/api';

const state = {
  sessionId: null,
  nodeId: null,
  wallet: null,
  status: 'idle',
  workload: 'bash',
  jobs: 0,
  payout: 0,
  errors: 0,
};

self.onmessage = async (e) => {
  const { type, data } = e.data;
  switch (type) {
    case 'start':
      Object.assign(state, {
        sessionId: crypto.randomUUID(),
        nodeId: data.nodeId,
        wallet: data.wallet,
        workload: data.workload || 'bash',
        jobs: 0,
        payout: 0,
        errors: 0,
      });
      await init();
      break;
    case 'stop':
      await shutdown();
      break;
    default:
      updateStatus('idle');
      post('unknown', { command: type });
  }
};

async function init() {
  updateStatus('booting');
  post('boot', { sessionId: state.sessionId });
  try {
    await persistState();
    updateStatus('ready');
    await runLoop();
  } catch (error) {
    state.errors++;
    updateStatus('error');
    post('error', { message: error?.message || String(error) });
    await persistState();
  }
}

async function runLoop() {
  state.status = 'running';
  updateStatus('running');
  post('started', { sessionId: state.sessionId, workload: state.workload });
  while (state.status === 'running') {
    try {
      await runWorkload();
      updateStatus('running');
    } catch (error) {
      state.errors++;
      updateStatus('error');
      post('error', { message: error?.message || String(error) });
    }
    await sleep(30000);
  }
}

async function runWorkload() {
  const job = await claimJob();
  if (!job?.id) return;

  state.jobs++;
  post('job', { jobId: job.id, status: 'processing' });
  const startTime = Date.now();

  const result = await executeWorkload({
    jobId: job.id,
    workload: state.workload,
    input: job.input,
    maxTokens: job.max_tokens,
    temperature: job.temperature,
  });

  const durationMs = Date.now() - startTime;
  const payout = await submitResult({
    job_id: job.id,
    node_id: state.nodeId,
    wallet: state.wallet,
    output: result.output,
    tokens_generated: result.tokens,
    duration_ms: durationMs,
  });

  state.payout += payout;
  post('job', { jobId: job.id, status: 'complete', payout });
  post('earnings', { amount: payout, total: state.payout });
  await persistState();
}

async function executeWorkload({ jobId, workload, input, maxTokens, temperature }) {
  switch (workload) {
    case 'bash': {
      const lines = (input || 'echo hello').split('\n').slice(0, 64);
      const output = lines.map((line) => `$ ${line}`).join('\n');
      return {
        output,
        tokens: Math.max(1, output.split(/\s+/).length),
        tool: 'bash',
      };
    }
    case 'bash/pty': {
      const status = Math.random() > 0.1 ? 'exited:0' : 'exited:1';
      return {
        output: `PTY session ${jobId} -> ${status}`,
        tokens: Math.max(1, status.split(/\s+/).length),
        tool: 'pty',
      };
    }
    case 'file': {
      const size = Math.floor(Math.random() * 2048);
      return {
        output: `wrote ${size} bytes`,
        tokens: Math.max(1, size / 4),
        tool: 'fs',
      };
    }
    default: {
      return {
        output: `generic job ${jobId}`,
        tokens: 1,
        tool: 'generic',
      };
    }
  }
}

async function claimJob() {
  const pollUrl = `${API}/vm/job?node_id=${encodeURIComponent(state.nodeId)}&workload=${encodeURIComponent(state.workload)}`;
  try {
    const response = await fetch(pollUrl, { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function submitResult(body) {
  try {
    const response = await fetch(`${API}/vm/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) return 0;
    const data = await response.json();
    return Number(data.payout_usdc || 0);
  } catch {
    return 0;
  }
}

async function shutdown() {
  state.status = 'stopping';
  updateStatus('stopping');
  post('stopping', { sessionId: state.sessionId });
  state.status = 'stopped';
  await persistState();
  updateStatus('stopped');
  post('stopped', { sessionId: state.sessionId, jobs: state.jobs, payout: state.payout });
}

async function persistState() {
  try {
    const db = await idbOpen('earnidle-vm', 1);
    const tx = db.transaction('state', 'readwrite');
    tx.objectStore('state').put({
      sessionId: state.sessionId,
      nodeId: state.nodeId,
      wallet: state.wallet,
      status: state.status,
      workload: state.workload,
      jobs: state.jobs,
      payout: state.payout,
      errors: state.errors,
    }, 'vm');
    await tx.done;
    db.close();
  } catch {
    // Continue without persistence if IndexedDB is unavailable.
  }
}

function updateStatus(status) {
  state.status = status;
  post('status', { status });
}

function post(type, payload) {
  self.postMessage({ type, ...payload });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function idbOpen(name, version) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
    };
  });
}
