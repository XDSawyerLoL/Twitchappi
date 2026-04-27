import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { nanoid } from 'nanoid';

import { JsonStore } from './lib/store.js';
import { llmRespond } from './providers/router.js';
import { generatePlan } from './ops/operator.js';
import { getOctokit, parseRepo, createBranch, upsertFile, openPullRequest } from './ops/github.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const store = new JsonStore(path.resolve(__dirname, '../../logs/state.json'));

function addRun(run) {
  store.update((s) => {
    s.runs.unshift(run);
    s.runs = s.runs.slice(0, 200);
    return s;
  });
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), build: process.env.BUILD_ID || null });
});

app.get('/api/supervision', (_req, res) => {
  const s = store.read();
  res.json({ runs: s.runs, settings: s.settings });
});

app.post('/api/settings', (req, res) => {
  const { defaultRepo, autopush } = req.body || {};
  const next = store.update((s) => {
    if (typeof defaultRepo === 'string') s.settings.defaultRepo = defaultRepo;
    if (typeof autopush === 'boolean') s.settings.autopush = autopush;
    return s;
  });
  res.json({ settings: next.settings });
});

app.post('/api/chat', async (req, res) => {
  const { message, mode } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message missing' });

  const runId = nanoid();
  const startedAt = Date.now();

  try {
    const reply = await llmRespond({
      system: 'You are ORYON Operator. Answer concisely and propose concrete next actions when relevant.',
      user: String(message),
      mode: mode === 'ensemble' ? 'ensemble' : 'single'
    });

    addRun({
      id: runId,
      type: 'chat',
      status: 'ok',
      startedAt,
      durationMs: Date.now() - startedAt,
      input: message,
      output: reply
    });

    res.json({ id: runId, reply });
  } catch (e) {
    addRun({
      id: runId,
      type: 'chat',
      status: 'error',
      startedAt,
      durationMs: Date.now() - startedAt,
      input: message,
      error: e?.message || String(e)
    });
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post('/api/ops/plan', async (req, res) => {
  const { task, repoContext, mode } = req.body || {};
  if (!task) return res.status(400).json({ error: 'task missing' });

  const runId = nanoid();
  const startedAt = Date.now();

  try {
    const plan = await generatePlan({ task, repoContext, mode: mode === 'ensemble' ? 'ensemble' : 'single' });
    addRun({
      id: runId,
      type: 'plan',
      status: 'ok',
      startedAt,
      durationMs: Date.now() - startedAt,
      input: { task },
      output: plan
    });
    res.json({ id: runId, plan });
  } catch (e) {
    addRun({
      id: runId,
      type: 'plan',
      status: 'error',
      startedAt,
      durationMs: Date.now() - startedAt,
      input: { task },
      error: e?.message || String(e)
    });
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.post('/api/ops/apply', async (req, res) => {
  const { repo, baseBranch, plan, openPR = true } = req.body || {};
  if (!repo) return res.status(400).json({ error: 'repo missing' });
  if (!plan?.changes) return res.status(400).json({ error: 'plan missing/invalid' });

  const runId = nanoid();
  const startedAt = Date.now();

  try {
    const { owner, repo: name } = parseRepo(repo);
    const octokit = getOctokit();

    const branchName = plan.branchName || `oryon/${nanoid(6)}`;
    await createBranch(octokit, { owner, repo: name, baseBranch: baseBranch || 'main', branchName });

    for (const ch of plan.changes) {
      await upsertFile(octokit, {
        owner,
        repo: name,
        branch: branchName,
        filePath: ch.path,
        content: ch.content,
        message: plan.commitMessage || `ORYON Operator update: ${ch.path}`
      });
    }

    let pr = null;
    if (openPR) {
      pr = await openPullRequest(octokit, {
        owner,
        repo: name,
        title: plan.commitMessage || 'ORYON Operator changes',
        body: plan.notes || '',
        head: branchName,
        base: baseBranch || 'main'
      });
    }

    addRun({
      id: runId,
      type: 'apply',
      status: 'ok',
      startedAt,
      durationMs: Date.now() - startedAt,
      input: { repo, baseBranch },
      output: { branchName, prUrl: pr?.html_url || null }
    });

    res.json({ id: runId, branchName, prUrl: pr?.html_url || null });
  } catch (e) {
    addRun({
      id: runId,
      type: 'apply',
      status: 'error',
      startedAt,
      durationMs: Date.now() - startedAt,
      input: { repo, baseBranch },
      error: e?.message || String(e)
    });
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// Serve web UI
const webDir = path.resolve(__dirname, '../../web');
app.use('/', express.static(webDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(webDir, 'index.html'));
});

const PORT = process.env.PORT || 8787;
const server = app.listen(PORT, () => {
  console.log(`ORYON Operator listening on http://localhost:${PORT}`);
});

// WebSocket chat relay (simple)
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.on('message', async (buf) => {
    let payload;
    try {
      payload = JSON.parse(buf.toString('utf-8'));
    } catch {
      ws.send(JSON.stringify({ type: 'error', error: 'invalid_json' }));
      return;
    }

    if (payload.type !== 'chat') return;
    const { message, mode } = payload;

    try {
      const reply = await llmRespond({
        system: 'You are ORYON Operator. Answer concisely and propose concrete next actions when relevant.',
        user: String(message || ''),
        mode: mode === 'ensemble' ? 'ensemble' : 'single'
      });
      ws.send(JSON.stringify({ type: 'chat.reply', reply }));
    } catch (e) {
      ws.send(JSON.stringify({ type: 'chat.error', error: e?.message || String(e) }));
    }
  });
});
