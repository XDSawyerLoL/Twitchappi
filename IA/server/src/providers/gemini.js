import fetch from 'node-fetch';

export async function geminiRespond({ apiKey, baseUrl, model, system, user }) {
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');
  // Default base URL for Google AI Studio Gemini REST.
  const root = (baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  const m = model || 'gemini-1.5-pro';
  const url = `${root}/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const parts = [];
  if (system) parts.push({ text: system + "\n" });
  parts.push({ text: user });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.2 }
    })
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `Gemini error ${res.status}`;
    throw new Error(msg);
  }

  const text = json?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '';
  return text || JSON.stringify(json);
}
