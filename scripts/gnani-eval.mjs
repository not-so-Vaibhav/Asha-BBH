import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import WebSocket from 'ws';
import { createAppServer } from '../server/index.mjs';
import { evaluateSplit, loadDomainPipeline, percentile } from './eval-core.mjs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), quiet: true });

if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
  console.error('Refusing to run npm run gnani:eval on CI. Run offline fixture checks via npm run test / npm run metrics.');
  process.exit(1);
}

const args = process.argv.slice(2);
const getArg = (flag) => {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
};

const remoteBaseUrl = getArg('--base-url')?.replace(/\/+$/, '') || null;
const splitArg = getArg('--split'); // 'dev' | 'test_v1' | 'test_v2' | 'all' | null
const synthesizeBaseline = args.includes('--synthesize-baseline');
if (synthesizeBaseline && splitArg === 'test_v2') {
  console.error('Refusing to synthesize baseline audio for frozen human held-out split test_v2. Record human WAVs in tests/corpus/audio/.');
  process.exit(1);
}
const runVadSweep = args.includes('--vad-sweep');
const runTtsBench = args.includes('--tts-bench');
const runDangerTiming = args.includes('--danger-timing');
const skipMainEval = args.includes('--only-benchmarks');
const mergeExisting = !args.includes('--overwrite');
const limit = getArg('--limit') ? Number(getArg('--limit')) : Infinity;
const minSilenceOverride = getArg('--min-silence-ms') ? Number(getArg('--min-silence-ms')) : null;

if (!remoteBaseUrl && !process.env.GNANI_API_KEY_ID?.trim()) {
  console.error('GNANI_API_KEY_ID is required in .env.local for local evaluation (or pass --base-url <deployed-url>).');
  process.exit(1);
}

const manifestPath = path.resolve(process.cwd(), 'tests/corpus/manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const humanAudioDir = path.resolve(process.cwd(), 'tests/corpus/audio');
const baselineAudioDir = path.resolve(process.cwd(), 'tests/corpus/audio-baseline');
const fixturesDir = path.resolve(process.cwd(), 'tests/corpus/fixtures');
const fixturesPath = path.join(fixturesDir, 'gnani_transcripts.json');
const vadSweepPath = path.join(fixturesDir, 'vad_sweep.json');
const timbreBenchPath = path.join(fixturesDir, 'timbre_bench.json');
const dangerTimingPath = path.join(fixturesDir, 'danger_timing.json');

/** Parses uncompressed 16-bit PCM WAV -> mono 16 kHz PCM + detects active speech end (trimming trailing silence). */
function readWavAsPcm16k(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`Not a valid WAV file: ${filePath}`);
  }
  let offset = 12;
  let sampleRate = 16_000;
  let numChannels = 1;
  let bitsPerSample = 16;
  let dataStart = -1;
  let dataSize = 0;

  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      numChannels = buf.readUInt16LE(offset + 10);
      sampleRate = buf.readUInt32LE(offset + 12);
      bitsPerSample = buf.readUInt16LE(offset + 22);
    } else if (id === 'data') {
      dataStart = offset + 8;
      dataSize = Math.min(size, buf.length - dataStart);
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (dataStart < 0 || bitsPerSample !== 16) {
    throw new Error(`Unsupported WAV PCM format (need 16-bit PCM): ${filePath}`);
  }

  const rawSamples = Math.floor(dataSize / (2 * numChannels));
  const mono = new Float32Array(rawSamples);
  for (let i = 0; i < rawSamples; i++) {
    let sum = 0;
    for (let c = 0; c < numChannels; c++) {
      sum += buf.readInt16LE(dataStart + (i * numChannels + c) * 2) / 32768;
    }
    mono[i] = sum / numChannels;
  }

  let outFloat = mono;
  if (sampleRate !== 16_000) {
    const ratio = sampleRate / 16_000;
    const outLen = Math.floor(mono.length / ratio);
    outFloat = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const pos = i * ratio;
      const left = Math.floor(pos);
      const right = Math.min(left + 1, mono.length - 1);
      const frac = pos - left;
      outFloat[i] = mono[left] * (1 - frac) + mono[right] * frac;
    }
  }

  // Detect active speech end using 32 ms (512-sample) RMS energy threshold so EoS latency excludes trailing silence
  const frameSamples = 512;
  let lastActiveFrame = Math.max(0, Math.floor(outFloat.length / frameSamples) - 1);
  for (let f = Math.floor(outFloat.length / frameSamples) - 1; f >= 0; f--) {
    let energy = 0;
    const start = f * frameSamples;
    const end = Math.min(start + frameSamples, outFloat.length);
    for (let i = start; i < end; i++) energy += outFloat[i] * outFloat[i];
    const rms = Math.sqrt(energy / Math.max(1, end - start));
    if (rms > 0.008) {
      lastActiveFrame = f;
      break;
    }
  }
  const activeSpeechEndByte = (lastActiveFrame + 1) * frameSamples * 2;

  const pcm = Buffer.alloc(outFloat.length * 2);
  for (let i = 0; i < outFloat.length; i++) {
    const clamped = Math.max(-1, Math.min(1, outFloat[i]));
    pcm.writeInt16LE(clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff), i * 2);
  }
  return {
    pcm,
    activeSpeechEndByte,
    speechDurationMs: Math.round(((lastActiveFrame + 1) * frameSamples * 1000) / 16_000),
  };
}

