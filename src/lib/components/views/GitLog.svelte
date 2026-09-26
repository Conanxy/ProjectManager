<script lang="ts">
  import { t, locale } from '$lib/i18n';
  import { scanCommits, fetchRemote } from '$lib/git';
  import { toggleTaskStatus, activeProjectId, projects } from '$lib/stores';
  import { get } from 'svelte/store';
  import type { GitCommit } from '$lib/git/types';

  let commits = $state<GitCommit[]>([]);
  let repoPath = $state('');
  let owner = $state('');
  let repo = $state('');
  let token = $state('');
  let mode = $state<'local' | 'remote'>('local');
  let loading = $state(false);
  let error = $state('');

  const dateLocale = $derived($locale === 'zh' ? 'zh-CN' : 'en-US');

  async function handleScan() {
    loading = true; error = '';
    try {
      if (mode === 'local') {
        commits = await scanCommits(repoPath);
      } else {
        commits = await fetchRemote(owner, repo, token);
      }
      // Auto-mark tasks for "fixes" commits
      const pid = get(activeProjectId);
      if (pid) {
        for (const c of commits) {
          if (c.action === 'fixes') {
            for (const taskId of c.task_ids) {
              toggleTaskStatus(pid, taskId);
            }
          }
        }
      }
    } catch (e: any) {
      error = e?.message ?? String(e);
    }
    loading = false;
  }
</script>

<div class="git-view">
  <div class="git-header">
    <h3 class="git-title">{$t('git.title')}</h3>
  </div>

  <div class="git-config">
    <div class="btn-row">
      <button class="btn-toggle" class:active={mode === 'local'} onclick={() => mode = 'local'}>{$t('git.local')}</button>
      <button class="btn-toggle" class:active={mode === 'remote'} onclick={() => mode = 'remote'}>GitHub</button>
    </div>

    {#if mode === 'local'}
      <input class="input" placeholder={$t('git.repoPath')} bind:value={repoPath} />
    {:else}
      <div class="remote-row">
        <input class="input" placeholder={$t('git.owner')} bind:value={owner} />
        <input class="input" placeholder={$t('git.repo')} bind:value={repo} />
      </div>
      <input class="input" type="password" placeholder="GitHub Token" bind:value={token} />
    {/if}

    <button class="btn btn-primary" onclick={handleScan} disabled={loading}>
      {loading ? $t('git.scanning') : $t('git.scan')}
    </button>
  </div>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  <div class="commit-list">
    {#each commits as c (c.hash)}
      <div class="commit-item">
        <div class="commit-hash">{c.hash.substring(0, 7)}</div>
        <div class="commit-body">
          <p class="commit-msg">{c.message}</p>
          <div class="commit-meta">
            <span class="commit-author">{c.author}</span>
            <span class="commit-date">{new Date(c.date).toLocaleString(dateLocale)}</span>
          </div>
          {#if c.task_ids.length > 0}
            <div class="commit-tasks">
              {#each c.task_ids as tid}
                {@const task = $projects.flatMap(p => p.tasks).find(t => t.id === tid)}
                <span class="task-tag" class:fixes={c.action === 'fixes'}>
                  {c.action === 'fixes' ? '&#10003;' : '#'} {task?.title ?? tid}
                </span>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {:else}
      <p class="empty">{$t('git.noCommits')}</p>
    {/each}
  </div>
</div>

<style>
  .git-view { flex: 1; overflow-y: auto; padding: 24px; }
  .git-header { margin-bottom: 16px; }
  .git-title { font-size: 18px; font-weight: 600; }
  .git-config { display: flex; flex-direction: column; gap: 8px; padding: 16px; background: var(--sidebar); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 16px; }
  .btn-row { display: flex; gap: 6px; }
  .btn-toggle { flex: 1; padding: 7px; font-size: 12px; border-radius: 6px; background: var(--surface); color: var(--text-secondary); border: 1px solid var(--border); }
  .btn-toggle.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  .input { width: 100%; padding: 8px 10px; font-size: 13px; border-radius: 6px; background: var(--surface); border: 1px solid var(--border); color: var(--text); }
  .input:focus { border-color: var(--accent); outline: none; }
  .remote-row { display: flex; gap: 8px; }
  .remote-row .input { flex: 1; min-width: 0; }
  .btn { padding: 8px; font-size: 13px; border-radius: 6px; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover { opacity: 0.9; }
  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
  .error { font-size: 12px; color: var(--red); padding: 8px 12px; background: rgba(239,68,68,0.1); border-radius: 6px; margin-bottom: 12px; }
  .commit-list { display: flex; flex-direction: column; gap: 8px; }
  .commit-item { display: flex; gap: 12px; padding: 12px; background: var(--sidebar); border: 1px solid var(--border); border-radius: 8px; }
  .commit-hash { font-family: monospace; font-size: 12px; color: var(--accent); flex-shrink: 0; padding-top: 2px; }
  .commit-body { flex: 1; min-width: 0; }
  .commit-msg { font-size: 13px; font-weight: 500; margin: 0 0 4px; }
  .commit-meta { display: flex; gap: 12px; font-size: 11px; color: var(--text-muted); }
  .commit-tasks { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .task-tag { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: var(--accent-light); color: var(--accent); }
  .task-tag.fixes { background: rgba(16,185,129,0.15); color: var(--green); }
  .empty { font-size: 13px; color: var(--text-muted); text-align: center; padding: 32px; }

  @media (max-width: 768px) {
    .git-view { padding: 12px; }
    .remote-row { flex-direction: column; }
  }
</style>
