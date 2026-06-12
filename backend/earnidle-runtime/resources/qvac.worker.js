// QVAC skill worker — QVAC Market compute resource
// State machine: boot -> ready -> running -> stopping -> stopped
// QVAC integration: polls QVAC Market jobs, executes compute, submits proofs.

const QVAC_API = 'https://api.qvac.network/api';

const state = {
  sessionId: null,
  nodeId: null,
  wallet: null,
  status: 'idle',
  marketId: 'qvac-mainnet',
  workload: 'inference',
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
        marketId: data.marketId || 'qvac-mainnet',
        workload: data.workload || 'inference',
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
    // Initialize QVAC-specific resources (e.g., WASM verifier, ZK prover)
    await initializeQVACRuntime();
    updateStatus('ready');
    await runLoop();
  } catch (error) {
    state.errors++;
    updateStatus('error');
    post('error', { message: error?.message || String(error) });
    await persistState();
  }
}

async function initializeQVACRuntime() {
  // Load QVAC verification WASM module from CDN
  const { QVACVerifier } = await import('https://cdn.jsdelivr.net/npm/@qvac/verifier-wasm@1');
  state.verifier = await QVACVerifier.init();
  post('status', { status: 'ready', detail: 'QVAC runtime initialized' });
}

async function runLoop() {
  state.status = 'running';
  updateStatus('running');
  post('started', { sessionId: state.sessionId, marketId: state.marketId, workload: state.workload });
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
    proofParams: job.proof_params,
  });

  const durationMs = Date.now() - startTime;
  const payout = await submitResult({
    job_id: job.id,
    node_id: state.nodeId,
    wallet: state.wallet,
    market_id: state.marketId,
    output: result.output,
    proof: result.proof,
    tokens_generated: result.tokens,
    duration_ms: durationMs,
  });

  state.payout += payout;
  post('job', { jobId: job.id, status: 'complete', payout });
  post('earnings', { amount: payout, total: state.payout });
  await persistState();
}

async function executeWorkload({ jobId, workload, input, proofParams }) {
  switch (workload) {
    case 'inference': {
      // Run LLM inference with QVAC verification
      const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3');
      const generator = await pipeline('text-generation', 'onnx-community/Qvac-1B-Instruct', {
        device: 'wasm',
        dtype: 'q4',
      });

      const messages = [];
      if (input.system_prompt) messages.push({ role: 'system', content: input.system_prompt });
      messages.push({ role: 'user', content: input.prompt || 'Hello' });

      const result = await generator(messages, {
        max_new_tokens: Math.min(input.max_tokens || 256, 512),
        temperature: input.temperature || 0.7,
        do_sample: true,
      });

      const output = Array.isArray(result[0]?.generated_text)
        ? result[0].generated_text[result[0].generated_text.length - 1]?.content || ''
        : String(result[0]?.generated_text || '');

      const tokens = output ? output.split(/\s+/).length : 0;

      // Generate ZK proof of correct execution
      const proof = await state.verifier.prove({
        model: 'onnx-community/Qvac-1B-Instruct',
        input: messages,
        output,
        randomness: crypto.getRandomValues(new Uint8Array(32)),
      });

      return { output, tokens, proof, tool: 'qvac-inference' };
    }
    case 'verification': {
      // Verify a ZK proof submitted by another node
      const isValid = await state.verifier.verify({
        proof: input.proof,
        public_inputs: input.public_inputs,
        verification_key: input.verification_key,
      });

      return {
        output: isValid ? 'VERIFIED' : 'INVALID',
        tokens: 1,
        proof: { verified: isValid },
        tool: 'qvac-verification',
      };
    }
    case 'attestation': {
      // Generate attestation for TEE execution
      const { TEEAttestation } = await import('https://cdn.jsdelivr.net/npm/@qvac/tee-attestation@1');
      const attestation = await TEEAttestation.generate({
        workload: input.workload,
        measurement: input.measurement,
        user_data: input.user_data,
      });

      return {
        output: attestation.report,
        tokens: 1,
        proof: { attestation },
        tool: 'qvac-attestation',
      };
    }
    default: {
      return {
        output: `qvac job ${jobId}: ${workload}`,
        tokens: 1,
        proof: null,
        tool: 'qvac-generic',
      };
    }
  }
}

async function claimJob() {
  const pollUrl = `${QVAC_API}/${state.marketId}/job?node_id=${encodeURIComponent(state.nodeId)}&workload=${encodeURIComponent(state.workload)}`;
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
    const response = await fetch(`${QVAC_API}/${state.marketId}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) return 0;
    const data = await response.json();
    return Number(data.payout_qvac || 0);
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
    const db = await idbOpen('earnidle-qvac', 1);
    const tx = db.transaction('state', 'readwrite');
    tx.objectStore('state').put({
      sessionId: state.sessionId,
      nodeId: state.nodeId,
      wallet: state.wallet,
      status: state.status,
      marketId: state.marketId,
      workload: state.workload,
      jobs: state.jobs,
      payout: state.payout,
      errors: state.errors,
    }, 'qvac');
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