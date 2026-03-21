import fetch from 'node-fetch';

export async function mistralRespond({ apiKey, baseUrl, model, system, user }) {
  if (!apiKey) throw new Error('MISTRAL_API_KEY missing');
  const url = (baseUrl || 'https://api.mistral.ai').replace(/\/$/, '') + '/v1/chat/completions';

  const messages = [
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
      model: model || 'mistral-large-latest',
      messages,
      temperature: 0.2
    })
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `Mistral error ${res.status}`;
    throw new Error(msg);
  }

  return json?.choices?.[0]?.message?.content ?? JSON.stringify(json);
}
