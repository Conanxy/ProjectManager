<script lang="ts">
  import { activeProject, activeTask, updateTask } from '$lib/stores';
  import { scanCommits } from '$lib/git';
  import type { GitCommit } from '$lib/git/types';
  import { t } from '$lib/i18n';

  let gitRepoPath = $state('');
  let gitCommits = $state<GitCommit[]>([]);
  let gitLoading = $state(false);

  function handleLinkRepo() {
    if (!$activeProject || !$activeTask || !gitRepoPath.trim()) return;
    updateTask($activeProject.id, $activeTask.id, { git_repo_path: gitRepoPath.trim() });
    gitRepoPath = '';
  }

  function handleUnlinkRepo() {
    if ($activeProject && $activeTask) updateTask($activeProject.id, $activeTask.id, { git_repo_path: undefined });
  }

  async function handleScanGit() {
    if (!$activeTask?.git_repo_path) return;
    gitLoading = true;
    try {
      const allCommits = await scanCommits($activeTask.git_repo_path);
      gitCommits = allCommits.filter(c => c.task_ids.includes($activeTask!.id));
    } catch { gitCommits = []; }
    gitLoading = false;
  }
</script>

{#if $activeTask}
  <span class="label">{$t('git.linkRepo')}</span>
  {#if $activeTask.git_repo_path}
    <div class="git-linked">
      <span class="git-path">{$activeTask.git_repo_path}</span>
      <button class="git-unlink" onclick={handleUnlinkRepo}>{$t('git.removeLink')}</button>
    </div>
    <button class="git-scan-btn" onclick={handleScanGit} disabled={gitLoading}>
      {gitLoading ? $t('git.scanning') : $t('git.scan')}
    </button>
    {#if gitCommits.length > 0}
      <div class="git-commits">
        {#each gitCommits as c (c.hash)}
          <div class="git-commit-item">
            <span class="git-commit-hash">{c.hash.substring(0, 7)}</span>
            <span class="git-commit-msg">{c.message}</span>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <div class="git-link-add">
      <input class="input" placeholder={$t('git.repoPath')} bind:value={gitRepoPath} />
      <button class="git-link-btn" onclick={handleLinkRepo} disabled={!gitRepoPath.trim()}>+</button>
    </div>
  {/if}
{/if}

<style>
  .label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: -8px; }
  .input { width: 100%; padding: 8px 10px; font-size: 13px; border-radius: 6px; background: var(--surface); border: 1px solid var(--border); color: var(--text); }
  .git-linked { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; }
  .git-path { font-size: 12px; font-family: monospace; color: var(--accent); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .git-unlink { font-size: 11px; color: var(--text-muted); }
  .git-unlink:hover { color: var(--red); }
  .git-scan-btn { padding: 6px 12px; font-size: 12px; border-radius: 6px; background: var(--surface); color: var(--text-secondary); border: 1px solid var(--border); }
  .git-scan-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .git-scan-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .git-commits { display: flex; flex-direction: column; gap: 4px; }
  .git-commit-item { display: flex; gap: 8px; padding: 4px 8px; border-radius: 4px; background: var(--surface); font-size: 11px; }
  .git-commit-hash { font-family: monospace; color: var(--accent); flex-shrink: 0; }
  .git-commit-msg { color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .git-link-add { display: flex; gap: 4px; }
  .git-link-add .input { flex: 1; }
  .git-link-btn { padding: 5px 10px; font-size: 12px; border-radius: 6px; background: var(--accent); color: #fff; }
  .git-link-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