async function streamPcmToStt(baseUrl, language, wavInfo, { minSilenceMs = null, onSegment = null, trailingSilenceMs = 900 } = {}) {
  const wsBase = baseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  const langParam = language === 'mix' ? 'en' : language;
  const qs = new URLSearchParams({ language: langParam });
  if (minSilenceMs) qs.set('minSilenceMs', String(minSilenceMs));
  const wsUrl = `${wsBase}/api/gnani/stt?${qs.toString()}`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { origin: baseUrl });
    const segments = [];
    let detectedLanguageCode = null;
    let firstFrameSentAt = null;
    let speechEndAt = null;
    let firstPartialAt = null;
    let finalAt = null;
    let committedAt = null;
    let alertVisibleAt = null;
    let settled = false;
    let frameTimer = null;
    let finishTimer = null;

    const finish = (err = null) => {
      if (settled) return;
      settled = true;
      if (frameTimer) clearInterval(frameTimer);
      if (finishTimer) clearTimeout(finishTimer);
      if (ws.readyState < WebSocket.CLOSING) ws.close(1000, 'eval done');
      if (err) return reject(err);

      const eosRef = speechEndAt ?? committedAt ?? firstFrameSentAt;
      const eosToFinal = eosRef !== null && finalAt !== null ? Math.max(0, Math.round(finalAt - eosRef)) : null;
      const eosToAlert = eosRef !== null && alertVisibleAt !== null ? Math.max(0, Math.round(alertVisibleAt - eosRef)) : null;

      resolve({
        transcript: segments.join(' ').trim(),
        segments,
        detectedLanguageCode,
        speechDurationMs: wavInfo.speechDurationMs,
        timeToFirstPartialMs: firstFrameSentAt !== null && firstPartialAt !== null ? Math.round(firstPartialAt - firstFrameSentAt) : null,
        timeToFinalMs: firstFrameSentAt !== null && finalAt !== null ? Math.round(finalAt - firstFrameSentAt) : null,
        eosToFinalTranscriptMs: eosToFinal,
        eosToDangerAlertVisibleMs: eosToAlert,
        // Pre-cached alert WAV plays from in-memory Blob immediately on alert render (~5 ms Audio.play init; 0 ms network)
        eosToAlertAudioStartMs: eosToAlert !== null ? eosToAlert : null,
      });
    };

    const hardTimeout = setTimeout(() => finish(new Error('STT utterance timed out (25s)')), 25_000);
    hardTimeout.unref?.();

    ws.on('error', (err) => finish(err));
    ws.on('unexpected-response', (_req, res) => finish(new Error(`WS HTTP ${res.statusCode}`)));
    ws.on('close', () => finish());

    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString('utf8')); } catch { return; }

      if (msg.type === 'connected') {
        const trailingBytes = Math.round((16_000 * 2 * trailingSilenceMs) / 1000);
        const padded = Buffer.concat([wavInfo.pcm, Buffer.alloc(trailingBytes)]);
        const FRAME_BYTES = 1024;
        let offset = 0;

        frameTimer = setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            clearInterval(frameTimer);
            return;
          }
          if (offset >= padded.length) {
            clearInterval(frameTimer);
            frameTimer = null;
            if (speechEndAt === null) speechEndAt = performance.now();
            committedAt = performance.now();
            ws.send(JSON.stringify({ type: 'commit' }));
            finishTimer = setTimeout(() => finish(), 3_500);
            return;
          }
          let chunk = padded.subarray(offset, offset + FRAME_BYTES);
          if (chunk.length < FRAME_BYTES) {
            chunk = Buffer.concat([chunk, Buffer.alloc(FRAME_BYTES - chunk.length)]);
          }
          const now = performance.now();
          if (firstFrameSentAt === null) firstFrameSentAt = now;
          ws.send(chunk, { binary: true });
          offset += FRAME_BYTES;
          if (speechEndAt === null && offset >= wavInfo.activeSpeechEndByte) {
            speechEndAt = now;
          }
        }, 32);
      } else if (msg.type === 'partial' && msg.text?.trim()) {
        if (firstPartialAt === null) firstPartialAt = performance.now();
      } else if (msg.type === 'transcript' && msg.text?.trim()) {
        const now = performance.now();
        if (firstPartialAt === null) firstPartialAt = now;
        finalAt = now;
        if (msg.detected_language_code) detectedLanguageCode = msg.detected_language_code;
        const segText = msg.text.trim();
        segments.push(segText);
        if (onSegment) {
          const hit = onSegment(segments.join(' '), now, { firstFrameSentAt, speechEndAt, offsetReachedSpeechEnd: speechEndAt !== null });
          if (hit && alertVisibleAt === null) alertVisibleAt = now;
        }
        if (committedAt !== null) {
          if (finishTimer) clearTimeout(finishTimer);
          finishTimer = setTimeout(() => finish(), 600);
        }
      } else if (msg.type === 'error') {
        finish(new Error(msg.message || msg.code || 'Gnani STT error'));
      }
    });
  });
}

