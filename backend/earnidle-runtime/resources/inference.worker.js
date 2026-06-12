// Inference worker — browser Web Worker with WebGPU/WASM using Transformers.js
// Start a resource contribution for AI inference. Polls jobs, runs model, submits outputs.

self.onmessage = async (event) => {
  const { type, data } = event.data;
  if (type === 'start') {
    try {
      self.postMessage({ type: 'status', status: 'loading', resource: 'inference' });

      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3');
      env.allowLocalModels = false;
      let device = 'wasm';
      try {
        if (navigator.gpu) {
          const adapter = await navigator.gpu.requestAdapter();
          if (adapter) device = 'webgpu';
        }
      } catch {
        device = 'wasm';
      }

      const modelId = 'onnx-community/Llama-3.2-1B-Instruct';
      const generator = await pipeline('text-generation', modelId, {
        device,
        dtype: 'q4',
        progress_callback: (progress) => {
          if (progress.status === 'progress' && typeof progress.progress === 'number') {
            self.postMessage({ type: 'progress', resource: 'inference', progress: Math.round(progress.progress) });
          }
        },
      });

      self.postMessage({ type: 'status', status: 'running', resource: 'inference', device });

      // Poll the inference endpoint until the caller stops the worker.
      while (true) {
        if (!data.wallet || !data.nodeId) break;
        await pollAndRun({ wallet: data.wallet, nodeId: data.nodeId, generator, device });
        await sleep(30000);
      }
    } catch (error) {
      self.postMessage({
        type: 'status',
        status: 'error',
        resource: 'inference',
        error: error.message || String(error),
      });
    }
  }

  if (type === 'stop') {
    // Currently relying on the parent to terminate the worker after calling stop().
  }
};

async function pollAndRun({ wallet, nodeId, generator, device }) {
  // Try for a job.
  const pollUrl = `https://api.earnidle.com/api/inference/job?node_id=${encodeURIComponent(nodeId)}&model=llama-3.2-1b`;
  let job = null;
  try {
    const response = await fetch(pollUrl);
    job = await response.json();
  } catch {
    return;
  }
  if (!job || !job.id) return;

  self.postMessage({ type: 'job', resource: 'inference', jobId: job.id, status: 'processing' });

  const startTime = Date.now();
  let output = '';
  let tokens = 0;
  try {
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
    self.postMessage({ type: 'error', resource: 'inference', error: error.message || String(error) });
    return;
  }

  const durationMs = Date.now() - startTime;

  const submitResponse = await fetch('https://api.earnidle.com/api/inference/result', {
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

  if (submitResponse.ok) {
    const json = await submitResponse.json();
    self.postMessage({
      type: 'job',
      resource: 'inference',
      jobId: job.id,
      status: 'complete',
      payout: json.payout_usdc || 0,
    });
  } else {
    const text = await submitResponse.text().catch(() => 'submission_failed');
    self.postMessage({ type: 'error', resource: 'inference', error: text });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
