import { Octokit } from '@octokit/rest';

export function getOctokit() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN missing');
  return new Octokit({ auth: token });
}

export function parseRepo(repo) {
  const [owner, name] = (repo || '').split('/');
  if (!owner || !name) throw new Error('repo must be "owner/name"');
  return { owner, repo: name };
}

export async function createBranch(octokit, { owner, repo, baseBranch = 'main', branchName }) {
  const base = await octokit.repos.getBranch({ owner, repo, branch: baseBranch });
  const sha = base.data.commit.sha;
  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha
  });
  return { sha };
}

export async function upsertFile(octokit, { owner, repo, branch, filePath, content, message }) {
  let existingSha = undefined;
  try {
    const existing = await octokit.repos.getContent({ owner, repo, path: filePath, ref: branch });
    if (existing?.data?.sha) existingSha = existing.data.sha;
  } catch {
    // not found
  }

  const b64 = Buffer.from(content, 'utf-8').toString('base64');
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message,
    content: b64,
    branch,
    sha: existingSha
  });
}

export async function openPullRequest(octokit, { owner, repo, title, body, head, base }) {
  const pr = await octokit.pulls.create({ owner, repo, title, body, head, base });
  return pr.data;
}