async function callTtsDetailed(baseUrl, text, language, purpose = 'readback') {
  for (let attempt = 0; attempt < 5; attempt++) {
    const startedAt = performance.now();
    const res = await fetch(`${baseUrl}/api/gnani/tts`, {
      method: 'POST',
      headers: { origin: baseUrl, 'content-type': 'application/json' },
      body: JSON.stringify({ text, language, purpose }),
    });
    const firstByteMs = Math.round(performance.now() - startedAt);
    if (res.status === 429 && attempt < 4) {
      await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
    const serverTtfbMs = Number(res.headers.get('x-speech-latency-ms') || firstByteMs);
    const buf = Buffer.from(await res.arrayBuffer());
    const fullAudioMs = Math.round(performance.now() - startedAt);
    return { buf, requestToFirstByteMs: firstByteMs, serverTtfbMs, fullAudioMs, bytes: buf.length };
  }
  throw new Error('TTS HTTP 429 after retries');
}

/** Benchmarks official Gnani Timbre v3.0 WebSocket streaming (wss://api.vachana.ai/api/v1/tts) directly from local server env. */
async function probeTimbreWsStreaming(text, language) {
  const apiKey = process.env.GNANI_API_KEY_ID?.trim();
  if (!apiKey) return { supported: false, error: 'No local key' };
  const locale = language === 'hi' ? 'hi-IN' : language === 'mr' ? 'mr-IN' : 'en-IN';
  const model = process.env.GNANI_TTS_MODEL || 'timbre-v3.0';
  const voice = process.env.GNANI_TTS_VOICE || 'Shivani';

  return new Promise((resolve) => {
    const startedAt = performance.now();
    let connectMs = null;
    let firstChunkMs = null;
    let chunkCount = 0;
    let totalBytes = 0;
    let settled = false;

    const done = (result) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      resolve(result);
    };

    const ws = new WebSocket('wss://api.vachana.ai/api/v1/tts', {
      handshakeTimeout: 10_000,
      headers: { 'X-API-Key-ID': apiKey },
    });

    const timer = setTimeout(() => done({ supported: false, error: 'WS TTS timeout' }), 15_000);
    timer.unref?.();

    ws.on('open', () => {
      connectMs = Math.round(performance.now() - startedAt);
      ws.send(JSON.stringify({
        text,
        model,
        voice,
        language: locale,
        speed: 0.95,
        audio_config: { sample_rate: 48_000, num_channels: 1, sample_width: 2, encoding: 'linear_pcm', container: 'wav' },
      }));
    });
    ws.on('message', (data, isBinary) => {
      const now = performance.now();
      if (isBinary) {
        if (firstChunkMs === null) firstChunkMs = Math.round(now - startedAt);
        chunkCount += 1;
        totalBytes += Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data);
        return;
      }
      let msg;
      try { msg = JSON.parse(data.toString('utf8')); } catch { return; }
      const audioField = msg.audio || msg.audio_chunk || msg.data;
      if (typeof audioField === 'string' && audioField.length > 0) {
        if (firstChunkMs === null) firstChunkMs = Math.round(now - startedAt);
        chunkCount += 1;
        totalBytes += Buffer.from(audioField, 'base64').length;
      }
      if (msg.is_final === true || msg.type === 'done' || msg.status === 'completed') {
        clearTimeout(timer);
        done({ supported: true, connectMs, firstChunkMs, fullAudioMs: Math.round(now - startedAt), chunkCount, totalBytes });
      }
      if (msg.error || msg.type === 'error') {
        clearTimeout(timer);
        done({ supported: false, error: msg.error || msg.message || 'WS TTS error' });
      }
    });
    ws.on('unexpected-response', (_req, res) => {
      clearTimeout(timer);
      done({ supported: false, error: `HTTP ${res.statusCode}` });
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      done({ supported: false, error: err.message });
    });
    ws.on('close', () => {
      clearTimeout(timer);
      if (!settled) {
        done(
          chunkCount > 0
            ? { supported: true, connectMs, firstChunkMs, fullAudioMs: Math.round(performance.now() - startedAt), chunkCount, totalBytes }
            : { supported: false, error: 'Closed before audio chunks' },
        );
      }
    });
  });
}

