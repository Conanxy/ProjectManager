<script lang="ts">
  import { t } from '$lib/i18n';

  function safeGet(key: string): string { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } }
  function safeSet(key: string, val: string): void { try { localStorage.setItem(key, val); } catch {} }

  let gitToken = $state(safeGet('pm_git_token'));
  let gitRepo = $state(safeGet('pm_git_repo'));

  function saveGitSettings() {
    safeSet('pm_git_token', gitToken);
    safeSet('pm_git_repo', gitRepo);
  }
</script>

<div class="section">
  <span class="section-title">{$t('settings.githubToken')}</span>
  <input class="input" type="password" placeholder="ghp_xxx" bind:value={gitToken} oninput={saveGitSettings} />
</div>
<div class="section">
  <span class="section-title">{$t('settings.defaultRepo')}</span>
  <input class="input" placeholder="/path/to/repo" bind:value={gitRepo} oninput={saveGitSettings} />
</div>

<style>
  .section { display: flex; flex-direction: column; gap: 8px; }
  .section-title { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .input { width: 100%; padding: 8px 10px; font-size: 13px; border-radius: 6px; background: var(--surface); border: 1px solid var(--border); color: var(--text); }
  .input:focus { border-color: var(--accent); outline: none; }
</style>
