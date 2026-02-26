import fetch from 'node-fetch';

export async function openaiRespond({ apiKey, baseUrl, model, system, user }) {
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');
  const url = (baseUrl || 'https://api.openai.com').replace(/\/$/, '') + '/v1/responses';

  const input = [
    ...(system ? [{ role: 'system', content: system }] : []),
    { role: 'user', content: user }
  ];

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model || 'gpt-4.1-mini',
      input
    })
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `OpenAI error ${res.status}`;
    throw new Error(msg);
  }

  // Try to extract text from various response shapes.
  const out = [];
  const output = json.output || [];
  for (const item of output) {
    const content = item?.content || [];
    for (const c of content) {
      if (c?.type === 'output_text' && typeof c.text === 'string') out.push(c.text);
      if (c?.type === 'text' && typeof c.text === 'string') out.push(c.text);
    }
  }
  if (out.length) return out.join('\n');
  if (typeof json?.output_text === 'string') return json.output_text;
  return JSON.stringify(json);
}
