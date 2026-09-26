import type { GitCommit } from './types';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(cmd, args);
}

export async function scanCommits(repoPath: string, since?: string): Promise<GitCommit[]> {
  return invoke<GitCommit[]>('git_scan_commits', { repoPath, since: since ?? null });
}

export async function fetchRemote(owner: string, repo: string, token: string, since?: string): Promise<GitCommit[]> {
  return invoke<GitCommit[]>('git_fetch_remote', { owner, repo, token, since: since ?? null });
}

export function parseCommitMessage(msg: string): { taskIds: string[]; action: 'fixes' | 'refs' | null } {
  const fixesPattern = /\b(?:fix(?:es)?|close(?:s)?|resolve(?:s)?)\s+#([\w-]+)/gi;
  const refPattern = /(?<!\w)#([\w-]+)/gi;

  const taskIds: string[] = [];
  let action: 'fixes' | 'refs' | null = null;

  let match: RegExpExecArray | null;
  while ((match = fixesPattern.exec(msg)) !== null) {
    if (!taskIds.includes(match[1])) taskIds.push(match[1]);
    action = 'fixes';
  }

  if (taskIds.length === 0) {
    while ((match = refPattern.exec(msg)) !== null) {
      if (!taskIds.includes(match[1])) taskIds.push(match[1]);
      action = 'refs';
    }
  }

  return { taskIds, action };
}
