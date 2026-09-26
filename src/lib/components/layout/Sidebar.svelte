<script lang="ts">
/**
 * Sidebar — 应用侧边栏组件
 *
 * 提供项目管理和导航的核心界面，包含：
 * - 项目列表（选择、创建、删除）
 * - 新建项目表单（名称、描述、模板、颜色选择）
 * - 导出功能（.pm / Markdown / HTML）
 * - 导入 .pm 文件和加载 Demo
 * - 状态筛选（全部/待办/进行中/已完成）
 * - 教程入口
 *
 * @example
 * <Sidebar />
 */

  import { get } from 'svelte/store';
  import { projects, activeProject, activeProjectId, createProject, deleteProject, downloadPmFile, importProject, exportMarkdownFile, exportHtmlFile, exportHtmlAsFile, exportPdfFile, pendingAction, showSidebar, showSettings, updateProjectFileTree, updateProject, reorderProject } from '$lib/stores';
  import { sortable, type DropTarget } from '$lib/actions/sortable';
  import { resolveInsertIndex } from '$lib/utils/reorder-target';
  import { pickFile } from '$lib/utils/pick-file';
  import { getTemplateNames } from '$lib/templates';
  import type { TemplateName, ProjectStorage } from '$lib/types';
  import { pickDirectory } from '$lib/repositories';
  import { generateReport, saveReport } from '$lib/ai';
  import Icon from '$lib/components/shared/Icon.svelte';
  import { t, tf } from '$lib/i18n';
  import { animationLevel } from '$lib/stores/animation';
  import { fade, scale } from 'svelte/transition';
  import ColorPicker from '$lib/components/shared/ColorPicker.svelte';
  import { colorScheme } from '$lib/stores/color';
  import { showFlowchart } from '$lib/stores';
  import { ownerMarks } from '$lib/stores/storage-health';
  import { getDeviceId } from '$lib/utils/device';

  /**
   * 本项目是否由「别的设备」管理本地文件夹；是则返回对方的可读名。
   *
   * 仅当 storage 为本地文件夹、且 ownerDeviceId 不是本机时返回；
   * 无 ownerDeviceId（尚未写入）或就是本机 → null。
   */
  function ownerBadgeName(project: { id: string; storage?: ProjectStorage }): string | null {
    const s = project.storage;
    if (!s || s.type !== 'local' || !s.ownerDeviceId) return null;
    if (s.ownerDeviceId === getDeviceId()) return null;
    return s.ownerDeviceName || $ownerMarks[project.id]?.ownerName || s.ownerDeviceId.slice(0, 8);
  }

  let showNew = $state(false);
  let newName = $state('');
  let newDesc = $state('');
  let newColor = $state('#4f46e5');
  let newTemplate = $state<TemplateName>('default');
  let storageType = $state<'app' | 'local' | 'server'>('app');
  let storagePath = $state('');
  let storageUrl = $state('');
  let newStartDate = $state('');
  let newEndDate = $state('');
  let confirmDeleteId = $state<string | null>(null);
  let showExportMenu = $state(false);
  let projectSearch = $state('');
  const tplOptions = getTemplateNames();

  /** 搜索过滤后的项目列表（渲染顺序与拖拽下标都基于它） */
  let filteredProjects = $derived.by(() => {
    const q = projectSearch.trim().toLowerCase();
    return q ? $projects.filter(p => p.name.toLowerCase().includes(q)) : $projects;
  });

  /**
   * 项目拖拽落位
   *
   * `fromDomIndex` 是**可见列表**里的下标；搜索过滤时与 `$projects` 的全量下标不同，
   * 所以用「目标位置后面那一个项目的 id」当锚点，再换算回全量下标。
   */
  function onDropProject(fromDomIndex: number, target: DropTarget, fromId: string) {
    const visible = filteredProjects;
    const movedId = fromId || visible[fromDomIndex]?.id;
    if (!movedId) return;
    const all = $projects;
    const fromAll = all.findIndex(p => p.id === movedId);
    if (fromAll === -1) return;
    const toAll = resolveInsertIndex(all, visible, movedId, target.index);
    if (toAll < 0 || toAll === fromAll) return;
    reorderProject(fromAll, toAll);
  }

  // 监听命令面板触发的待执行动作
  $effect(() => {
    const action = $pendingAction;
    if (!action) return;
    pendingAction.set(null);
    if (action === 'new-project') {
      showNew = true;
    } else if (action === 'import-project') {
      handleImport();
    }
  });

  function addProject() {
    console.log('[Modal] addProject called, name:', newName, 'template:', newTemplate, 'color:', newColor, 'storageType:', storageType);
    if (!newName.trim()) {
      console.warn('[Modal] Project name is empty, aborting');
      return;
    }
    let storage: ProjectStorage | undefined;
    if (storageType === 'local' && storagePath) {
      storage = { type: 'local', path: storagePath };
      console.log('[Modal] Storage: local folder ->', storagePath);
    } else if (storageType === 'server' && storageUrl) {
      storage = { type: 'server', url: storageUrl };
      console.log('[Modal] Storage: server ->', storageUrl);
    } else {
      console.log('[Modal] Storage: app internal');
    }
    createProject(newName.trim(), newDesc.trim(), newColor, newTemplate, storage, newStartDate || undefined, newEndDate || undefined);
    const createdId = get(activeProjectId);
    console.log('[Modal] Project created with ID:', createdId);
    // "默认"模板 + 本地路径：异步扫描真实目录结构
    if (newTemplate === 'default' && storageType === 'local' && storagePath && createdId) {
      console.log('[Modal] Default template + local path, triggering file tree scan...');
      updateProjectFileTree(createdId);
    }
    newName = ''; newDesc = ''; storagePath = ''; storageUrl = ''; storageType = 'app';
    showNew = false;
    console.log('[Modal] Modal closed, state reset');
  }

  async function handlePickFolder() {
    const dir = await pickDirectory();
    if (dir) storagePath = dir;
  }

  function handleDelete(e: MouseEvent, id: string) {
    e.stopPropagation();
    if (confirmDeleteId === id) { deleteProject(id); confirmDeleteId = null; }
    else { confirmDeleteId = id; setTimeout(() => confirmDeleteId = null, 3000); }
  }

  async function doExport(fmt: 'pm' | 'md' | 'html' | 'html-save' | 'pdf' | 'report') {
    if (!$activeProjectId) return;
    showExportMenu = false;
    if (fmt === 'pm') downloadPmFile($activeProjectId);
    else if (fmt === 'md') exportMarkdownFile($activeProjectId);
    else if (fmt === 'html') await exportHtmlFile($activeProjectId);
    else if (fmt === 'html-save') await exportHtmlAsFile($activeProjectId);
    else if (fmt === 'pdf') await exportPdfFile($activeProjectId);
    else if (fmt === 'report') await handleGenerateReport();
  }

  async function handleGenerateReport() {
    const proj = get(activeProject);
    if (!proj) return;
    try {
      const tasksText = proj.tasks.map(t => `- [${t.status}] ${t.title}${t.description ? ': ' + t.description : ''}`).join('\n');
      const milestonesText = proj.milestones?.map(m => `- ${m.title}${m.date ? ' (' + m.date + ')' : ''}`).join('\n') || get(t)('common.none');
      const html = await generateReport({
        name: proj.name,
        description: proj.description || '',
        created_at: proj.created_at,
        updated_at: proj.updated_at,
        tasks: tasksText,
        milestones: milestonesText,
        taskCount: String(proj.tasks.length),
      });
      const path = await saveReport(proj.name, html);
      console.log('[Sidebar] Report saved to:', path);
    } catch (e: any) {
      console.error('[Sidebar] Report generation failed:', e);
    }
  }

  function handleExportClick(e: MouseEvent) {
    e.stopPropagation();
    showExportMenu = !showExportMenu;
  }

  function closeExportMenu() {
    showExportMenu = false;
  }

  $effect(() => {
    if (!showExportMenu) return;
    const handler = () => showExportMenu = false;
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  });

  async function handleImport() {
    const file = await pickFile('.pm,.json');
    if (!file) return;
    const text = await file.text();
    importProject(text, file.name);
  }


