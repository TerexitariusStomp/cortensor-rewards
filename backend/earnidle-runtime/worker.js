// EarnIdle inference worker
// Tenancy model: one worker instance per node/wallet config.
// Errors: logs and surfaces fetch/model/submit failures to container.

const API = 'https://api.earnidle.com/api';

let nodeId = null;
let wallet = null;
let running = false;

self.onmessage = async (e) => {
  const { type, data } = e.data;
  switch (type) {
    case 'start':
      nodeId = data.nodeId;
      wallet = data.wallet;
      running = true;
      updateStatus('starting');
      await runLoop();
      break;
    case 'stop':
      running = false;
      updateStatus('stopped');
      break;
    default:
      updateStatus('idle');
  }
};

async function runLoop() {
  while (running) {
    try {
      updateStatus('loading');
      await pollAndRun();
      updateStatus('running');
    } catch (error) {
      updateStatus('error');
      post('error', { message: error?.message || String(error) });
    }
    await sleep(30000);
  }
}

async function pollAndRun() {
  const pollUrl = `${API}/inference/job?node_id=${encodeURIComponent(nodeId)}&model=llama-3.2-1b`;
  let job = null;
  try {
    const response = await fetch(pollUrl);
    job = await response.json();
  } catch {
    return;
  }
  if (!job?.id) return;

  post('job', { jobId: job.id, status: 'processing' });

  const startTime = Date.now();
  let output = '';
  let tokens = 0;
  try {
    const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3');
    const generator = await pipeline('text-generation', 'onnx-community/Llama-3.2-1B-Instruct', {
      device: 'wasm',
      dtype: 'q4',
    });
    const messages = [];
    if (job.system_prompt) messages.push({ role: 'system', content: job.system_prompt });
    messages.push({ role: 'user', content: job.prompt || 'Hello' });

    const result = await generator(messages, {
      max_new_tokens: Math.min(job.max_tokens || 256, 512),
      temperature: job.temperature || 0.7,
      do_sample: true,
    });

    const last = result[0]?.generated_text;
    output = Array.isArray(last) ? last[last.length - 1]?.content || '' : String(last || '');
    tokens = output ? output.split(/\s+/).length : 0;
  } catch (error) {
    post('error', { message: error?.message || String(error) });
    return;
  }

  const durationMs = Date.now() - startTime;

  try {
    const submitResponse = await fetch(`${API}/inference/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: job.id,
        node_id: nodeId,
        wallet,
        output,
        tokens_generated: tokens,
        duration_ms: durationMs,
      }),
    });

    let payout = 0;
    if (submitResponse.ok) {
      try {
        const json = await submitResponse.json();
        payout = Number(json.payout_usdc || 0);
      } catch {
        payout = 0;
      }
      post('job', { jobId: job.id, status: 'complete', payout });
      post('earnings', { amount: payout });
    } else {
      post('job', { jobId: job.id, status: 'submit_failed' });
    }
  } catch (error) {
    post('error', { message: error?.message || String(error) });
  }
}

function updateStatus(status) {
  post('status', { status });
}

function post(type, payload) {
  if (!running && type !== 'error') return;
  self.postMessage({ type, ...payload });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
