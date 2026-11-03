// BATON — Gemini 중계 함수 (Vercel Serverless, Node 18+)
// API 키는 환경변수 GEMINI_API_KEY 에만 둔다. 모델은 GEMINI_MODEL 로 바꿀 수 있다.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PROMPTS = require('./_prompts.json');
const MAX_INPUT = 40000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'GEMINI_API_KEY is not set' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch { body = {}; }
  }
  const { kind, input } = body || {};
  const system = PROMPTS[kind];
  if (!system || typeof input !== 'string' || !input.trim() || input.length > MAX_INPUT) {
    res.status(400).json({ error: 'bad request' });
    return;
  }

  // 모델을 순서대로 시도한다. 무료 등급은 모델마다 하루 한도가 작아(예: 20회) 429/503/404면 다음 모델로 넘긴다.
  // gemini-2.5-flash는 새 키에서 더 이상 제공되지 않는다(404). GEMINI_MODEL=a,b,c 로 바꿀 수 있다.
  const models = (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite,gemini-flash-lite-latest,gemini-3.5-flash')
    .split(',').map((m) => m.trim()).filter(Boolean);
  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: input }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
  });
  let upstream = null;
  let lastStatus = 0;
  for (const model of models) {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
      { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: payload },
    );
    if (r.ok && r.body) { upstream = r; break; }
    lastStatus = r.status;
    if (![404, 429, 500, 503].includes(r.status)) break;
  }
  if (!upstream) {
    res.status(502).json({ error: `Gemini ${lastStatus}` });
    return;
  }

  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      try {
        const json = JSON.parse(line.slice(5));
        const text = (json.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
        if (text) res.write(text);
      } catch {
        // 불완전한 SSE 줄은 건너뛴다
      }
    }
  }
  res.end();
}