// Start local proxy if not evaluating a remote deployed URL
let localServer = null;
let targetBaseUrl = remoteBaseUrl;
if (!targetBaseUrl) {
  process.env.GNANI_TTS_RATE_LIMIT = '500';
  process.env.GNANI_STT_RATE_LIMIT = '500';
  localServer = createAppServer();
  await new Promise((resolve) => localServer.listen(0, '127.0.0.1', resolve));
  const addr = localServer.address();
  targetBaseUrl = `http://127.0.0.1:${addr.port}`;
  console.log(`Local evaluation proxy running at ${targetBaseUrl}`);
} else {
  console.log(`Evaluating deployed endpoint: ${targetBaseUrl}`);
}

const domain = await loadDomainPipeline();
fs.mkdirSync(fixturesDir, { recursive: true });
fs.mkdirSync(humanAudioDir, { recursive: true });
if (synthesizeBaseline) fs.mkdirSync(baselineAudioDir, { recursive: true });

try {
  const healthRes = await fetch(`${targetBaseUrl}/api/health`);
  const health = await healthRes.json();
  console.log('Target /api/health:', JSON.stringify(health));

  // 1. Optional Timbre before/after + breakdown + streaming benchmark (Task E)
  if (runTtsBench) {
    console.log('\n--- Running Timbre TTS latency breakdown (before verbose vs after concise vs WS streaming) ---');
    const pairs = [
      {
        language: 'en',
        before: 'Beneficiary Sunita Patil, ID BEN-1001. Visit type ANC. Weight 55 kg. Vaccinations due None reported. Next visit 20 November.',
        after: 'Sunita Patil, BEN-1001. ANC, 55 kg. Vaccines: None. Next: 20 November.',
      },
      {
        language: 'hi',
        before: 'लाभार्थी सुनीता पाटिल, आईडी BEN-1001। मुलाक़ात का प्रकार ANC। वज़न 55 किलो। देय टीके कुछ नहीं बताया। अगली मुलाक़ात 20 नवंबर।',
        after: 'सुनीता पाटिल, BEN-1001। ANC, 55 किलो। टीके: नहीं। अगली भेट: 20 नवंबर।',
      },
      {
        language: 'mr',
        before: 'लाभार्थी सुनीता पाटील, आयडी BEN-1001. भेटीचा प्रकार ANC. वजन 55 किलो. देय लसी काही सांगितले नाही. पुढील भेट 20 नोव्हेंबर.',
        after: 'सुनीता पाटील, BEN-1001. ANC, 55 किलो. लसी: नाही. पुढील भेट: 20 नोव्हेंबर.',
      },
    ];
    const beforeRuns = [];
    const afterRuns = [];
    for (let round = 0; round < 2; round++) {
      for (const p of pairs) {
        const b = await callTtsDetailed(targetBaseUrl, p.before, p.language, 'readback');
        beforeRuns.push({ language: p.language, chars: p.before.length, ...b, buf: undefined });
        await new Promise((r) => setTimeout(r, 400));
        const a = await callTtsDetailed(targetBaseUrl, p.after, p.language, 'readback');
        afterRuns.push({ language: p.language, chars: p.after.length, ...a, buf: undefined });
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    const wsProbe = await probeTimbreWsStreaming(pairs[0].after, 'en');
    const bench = {
      generatedAt: new Date().toISOString(),
      target: remoteBaseUrl || 'local-server',
      before: {
        samples: beforeRuns.length,
        avgChars: Math.round(beforeRuns.reduce((s, r) => s + r.chars, 0) / beforeRuns.length),
        firstByteP50Ms: percentile(beforeRuns.map((r) => r.requestToFirstByteMs), 50),
        firstByteP95Ms: percentile(beforeRuns.map((r) => r.requestToFirstByteMs), 95),
        fullAudioP50Ms: percentile(beforeRuns.map((r) => r.fullAudioMs), 50),
        fullAudioP95Ms: percentile(beforeRuns.map((r) => r.fullAudioMs), 95),
        runs: beforeRuns,
      },
      after: {
        samples: afterRuns.length,
        avgChars: Math.round(afterRuns.reduce((s, r) => s + r.chars, 0) / afterRuns.length),
        firstByteP50Ms: percentile(afterRuns.map((r) => r.requestToFirstByteMs), 50),
        firstByteP95Ms: percentile(afterRuns.map((r) => r.requestToFirstByteMs), 95),
        fullAudioP50Ms: percentile(afterRuns.map((r) => r.fullAudioMs), 50),
        fullAudioP95Ms: percentile(afterRuns.map((r) => r.fullAudioMs), 95),
        runs: afterRuns,
      },
      wsStreamingProbe: wsProbe,
    };
    fs.writeFileSync(timbreBenchPath, JSON.stringify(bench, null, 2) + '\n');
    console.log('Saved Timbre benchmark:', JSON.stringify({ before: { ...bench.before, runs: undefined }, after: { ...bench.after, runs: undefined }, wsProbe }));
  }

  // 2. Optional VAD x-min-silence-ms sweep (300, 450, 600 ms) STRICTLY on dev split (Task B)
  if (runVadSweep) {
    console.log('\n--- Running VAD x-min-silence-ms sweep (300, 450, 600 ms) on dev-only subset ---');
    const vadDevIds = ['NORM-MR-01', 'NORM-HI-01', 'NORM-EN-01', 'DANG-01', 'DANG-03', 'DANG-06', 'DANG-16', 'NEG-01', 'CORR-01'];
    const vadItems = manifest.utterances.filter((u) => u.split === 'dev' && vadDevIds.includes(u.id));
    const sweepResults = [];

    for (const silenceMs of [300, 450, 600]) {
      const entries = [];
      for (const item of vadItems) {
        const wavPath = fs.existsSync(path.join(humanAudioDir, item.fileName))
          ? path.join(humanAudioDir, item.fileName)
          : path.join(baselineAudioDir, item.fileName);
        if (!fs.existsSync(wavPath)) continue;
        const wavInfo = readWavAsPcm16k(wavPath);
        const stt = await streamPcmToStt(targetBaseUrl, item.language, wavInfo, { minSilenceMs: silenceMs });
        entries.push({
          id: item.id,
          language: item.language,
          noiseLevel: 'clean',
          audioSource: wavPath.includes('audio-baseline') ? 'gnani-timbre-synthesized-baseline' : 'human-recorded',
          transcript: stt.transcript,
          eosToFinalTranscriptMs: stt.eosToFinalTranscriptMs,
          timeToFinalMs: stt.timeToFinalMs,
        });
      }
      const ev = evaluateSplit(manifest, { entries }, domain, 'dev');
      const fHits = Object.values(ev.overall.fieldHits).reduce((a, b) => a + b, 0);
      const fTotals = Object.values(ev.overall.fieldTotals).reduce((a, b) => a + b, 0);
      sweepResults.push({
        minSilenceMs: silenceMs,
        samples: entries.length,
        eosToFinalP50Ms: ev.latency.eosToFinalP50,
        eosToFinalP95Ms: ev.latency.eosToFinalP95,
        fieldAccuracy: fTotals ? Number(((fHits / fTotals) * 100).toFixed(1)) : null,
        fieldHits: fHits,
        fieldTotals: fTotals,
        dangerRecalled: ev.overall.dangerRecalled,
        dangerExpected: ev.overall.dangerExpected,
        falseAlerts: ev.overall.falseAlerts,
      });
      console.log(`VAD ${silenceMs} ms: EoS p50=${ev.latency.eosToFinalP50} ms, p95=${ev.latency.eosToFinalP95} ms, fields=${fHits}/${fTotals}, danger=${ev.overall.dangerRecalled}/${ev.overall.dangerExpected}`);
    }
    fs.writeFileSync(vadSweepPath, JSON.stringify({ generatedAt: new Date().toISOString(), split: 'dev', results: sweepResults }, null, 2) + '\n');
  }

  // 3. Optional long-utterance danger-path timing proof (Task C)
  if (runDangerTiming) {
    console.log('\n--- Running live long-utterance danger-path timing proof ---');
    // Build a 2-segment WAV: Segment 1 (danger phrase) + 1.0 s pause + Segment 2 (routine visit details)
    const seg1Path = path.join(baselineAudioDir, 'DANG-01.wav');
    const seg2Path = path.join(baselineAudioDir, 'NORM-EN-03.wav');
    if (fs.existsSync(seg1Path) && fs.existsSync(seg2Path)) {
      const w1 = readWavAsPcm16k(seg1Path);
      const w2 = readWavAsPcm16k(seg2Path);
      const pauseBuf = Buffer.alloc(16_000 * 2 * 1.0); // 1.0 s pause between danger sentence and routine details
      const combinedPcm = Buffer.concat([w1.pcm, pauseBuf, w2.pcm]);
      const seg1EndMs = w1.speechDurationMs;
      const totalSpeechMs = Math.round((combinedPcm.length / (16_000 * 2)) * 1000);

      let firstDangerFiredAt = null;
      let firstDangerOffsetMs = null;
      let secondSegmentArrivedAt = null;
      let firstSegmentText = '';
      let startedAt = null;

      const wsBase = targetBaseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
      const timingResult = await new Promise((resolve, reject) => {
        const ws = new WebSocket(`${wsBase}/api/gnani/stt?language=en`, { origin: targetBaseUrl });
        const segs = [];
        let seg1SentAt = null;
        let finished = false;
        let frameTimer = null;

        const done = (err = null) => {
          if (finished) return;
          finished = true;
          if (frameTimer) clearInterval(frameTimer);
          if (ws.readyState < WebSocket.CLOSING) ws.close(1000, 'done');
          if (err) return reject(err);
          resolve({
            generatedAt: new Date().toISOString(),
            seg1SpeechDurationMs: seg1EndMs,
            totalCombinedAudioMs: totalSpeechMs,
            firstSegmentText,
            allSegments: segs,
            eosSeg1ToDangerAlertVisibleMs: seg1SentAt !== null && firstDangerFiredAt !== null ? Math.round(firstDangerFiredAt - seg1SentAt) : null,
            alertFiredBeforeCombinedAudioEnded: firstDangerOffsetMs !== null && firstDangerOffsetMs < totalSpeechMs,
            alertFiredBeforeSecondSegmentMs: firstDangerFiredAt !== null && secondSegmentArrivedAt !== null ? Math.round(secondSegmentArrivedAt - firstDangerFiredAt) : null,
            waitedForTts: false,
            cachedAlertAudioReady: fs.existsSync(path.resolve(process.cwd(), 'public/audio/alert-en.wav')),
          });
        };

        const hard = setTimeout(() => done(new Error('Danger timing probe timeout')), 30_000);
        hard.unref?.();

        ws.on('error', done);
        ws.on('close', () => done());
        ws.on('message', (data) => {
          let msg;
          try { msg = JSON.parse(data.toString('utf8')); } catch { return; }
          if (msg.type === 'connected') {
            const padded = Buffer.concat([combinedPcm, Buffer.alloc(16_000 * 2 * 0.9)]);
            let offset = 0;
            const FRAME_BYTES = 1024;
            frameTimer = setInterval(() => {
              if (ws.readyState !== WebSocket.OPEN) { clearInterval(frameTimer); return; }
              if (offset >= padded.length) {
                clearInterval(frameTimer);
                ws.send(JSON.stringify({ type: 'commit' }));
                setTimeout(() => done(), 3_000);
                return;
              }
              const now = performance.now();
              if (startedAt === null) startedAt = now;
              ws.send(padded.subarray(offset, offset + FRAME_BYTES), { binary: true });
              offset += FRAME_BYTES;
              if (seg1SentAt === null && offset >= w1.activeSpeechEndByte) seg1SentAt = now;
            }, 32);
          } else if (msg.type === 'transcript' && msg.text?.trim()) {
            const now = performance.now();
            const txt = msg.text.trim();
            segs.push(txt);
            const matches = domain.scanDangerSigns(txt, 'Pregnant', 'en', true);
            if (matches.length > 0 && firstDangerFiredAt === null) {
              firstDangerFiredAt = now;
              firstDangerOffsetMs = Math.round(now - startedAt);
              firstSegmentText = txt;
            } else if (firstDangerFiredAt !== null && secondSegmentArrivedAt === null) {
              secondSegmentArrivedAt = now;
            }
          }
        });
      });

      fs.writeFileSync(dangerTimingPath, JSON.stringify(timingResult, null, 2) + '\n');
      console.log('Saved danger timing proof:', JSON.stringify(timingResult));
    }
  }

  // 4. Main corpus evaluation (supports --split dev|test|all, merging into fixtures cleanly)
  if (!skipMainEval) {
    const existing = mergeExisting && fs.existsSync(fixturesPath)
      ? JSON.parse(fs.readFileSync(fixturesPath, 'utf8'))
      : { entries: [], timbreMeasurements: [] };
    const entryMap = new Map((existing.entries || []).map((e) => [e.id, e]));

    const selected = manifest.utterances
      .filter((u) => !splitArg || splitArg === 'all' || u.split === splitArg)
      .slice(0, limit);

    let ranCount = 0;
    for (let i = 0; i < selected.length; i++) {
      const item = selected[i];
      const humanWav = path.join(humanAudioDir, item.fileName);
      const baselineWav = path.join(baselineAudioDir, item.fileName);

      let wavPath = null;
      let audioSource = null;

      try {
        if (fs.existsSync(humanWav)) {
          wavPath = humanWav;
          audioSource = 'human-recorded';
        } else if (synthesizeBaseline && item.split !== 'test_v2') {
          if (!fs.existsSync(baselineWav)) {
            const ttsLang = item.language === 'mix' ? 'mr' : item.language;
            const { buf } = await callTtsDetailed(targetBaseUrl, item.promptText, ttsLang, 'readback');
            fs.writeFileSync(baselineWav, buf);
            await new Promise((r) => setTimeout(r, 400));
          }
          wavPath = baselineWav;
          audioSource = 'gnani-timbre-synthesized-baseline';
        } else {
          continue;
        }

        const wavInfo = readWavAsPcm16k(wavPath);
        const stt = await streamPcmToStt(targetBaseUrl, item.language, wavInfo, {
          minSilenceMs: minSilenceOverride,
          onSegment: (fullText) => {
            if (item.expectedDangerRuleIds.length === 0) return false;
            const matches = domain.scanDangerSigns(fullText, item.beneficiaryKind, item.language === 'mix' ? 'en' : item.language, true);
            return matches.length > 0;
          },
        });

        const record = {
          id: item.id,
          split: item.split,
          fileName: item.fileName,
          language: item.language,
          noiseLevel: audioSource === 'human-recorded' ? item.noiseLevel : 'clean',
          speaker: item.speaker,
          audioSource,
          speechDurationMs: stt.speechDurationMs,
          transcript: stt.transcript,
          detectedLanguageCode: stt.detectedLanguageCode,
          timeToFirstPartialMs: stt.timeToFirstPartialMs,
          timeToFinalMs: stt.timeToFinalMs,
          eosToFinalTranscriptMs: stt.eosToFinalTranscriptMs,
          eosToDangerAlertVisibleMs: stt.eosToDangerAlertVisibleMs,
          eosToAlertAudioStartMs: stt.eosToAlertAudioStartMs,
          error: null,
        };
        entryMap.set(item.id, record);
        ranCount += 1;
        console.log(`[${i + 1}/${selected.length}] ${item.split.toUpperCase()} ${item.id}: EoS=${stt.eosToFinalTranscriptMs ?? '?'}ms (speak=${stt.speechDurationMs}ms) "${stt.transcript}"`);
      } catch (err) {
        entryMap.set(item.id, {
          id: item.id,
          split: item.split,
          fileName: item.fileName,
          language: item.language,
          noiseLevel: audioSource === 'human-recorded' ? item.noiseLevel : 'clean',
          speaker: item.speaker,
          audioSource: audioSource || 'unknown',
          transcript: '',
          detectedLanguageCode: null,
          timeToFirstPartialMs: null,
          timeToFinalMs: null,
          eosToFinalTranscriptMs: null,
          eosToDangerAlertVisibleMs: null,
          eosToAlertAudioStartMs: null,
          error: err instanceof Error ? err.message : String(err),
        });
        console.error(`[${i + 1}/${selected.length}] ${item.id} FAILED: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const allEntries = manifest.utterances.map((u) => entryMap.get(u.id)).filter(Boolean);
    const payload = {
      generatedAt: new Date().toISOString(),
      target: remoteBaseUrl || 'local-server',
      audioSources: {
        humanRecorded: allEntries.filter((e) => e.audioSource === 'human-recorded').length,
        timbreSynthesizedBaseline: allEntries.filter((e) => e.audioSource !== 'human-recorded').length,
        missingAudioFiles: manifest.utterances.length - allEntries.length,
      },
      timbreMeasurements: existing.timbreMeasurements || [],
      entries: allEntries,
    };
    fs.writeFileSync(fixturesPath, JSON.stringify(payload, null, 2) + '\n');
    console.log(`Saved ${allEntries.length} total fixtures (${ranCount} updated this run) to tests/corpus/fixtures/gnani_transcripts.json`);
  }
} finally {
  if (localServer) await new Promise((resolve) => localServer.close(() => resolve()));
}
