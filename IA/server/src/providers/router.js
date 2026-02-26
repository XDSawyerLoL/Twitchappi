import { openaiRespond } from './openai.js';
import { mistralRespond } from './mistral.js';
import { geminiRespond } from './gemini.js';

function normalizeProviderList(str) {
  if (!str) return ['openai'];
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

async function callProvider(name, { system, user }) {
  if (name === 'openai') {
    return openaiRespond({
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL,
      model: process.env.OPENAI_MODEL,
      system,
      user
    });
  }
  if (name === 'mistral') {
    return mistralRespond({
      apiKey: process.env.MISTRAL_API_KEY,
      baseUrl: process.env.MISTRAL_BASE_URL,
      model: process.env.MISTRAL_MODEL,
      system,
      user
    });
  }
  if (name === 'gemini') {
    return geminiRespond({
      apiKey: process.env.GEMINI_API_KEY,
      baseUrl: process.env.GEMINI_BASE_URL,
      model: process.env.GEMINI_MODEL,
      system,
      user
    });
  }
  throw new Error(`Unknown provider: ${name}`);
}

export async function llmRespond({ system, user, mode = 'single' }) {
  const providers = normalizeProviderList(process.env.OPERATOR_PROVIDERS);

  if (mode === 'ensemble') {
    const results = await Promise.allSettled(
      providers.map(p => callProvider(p, { system, user }))
    );

    const ok = results
      .map((r, idx) => ({ r, p: providers[idx] }))
      .filter(x => x.r.status === 'fulfilled')
      .map(x => ({ provider: x.p, text: x.r.value }));

    if (!ok.length) {
      const errs = results
        .map((r, idx) => `${providers[idx]}: ${r.status === 'rejected' ? r.reason?.message : 'ok'}`)
        .join(' | ');
      throw new Error(`All providers failed: ${errs}`);
    }

    const mergedPrompt = ok
      .map(x => `### ${x.provider.toUpperCase()}\n${x.text}`)
      .join('\n\n');

    const synthProvider = process.env.OPENAI_API_KEY ? 'openai' : ok[0].provider;
    return callProvider(synthProvider, {
      system: 'You are an expert software operator. Merge the following model outputs into one best answer. Keep it concise, actionable, and consistent.',
      user: mergedPrompt
    });
  }

  const first = providers[0];
  return callProvider(first, { system, user });
}