</script>

<aside class="sidebar" class:open={$showSidebar}>
  <div class="sidebar-header">
    <span>ProjectManager</span>
    <button class="sidebar-close-btn-mobile" onclick={() => showSidebar.set(false)} aria-label="关闭菜单">✕</button>
  </div>

  <div class="sidebar-new">
    <button class="btn btn-dashed" onclick={() => { console.log('[Modal] Open button clicked'); showNew = true; }}>{$t('sidebar.newProject')}</button>
  </div>

  <!-- 仪表盘入口 -->
  <button class="dashboard-entry" class:active={!$activeProjectId} onclick={() => { activeProjectId.set(null); showSidebar.set(false); }}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
    <span>仪表盘</span>
  </button>

  <!-- 项目搜索 -->
  <div class="project-search">
    <input class="search-input" type="text" placeholder={$t('sidebar.searchProject')} bind:value={projectSearch} />
  </div>

  <div
    class="project-list"
    use:sortable={{
      handle: '.drag-handle',
      axis: 'y' as const,
      onDrop: onDropProject
    }}
  >
    {#each filteredProjects as project (project.id)}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div
        class="project-item"
        class:active={$activeProjectId === project.id}
        role="button"
        tabindex="0"
        data-sortable-item
        data-sortable-id={project.id}
        onclick={() => { activeProjectId.set(project.id); showSidebar.set(false); }}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activeProjectId.set(project.id); showSidebar.set(false); } }}
      >
        <!-- 拖动抓手（触摸端必须按住它才能拖，避免劫持页面滚动） -->
        <span class="drag-handle" title={$t('drag.handle')} aria-hidden="true">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/>
            <circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/>
            <circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/>
          </svg>
        </span>
        <span class="dot" style="background:{project.color}"></span>
        <span class="project-name">{project.name}</span>
        {#if ownerBadgeName(project)}
          <span class="owner-badge" title={$t('storage.ownerBadgeHint')} aria-label={$tf('storage.ownerBadge', { name: ownerBadgeName(project) ?? '' })}>🔒</span>
        {/if}
        <span class="count">{project.tasks.length}</span>
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <span class="sync-toggle" role="button" tabindex="0" title="云同步开关" onclick={(e) => { e.stopPropagation(); updateProject(project.id, { sync_enabled: !(project.sync_enabled !== false) }); }}>
          {#if project.sync_enabled !== false}☁️{:else}🚫{/if}
        </span>
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <span class="delete-btn" role="button" tabindex="0" aria-label={$t('detail.deleteTask')} onclick={(e) => handleDelete(e, project.id)}>
          {#if confirmDeleteId === project.id}{$t('sidebar.confirm')}{:else}<Icon name="close" size={12} />{/if}
        </span>
      </div>
    {/each}
    {#if filteredProjects.length === 0}
      <div class="project-empty">{$t('sidebar.noProjectMatch')}</div>
    {/if}
  </div>

  <div class="sidebar-actions">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="export-wrap">
      <button class="action-btn" onclick={handleExportClick} disabled={!$activeProjectId}>{$t('sidebar.export')}</button>
      {#if showExportMenu}
        <div class="export-menu" onclick={e => e.stopPropagation()}>
          <button class="export-item" onclick={() => doExport('pm')}>.pm (JSON)</button>
          <button class="export-item" onclick={() => doExport('md')}>Markdown</button>
          <div class="export-sep"></div>
          <button class="export-item" onclick={() => doExport('html')}><Icon name="chart" size={13} /> {$t('export.report')}</button>
          <button class="export-item" onclick={() => doExport('html-save')}><Icon name="file" size={13} /> {$t('export.html')}</button>
          <button class="export-item" onclick={() => doExport('pdf')}><Icon name="printer" size={13} /> {$t('export.pdf')}</button>
          <div class="export-sep"></div>
          <button class="export-item" onclick={() => doExport('report')}><Icon name="sparkles" size={13} /> {$t('export.ai')}</button>
        </div>
      {/if}
    </div>
    <button class="action-btn" onclick={handleImport}>{$t('sidebar.import')}</button>
  </div>

  <!-- 流程图独立工具入口 -->
  <div class="flowchart-entry">
    <button class="flowchart-btn" onclick={() => { showFlowchart.set(true); showSidebar.set(false); }}>
      <span class="flowchart-btn-icon">◇</span>
      <span>流程图</span>
    </button>
  </div>
</aside>
{#if $showSidebar}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_interactive_supports_focus -->
  <div class="sidebar-overlay" onclick={() => showSidebar.set(false)} role="dialog" tabindex="-1"></div>
{/if}

<!-- 新建项目弹窗 -->
{#if showNew}
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events a11y_interactive_supports_focus -->
  <div
    class="modal-overlay"
    onclick={() => { console.log('[Modal] Overlay clicked, closing'); showNew = false; }}
    onkeydown={e => { if (e.key === 'Escape') { console.log('[Modal] Escape pressed, closing'); showNew = false; } }}
    role="dialog"
    aria-modal="true"
    aria-label={$t('sidebar.newProject')}
    transition:fade={{ duration: $animationLevel === 'rich' ? 200 : ($animationLevel === 'none' ? 0 : 120) }}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
    <div
      class="modal-card"
      onclick={e => e.stopPropagation()}
      transition:scale={{ duration: $animationLevel === 'rich' ? 200 : ($animationLevel === 'none' ? 0 : 120), start: 0.95 }}
    >
      <div class="modal-header">
        <span class="modal-title">{$t('sidebar.newProject')}</span>
        <button type="button" class="modal-close" onclick={() => { console.log('[Modal] Close button clicked'); showNew = false; }}>
          <Icon name="close" size={16} />
        </button>
      </div>

      <div class="modal-body">
        <label class="field-label" for="new-project-name">{$t('sidebar.projectName')}</label>
        <input id="new-project-name" class="input" placeholder={$t('sidebar.projectName')} bind:value={newName} oninput={() => console.log('[Modal] name changed:', newName)} />

        <label class="field-label" for="new-project-desc">{$t('sidebar.description')}</label>
        <input id="new-project-desc" class="input" placeholder={$t('sidebar.description')} bind:value={newDesc} oninput={() => console.log('[Modal] desc changed')} />

        <label class="field-label" for="new-project-template">{$t('sidebar.template')}</label>
        <select id="new-project-template" class="input" bind:value={newTemplate} onchange={() => console.log('[Modal] template changed to:', newTemplate)}>
          {#each tplOptions as tpl}
            <option value={tpl.value}>{tpl.label}</option>
          {/each}
        </select>

        <label class="field-label">{$t('sidebar.color')}</label>
        <div class="color-row">
          <ColorPicker value={newColor} size="sm" showName onselect={(c) => { newColor = c; }} />
        </div>

        <!-- 项目时间范围 -->
        <label class="field-label">项目时间范围</label>
        <div class="date-range">
          <div class="date-field">
            <span class="date-label">开始</span>
            <input class="input" type="date" bind:value={newStartDate} />
          </div>
          <span class="date-sep">→</span>
          <div class="date-field">
            <span class="date-label">结束</span>
            <input class="input" type="date" bind:value={newEndDate} />
          </div>
        </div>

        <label class="field-label">{$t('sidebar.storageTitle')}</label>
        <div class="storage-section">
          <div class="storage-options">
            <label class="storage-option" class:active={storageType === 'app'}>
              <input type="radio" name="storage" value="app" bind:group={storageType} />
              <span>{$t('sidebar.storageApp')}</span>
            </label>
            <label class="storage-option" class:active={storageType === 'local'}>
              <input type="radio" name="storage" value="local" bind:group={storageType} />
              <span>{$t('sidebar.storageLocal')}</span>
            </label>
            <label class="storage-option" class:active={storageType === 'server'}>
              <input type="radio" name="storage" value="server" bind:group={storageType} />
              <span>{$t('sidebar.storageServer')}</span>
            </label>
          </div>
          {#if storageType === 'local'}
            <div class="storage-path">
              <span class="path-text">{storagePath || $t('sidebar.storageNoPath')}</span>
              <button type="button" class="btn btn-ghost small" onclick={handlePickFolder}>{$t('sidebar.storageBrowse')}</button>
            </div>
          {:else if storageType === 'server'}
            <input class="input" placeholder="https://example.com/path" bind:value={storageUrl} />
          {/if}
        </div>
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" onclick={() => showNew = false}>{$t('sidebar.cancel')}</button>
        <button type="button" class="btn btn-primary" onclick={addProject}>{$t('sidebar.create')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .sidebar { width: 240px; height: 100%; display: flex; flex-direction: column; background: var(--sidebar); border-right: 1px solid var(--border); flex-shrink: 0; }
  .sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: 16px; font-size: 13px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); }
  .sidebar-new { padding: 12px; }
  .dashboard-entry {
    display: flex;
    align-items: center;
    gap: 8px;
    width: calc(100% - 16px);
    margin: 0 8px 4px;
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 500;
    border-radius: 8px;
    color: var(--text-secondary);
    background: transparent;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.12s;
  }
  .dashboard-entry:hover { background: var(--surface); color: var(--text); border-color: var(--border); }
  .dashboard-entry.active { background: var(--accent); color: #fff; border-color: var(--accent); }
  .dashboard-entry svg { flex-shrink: 0; }
  .input { width: 100%; padding: 8px 10px; font-size: 13px; border-radius: 6px; background: var(--bg); border: 1px solid var(--border); color: var(--text); }
  .input:focus { border-color: var(--accent); outline: none; }
  select.input { cursor: pointer; }
  .date-range { display: flex; align-items: center; gap: 8px; }
  .date-field { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .date-label { font-size: 10px; color: var(--text-muted); }
  .date-sep { font-size: 14px; color: var(--text-muted); margin-top: 14px; }
  .color-row { display: flex; gap: 6px; flex-wrap: wrap; }
  .storage-section { display: flex; flex-direction: column; gap: 6px; padding: 8px; background: var(--bg); border-radius: 6px; border: 1px solid var(--border); }
  .storage-options { display: flex; gap: 4px; }
  .storage-option { flex: 1; display: flex; align-items: center; gap: 4px; padding: 4px 6px; font-size: 12px; border-radius: 4px; background: var(--surface); color: var(--text-secondary); cursor: pointer; border: 1px solid transparent; }
  .storage-option.active { border-color: var(--accent); color: var(--accent); }
  .storage-option input { accent-color: var(--accent); }
  .storage-path { display: flex; align-items: center; gap: 4px; }
  .path-text { flex: 1; font-size: 11px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .btn.small { padding: 3px 10px; font-size: 11px; }
  .btn { padding: 8px 16px; font-size: 13px; border-radius: 6px; transition: all 0.15s; border: none; cursor: pointer; }
  .btn-primary { background: var(--accent); color: #fff; }
  .btn-primary:hover { opacity: 0.9; }
  .btn-ghost { background: var(--surface); color: var(--text-secondary); }
  .btn-ghost:hover { background: var(--border); }
  .btn-dashed { width: 100%; padding: 8px 12px; font-size: 13px; border-radius: 8px; border: 1px dashed var(--border); color: var(--text-secondary); text-align: left; background: none; cursor: pointer; }
  .btn-dashed:hover { border-color: var(--accent); color: var(--accent); }

  /* 新建项目弹窗 */
  .modal-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.45); }
  .modal-card { width: 420px; max-width: 90vw; max-height: 85vh; overflow-y: auto; background: var(--bg); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.3); display: flex; flex-direction: column; }
  .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); }
  .modal-title { font-size: 15px; font-weight: 600; }
  .modal-close { padding: 4px; border-radius: 6px; background: none; border: none; color: var(--text-muted); cursor: pointer; }
  .modal-close:hover { background: var(--surface); color: var(--text); }
  .modal-body { display: flex; flex-direction: column; gap: 12px; padding: 20px; }
  .field-label { font-size: 12px; font-weight: 500; color: var(--text-secondary); margin-bottom: -8px; }
  .modal-footer { display: flex; gap: 8px; justify-content: flex-end; padding: 14px 20px; border-top: 1px solid var(--border); }
  .modal-footer .btn { min-width: 90px; }
  .project-list { flex: 1; min-height: 0; overflow-y: auto; padding: 0 8px; }
  .project-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 12px; border-radius: 8px; font-size: 13px; color: var(--text); transition: background 0.15s; text-align: left; cursor: pointer; }
  .project-item:hover { background: var(--surface); }
  .project-item.active { background: var(--accent-light); color: var(--accent); }
  .project-empty { padding: 12px; font-size: 12px; color: var(--text-muted); text-align: center; }
  .drag-handle { display: flex; align-items: center; justify-content: center; width: 14px; flex-shrink: 0; color: var(--text-muted); opacity: 0; transition: opacity 0.15s; touch-action: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; cursor: grab; }
  .project-item:hover .drag-handle { opacity: 0.7; }
  .drag-handle:active { cursor: grabbing; }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .project-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .owner-badge { flex-shrink: 0; font-size: 11px; line-height: 1; opacity: 0.75; cursor: help; }
  .count { font-size: 11px; color: var(--text-muted); }
  .delete-btn { font-size: 11px; color: var(--text-muted); padding: 2px; opacity: 0; transition: opacity 0.15s; }
  .project-item:hover .delete-btn { opacity: 1; }
  .delete-btn:hover { color: var(--red); }
  .sidebar-actions { display: flex; gap: 6px; padding: 0 12px 12px; flex-shrink: 0; }
  .action-btn { flex: 1; padding: 6px; font-size: 11px; border-radius: 6px; background: var(--surface); color: var(--text-secondary); border: 1px solid var(--border); text-align: center; }
  .action-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .export-wrap { position: relative; flex: 1; }
  .export-wrap .action-btn { width: 100%; }
  .export-menu { position: absolute; bottom: 100%; left: 0; margin-bottom: 2px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.2); z-index: 10; min-width: 120px; padding: 4px 0; }
  .export-item { display: flex; align-items: center; gap: 6px; width: 100%; padding: 7px 12px; font-size: 12px; text-align: left; color: var(--text-secondary); }
  .export-item:hover { background: var(--surface); color: var(--accent); }
  .export-sep { height: 1px; margin: 4px 0; background: var(--border); }
  .project-search { padding: 4px 12px 8px; }
  .search-input { width: 100%; padding: 6px 10px; font-size: 12px; border-radius: 6px; background: var(--bg); border: 1px solid var(--border); color: var(--text); box-sizing: border-box; }
  .search-input:focus { border-color: var(--accent); outline: none; }
  .search-input::placeholder { color: var(--text-muted); }
  .flowchart-entry { padding: 6px 12px; flex-shrink: 0; }
  .flowchart-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    font-size: 13px;
    border-radius: 8px;
    background: var(--accent);
    color: #fff;
    cursor: pointer;
    border: none;
    transition: opacity 0.12s;
  }
  .flowchart-btn:hover { opacity: 0.9; }
  .flowchart-btn-icon { font-size: 16px; }
  .sidebar-overlay { display: none; }
  .sidebar-close-btn-mobile { display: none; padding: 2px 8px; font-size: 14px; border-radius: 6px; color: var(--text-muted); background: none; border: none; cursor: pointer; }
  .sidebar-close-btn-mobile:hover { background: var(--surface); color: var(--text); }

  @media (max-width: 768px) {
    .sidebar { position: fixed; left: 0; top: 0; bottom: 0; width: 75vw; max-width: 320px; z-index: 900; transform: translateX(-100%); transition: transform 0.2s ease; box-shadow: 4px 0 24px rgba(0,0,0,0.3); padding-top: env(safe-area-inset-top); }
    .sidebar.open { transform: translateX(0); }
    .sidebar-overlay { display: block; position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 899; }
    .sidebar-close-btn-mobile { display: block; }
    .sidebar-actions { flex-wrap: wrap; }
    .action-btn { min-width: 0; }
    /* 触摸端没有 hover，抓手常显 */
    .drag-handle { opacity: 0.55; }
  }
</style>
