<script lang="ts">
/**
 * ProjectInfo — 项目概览视图
 *
 * 展示项目的综合信息和管理功能：
 * - 项目基本信息（模板、创建/更新时间、任务统计）
 * - 工时统计（已完成工时、计时中任务数、条形图对比）
 * - 标签列表（彩色徽章展示）
 * - 变更日志（时间线样式）
 * - 里程碑管理（创建/删除，按日期排序，菱形标记）
 *
 * @example
 * <ProjectInfo />
 */

  import { activeProject, activeTaskId, createMilestone, updateMilestone, deleteMilestone, updateProject, addVersionEntry, renumberChangelog } from '$lib/stores';
  import type { ChangelogEntry } from '$lib/types';
  import { formatDuration, formatDurationHMS, formatMs } from '$lib/utils/date';
  import { createTicker } from '$lib/utils/live-duration';
  import { INITIAL_VERSION, MANUAL_BUMPS, bumpVersion, isLegacyChangelog, parseVersion, versionGroup, versionGroupLabel, type VersionBump } from '$lib/utils/version';
  import Icon from '$lib/components/shared/Icon.svelte';
  import { t, tf, locale } from '$lib/i18n';

  /** 只要有正在计时的任务就每秒刷新（页面不可见时自动暂停） */
  const ticker = createTicker(() => ($activeProject?.tasks ?? []).some(t => t.tracked_start && t.status !== 'done'));

  const tplLabels: Record<string, string> = $derived({
    default: $t('template.default'), electron: $t('template.electron'), hardware: $t('template.hardware'), web: $t('template.web')
  });

  const dateLocale = $derived($locale === 'zh' ? 'zh-CN' : 'en-US');

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString(dateLocale, { year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  function todayDate() { return new Date().toISOString().slice(0, 10); }
  function fmtDateTime(d: string) {
    return new Date(d).toLocaleString(dateLocale);
  }

  // 编辑起止日期
  let editDates = $state(false);
  let editStart = $state('');
  let editEnd = $state('');

  function toggleDateEdit() {
    if ($activeProject) {
      editStart = $activeProject.start_date || '';
      editEnd = $activeProject.end_date || '';
    }
    editDates = !editDates;
  }

  function saveDates() {
    if (!$activeProject) return;
    updateProject($activeProject.id, {
      start_date: editStart || undefined,
      end_date: editEnd || undefined,
    });
    editDates = false;
  }

  // 统计任务状态
  let showMsForm = $state(false);
  let msTitle = $state('');
  let msDate = $state('');
  let msColor = $state('#f59e0b');
  let msDesc = $state('');

  function addMilestone() {
    if (!$activeProject || !msTitle.trim() || !msDate) return;
    createMilestone($activeProject.id, msTitle.trim(), msDate, msColor);
    msTitle = ''; msDate = ''; msDesc = ''; showMsForm = false;
  }
  function rmMilestone(id: string) {
    if ($activeProject) deleteMilestone($activeProject.id, id);
  }

  const msColors = ['#f59e0b','#ef4444','#10b981','#3b82f6','#8b5cf6','#ec4899','#06b6d4'];

  // ── 变更日志：手动记版本 + 按大小版本折叠 ────────────────────────────────
  /** 当前展开的「记版本」表单（null = 不展开） */
  /** 手动版本只有两种：小版本（B+1）/ 大版本（A+1）—— C 位由软件自动递增 */
  type ManualBump = Exclude<VersionBump, 'patch'>;
  let verForm = $state<ManualBump | null>(null);
  let verInfo = $state('');
  /** 分组折叠状态覆盖：key = 'major.minor'，未记录时用默认（最新一组展开、其余折叠） */
  let groupOverride = $state<Record<string, boolean>>({});
  /** 当前最新版本（变更日志是追加的，取最后一条） */
  const latestVersion = $derived(
    $activeProject?.changelog?.length
      ? $activeProject.changelog[$activeProject.changelog.length - 1].version
      : INITIAL_VERSION
  );

  /** 表单里预览的新版本号 */
  const verPreview = $derived(verForm ? bumpVersion(latestVersion, verForm) : '');

  /**
   * 变更日志按 `major.minor` 分组（新的在前，组内也新的在前）
   *
   * 分组键用版本字符串算出来而非下标，所以导入的 .pm、旧数据（1.0.x）都能正确分组。
   */
  const changelogGroups = $derived.by(() => {
    const list: ChangelogEntry[] = $activeProject?.changelog ?? [];
    const map = new Map<string, ChangelogEntry[]>();
    for (const entry of list) {
      const key = versionGroup(entry.version);
      const bucket = map.get(key);
      if (bucket) bucket.push(entry);
      else map.set(key, [entry]);
    }
    return [...map.entries()]
      .map(([key, entries]) => {
        const dates = entries.map(e => e.date).filter(Boolean).sort();
        return {
          key,
          label: versionGroupLabel(key),
          // 组内按版本号倒序（不依赖写入顺序，导入数据也不会乱）
          entries: [...entries].sort((a, b) => {
            const pa = parseVersion(a.version);
            const pb = parseVersion(b.version);
            return pb.patch - pa.patch || pb.minor - pa.minor || pb.major - pa.major;
          }),
          oldest: dates[0] ?? '',
          newest: dates[dates.length - 1] ?? '',
        };
      })
      .reverse();
  });

  /** 默认：最新一组展开，其它折叠（日志动辄上百条，避免刷屏） */
  function isGroupOpen(key: string, index: number): boolean {
    return groupOverride[key] ?? index === 0;
  }

  function toggleGroup(key: string, index: number) {
    groupOverride = { ...groupOverride, [key]: !isGroupOpen(key, index) };
  }

  function openVerForm(kind: ManualBump) {
    verForm = verForm === kind ? null : kind;
    verInfo = '';
  }

  /** 首条是 1.0.0 的旧编号 → 提供一次「改为 0.1.0 起」 */
  const legacyChangelog = $derived(
    isLegacyChangelog($activeProject?.changelog?.[0]?.version)
  );
  let confirmRenumber = $state(false);

  function doRenumber() {
    if (!$activeProject) return;
    renumberChangelog($activeProject.id);
    confirmRenumber = false;
  }

  function saveVersion() {
    if (!$activeProject || !verForm) return;
    addVersionEntry($activeProject.id, verForm, verInfo);
    verForm = null;
    verInfo = '';
  }

  function taskStats(tasks: { status: string }[]) {
    const done = tasks.filter(t => t.status === 'done').length;
    const doing = tasks.filter(t => t.status === 'in_progress').length;
    const todo = tasks.filter(t => t.status === 'todo').length;
    return { done, doing, todo, total: tasks.length };
  }
</script>

<div class="info-view">
  {#if $activeProject}
    {@const proj = $activeProject}
    {@const stats = taskStats(proj.tasks)}

    <div class="info-header">
      <span class="dot" style="background:{proj.color}"></span>
      <h2>{proj.name}</h2>
      <span class="meta">{$t('info.projectOverview')}</span>
    </div>

    <div class="info-body">
      <!-- 项目信息 -->
      <section class="section">
        <h3 class="section-title">{$t('info.projectInfo')}</h3>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">{$t('info.template')}</span>
            <span class="info-value">{tplLabels[proj.template] || proj.template}</span>
          </div>
          <div class="info-item">
            <span class="info-label">{$t('info.createdAt')}</span>
            <span class="info-value">{fmtDateTime(proj.created_at)}</span>
          </div>
          <div class="info-item">
            <span class="info-label">{$t('info.updatedAt')}</span>
            <span class="info-value">{fmtDateTime(proj.updated_at)}</span>
          </div>
          <div class="info-item" style="grid-column:span 2;cursor:pointer" onclick={toggleDateEdit}>
            <span class="info-label">
              项目时间
              <span class="date-edit-hint">{editDates ? '取消' : '编辑'}</span>
            </span>
            {#if editDates}
              <div class="date-edit-row" onclick={e => e.stopPropagation()}>
                <input class="date-input" type="date" bind:value={editStart} />
                <span class="date-edit-sep">→</span>
                <input class="date-input" type="date" bind:value={editEnd} />
                <button class="date-save-btn" onclick={e => { e.stopPropagation(); saveDates(); }}>保存</button>
              </div>
            {:else}
              <span class="info-value" class:date-empty={!proj.start_date && !proj.end_date}>
                {#if proj.start_date || proj.end_date}
                  {proj.start_date || '…'} → {proj.end_date || '…'}
                {:else}
                  点击设置时间范围
                {/if}
              </span>
            {/if}
          </div>
          <div class="info-item">
            <span class="info-label">{$t('info.taskCount')}</span>
            <span class="info-value">{stats.total}</span>
          </div>
          <div class="info-item">
            <span class="info-label">{$t('info.completed')}</span>
            <span class="info-value" style="color:var(--green)">{stats.done}</span>
          </div>
          <div class="info-item">
            <span class="info-label">{$t('info.inProgress')}</span>
            <span class="info-value" style="color:var(--accent)">{stats.doing}</span>
          </div>
          <div class="info-item">
            <span class="info-label">{$t('info.todo')}</span>
            <span class="info-value" style="color:var(--text-muted)">{stats.todo}</span>
          </div>
        </div>
        {#if proj.description}
          <p class="desc">{proj.description}</p>
        {/if}
      </section>

      <!-- 任务进度概览 -->
      {#if proj.tasks.length > 0}
        <section class="section">
          <h3 class="section-title">{$t('info.taskProgress')} <span class="count">{stats.done}/{stats.total}</span></h3>
          <div class="progress-list">
            {#each proj.tasks as task}
              {@const subDone = task.subtasks?.filter(s => s.done).length ?? 0}
              {@const subTotal = task.subtasks?.length ?? 0}
              {@const pct = subTotal > 0 ? Math.round((subDone / subTotal) * 100) : (task.status === 'done' ? 100 : task.status === 'in_progress' ? 50 : 0)}
              <div class="progress-item" onclick={() => activeTaskId.set(task.id)} role="button" tabindex="0" onkeydown={(e) => { if (e.key === 'Enter') activeTaskId.set(task.id); }}>
                <div class="progress-head">
                  <span class="progress-dot" style="background:{task.color || '#4f46e5'}"></span>
                  <span class="progress-title" class:done={task.status === 'done'}>{task.title}</span>
                  <span class="progress-status" class:status-todo={task.status === 'todo'} class:status-doing={task.status === 'in_progress'} class:status-done={task.status === 'done'}>
                    {task.status === 'todo' ? $t('status.todo') : task.status === 'in_progress' ? $t('status.in_progress') : $t('status.done')}
                  </span>
                  {#if subTotal > 0}
                    <span class="progress-sub">{subDone}/{subTotal}</span>
                  {/if}
                </div>
                <div class="progress-track">
                  <div class="progress-fill" style="width:{pct}%;background:{task.color || '#4f46e5'}"></div>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- 工时统计 -->
      {#if proj.tasks.some(t => t.tracked_start)}
        {@const tracked = proj.tasks.filter(t => t.tracked_start)}
        {@const doneTracked = tracked.filter(t => t.status === 'done')}
        {@const totalMs = doneTracked.reduce((sum, t) => sum + (new Date(t.updated_at).getTime() - new Date(t.tracked_start!).getTime()), 0)}
        {@const activeTasks = tracked.filter(t => t.status !== 'done')}
        {@const maxMs = tracked.reduce((max, t) => { const ms = (t.status === 'done' ? new Date(t.updated_at).getTime() : Date.now()) - new Date(t.tracked_start!).getTime(); return Math.max(max, ms); }, 0)}
        <section class="section">
          <h3 class="section-title">{$t('info.timeStats')}</h3>
          <div class="time-summary">
            <div class="time-stat">
              <span class="time-stat-label">{$t('info.completedTime')}</span>
              <span class="time-stat-value">{formatMs(totalMs)}</span>
            </div>
            <div class="time-stat">
              <span class="time-stat-label">{$t('info.tracking')}</span>
              <span class="time-stat-value" style="color:var(--accent)">{$tf('task.count', { n: activeTasks.length })}</span>
            </div>
          </div>
          {#if maxMs > 0}
            <div class="time-chart">
              {#each [...tracked].sort((a, b) => {
                const msA = (a.status === 'done' ? new Date(a.updated_at).getTime() : Date.now()) - new Date(a.tracked_start!).getTime();
                const msB = (b.status === 'done' ? new Date(b.updated_at).getTime() : Date.now()) - new Date(b.tracked_start!).getTime();
                return msB - msA;
              }) as t}
                {@const ms = (t.status === 'done' ? new Date(t.updated_at).getTime() : $ticker) - new Date(t.tracked_start!).getTime()}
                {@const pct = (ms / maxMs) * 100}
                <div class="time-bar-row">
                  <span class="time-bar-label" class:done={t.status === 'done'}>{t.title}</span>
                  <div class="time-bar-track">
                    <div class="time-bar-fill" class:active={t.status !== 'done'} style="width:{pct}%"></div>
                  </div>
                  <span class="time-bar-value">
                    {#if t.status !== 'done'}<span class="time-bar-dot"></span>{/if}
                    {t.status === 'done' ? formatDuration(t.tracked_start!, t.updated_at) : formatDurationHMS(t.tracked_start!, undefined, $ticker)}
                  </span>
                </div>
              {/each}
            </div>
          {/if}
        </section>
      {/if}

      <!-- 标签 -->
      {#if proj.tags.length > 0}
        <section class="section">
          <h3 class="section-title">{$t('info.tags')} <span class="count">{proj.tags.length}</span></h3>
          <div class="tag-grid">
            {#each proj.tags as tag}
              <span class="tag-badge" style="color:{tag.color};background:{tag.color}20;border:1px solid {tag.color}40">
                <span class="tag-dot" style="background:{tag.color}"></span>
                {tag.name}
              </span>
            {/each}
          </div>
        </section>
      {/if}

      <!-- 变更日志 -->
      <section class="section">
        <div class="cl-header">
          <h3 class="section-title">
            {$t('info.changelog')}
            <span class="count">{proj.changelog.length}</span>
            <span class="cl-current" title={$t('info.changelogCurrentHint')}>v{latestVersion}</span>
          </h3>
          <div class="cl-actions">
            {#each MANUAL_BUMPS as kind (kind)}
              <button
                class="cl-btn"
                class:active={verForm === kind}
                title={kind === 'major' ? $t('info.majorHint') : $t('info.minorHint')}
                onclick={() => openVerForm(kind)}
              >{`+ ${kind === 'major' ? $t('info.majorShort') : $t('info.minorShort')}`} <span class="cl-btn-preview">{bumpVersion(latestVersion, kind)}</span></button>
            {/each}
          </div>
        </div>

        {#if verForm}
          <div class="cl-form">
            <div class="cl-form-head">
              <span class="cl-ver-chip">{verPreview}</span>
              <span class="cl-form-kind">
                {verForm === 'major' ? $t('info.majorHint') : $t('info.minorHint')}
              </span>
            </div>
            <input
              class="input"
              placeholder={$t('info.changelogPlaceholder')}
              bind:value={verInfo}
              onkeydown={e => { if (e.key === 'Enter') saveVersion(); if (e.key === 'Escape') verForm = null; }}
            />
            <div class="cl-form-actions">
              <button class="cl-cancel" onclick={() => verForm = null}>{$t('sidebar.cancel')}</button>
              <button class="ms-submit" onclick={saveVersion}>{$t('info.changelogSave')}</button>
            </div>
          </div>
        {/if}

        {#if legacyChangelog && proj.changelog.length > 0}
          <div class="cl-legacy">
            <span class="cl-legacy-text">{$t('info.legacyHint')}</span>
            {#if confirmRenumber}
              <button class="cl-legacy-btn danger" onclick={doRenumber}>{$t('info.legacyConfirm')}</button>
              <button class="cl-legacy-btn" onclick={() => confirmRenumber = false}>{$t('sidebar.cancel')}</button>
            {:else}
              <button class="cl-legacy-btn" onclick={() => confirmRenumber = true}>{$t('info.legacyAction')}</button>
            {/if}
          </div>
        {/if}

        {#if proj.changelog.length === 0}
          <div class="cl-empty">{$t('info.changelogEmpty')}</div>
        {:else}
          <div class="changelog-groups">
            {#each changelogGroups as group, gi (group.key)}
              {@const open = isGroupOpen(group.key, gi)}
              <div class="cl-group" class:open>
                <button
                  class="cl-group-head"
                  aria-expanded={open}
                  onclick={() => toggleGroup(group.key, gi)}
                >
                  <span class="cl-caret" class:open>▸</span>
                  <span class="cl-group-label">{group.label}</span>
                  <span class="cl-group-count">{$tf('info.changelogCount', { n: group.entries.length })}</span>
                  <span class="cl-group-range">{fmtDate(group.oldest)}{group.oldest !== group.newest ? ` – ${fmtDate(group.newest)}` : ''}</span>
                </button>

                {#if open}
                  <div class="changelog">
                    {#each group.entries as entry}
                      <div class="changelog-item" class:auto={entry.auto === true} class:release={entry.auto === false}>
                        <div class="changelog-dot"></div>
                        <div class="changelog-content">
                          <div class="changelog-head">
                            <span class="changelog-ver">{entry.version}</span>
                            {#if entry.auto === false}
                              <span class="changelog-tag">{$t('info.releaseTag')}</span>
                            {:else if entry.auto === true}
                              <span class="changelog-tag muted">{$t('info.autoTag')}</span>
                            {/if}
                            <span class="changelog-date">{fmtDate(entry.date)}</span>
                          </div>
                          <p class="changelog-info">{entry.info}</p>
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <!-- 里程碑 -->
      <section class="section">
        <div class="ms-header">
          <h3 class="section-title">{$t('info.milestones')} <span class="count">{proj.milestones?.length ?? 0}</span></h3>
          <button class="ms-add-btn" onclick={() => showMsForm = !showMsForm}>{showMsForm ? $t('sidebar.cancel') : $t('info.add')}</button>
        </div>

        {#if showMsForm}
          <div class="ms-form">
            <input class="input" placeholder={$t('info.milestoneName')} bind:value={msTitle} onkeydown={e => e.key === 'Enter' && addMilestone()} />
            <input class="input" type="date" bind:value={msDate} />
            <div class="ms-color-row">
              {#each msColors as c}
                <button class="ms-color-dot" class:active={msColor === c} style="background:{c}" onclick={() => msColor = c}></button>
              {/each}
            </div>
            <textarea class="ms-desc" placeholder={$t('sidebar.description')} bind:value={msDesc}></textarea>
            <button class="ms-submit" onclick={addMilestone} disabled={!msTitle.trim() || !msDate}>{$t('sidebar.create')}</button>
          </div>
        {/if}

        {#if proj.milestones?.length > 0}
          <div class="ms-list">
            {#each [...(proj.milestones ?? [])].sort((a, b) => a.date.localeCompare(b.date)) as ms}
              <div class="ms-item">
                <div class="ms-diamond" style="background:{ms.color}"></div>
                <div class="ms-content">
                  <div class="ms-head">
                    <span class="ms-title">{ms.title}</span>
                    <span class="ms-date">{fmtDate(ms.date)}</span>
                    <button class="ms-del" onclick={() => rmMilestone(ms.id)}><Icon name="close" size={12} /></button>
                  </div>
                  {#if ms.description}
                    <p class="ms-desc-text">{ms.description}</p>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {:else if !showMsForm}
          <p class="ms-empty">{$t('info.noMilestones')}</p>
        {/if}
      </section>
    </div>
  {:else}
    <div class="empty">{$t('info.selectProject')}</div>
  {/if}
</div>

<style>
  .info-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .info-header { display: flex; align-items: center; gap: 10px; padding: 16px 24px; border-bottom: 1px solid var(--border); }
  .info-header .dot { width: 12px; height: 12px; border-radius: 50%; }
  .info-header h2 { font-size: 16px; font-weight: 600; }
  .info-header .meta { font-size: 12px; color: var(--text-muted); }
  .info-body { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 24px; }
  .empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 14px; }

  .section { }
  .section-title { font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
  .section-title .count { font-size: 11px; color: var(--text-muted); font-weight: 400; }

  /* 项目信息网格 */
  .info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, minmax(0, 1fr))); gap: 12px; margin-bottom: 12px; }
  .info-item { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; background: var(--surface); border-radius: 8px; border: 1px solid var(--border); min-width: 0; overflow: hidden; }
  .info-label { font-size: 11px; color: var(--text-muted); }
  .info-value { font-size: 14px; font-weight: 500; color: var(--text); overflow-wrap: anywhere; }
  .desc { font-size: 13px; color: var(--text-secondary); line-height: 1.6; padding: 8px 0; }
  .date-edit-hint { font-size: 10px; color: var(--accent); font-weight: normal; margin-left: 6px; opacity: 0.6; }
  .info-item:hover .date-edit-hint { opacity: 1; }
  .date-edit-row { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
  .date-input { flex: 1; padding: 5px 8px; font-size: 13px; border-radius: 6px; background: var(--bg); border: 1px solid var(--border); color: var(--text); }
  .date-input:focus { border-color: var(--accent); outline: none; }
  .date-edit-sep { font-size: 14px; color: var(--text-muted); }
  .date-save-btn { padding: 5px 10px; font-size: 11px; border-radius: 6px; background: var(--accent); color: #fff; white-space: nowrap; }
  .date-save-btn:hover { opacity: 0.9; }
  .date-empty { color: var(--text-muted); font-size: 12px; font-weight: normal; }

  /* 任务进度概览 */
  .progress-list { display: flex; flex-direction: column; gap: 6px; }
  .progress-item { padding: 8px 10px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; transition: border-color 0.15s; }
  .progress-item:hover { border-color: var(--accent); }
  .progress-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .progress-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .progress-title { flex: 1; font-size: 13px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .progress-title.done { text-decoration: line-through; color: var(--text-muted); }
  .progress-status { font-size: 10px; padding: 1px 8px; border-radius: 999px; font-weight: 500; flex-shrink: 0; }
  .status-todo { background: var(--surface); color: var(--text-muted); border: 1px solid var(--border); }
  .status-doing { background: var(--accent); color: #fff; }
  .status-done { background: var(--green); color: #fff; }
  .progress-sub { font-size: 10px; color: var(--text-muted); background: var(--bg); padding: 1px 6px; border-radius: 999px; flex-shrink: 0; }
  .progress-track { height: 4px; background: var(--bg); border-radius: 2px; overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }

  /* 工时统计 */
  .time-summary { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; margin-bottom: 16px; }
  .time-stat { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; background: var(--surface); border-radius: 8px; border: 1px solid var(--border); }
  .time-stat-label { font-size: 11px; color: var(--text-muted); }
  .time-stat-value { font-size: 16px; font-weight: 600; color: var(--text); }
  .time-chart { display: flex; flex-direction: column; gap: 8px; }
  .time-bar-row { display: flex; align-items: center; gap: 8px; }
  .time-bar-label { font-size: 12px; color: var(--text); min-width: 80px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0; }
  .time-bar-label.done { color: var(--text-muted); }
  .time-bar-track { flex: 1; height: 8px; background: var(--surface); border-radius: 4px; overflow: hidden; }
  .time-bar-fill { height: 100%; border-radius: 4px; background: var(--text-muted); transition: width 0.3s; }
  .time-bar-fill.active { background: var(--accent); }
  .time-bar-value { font-size: 11px; color: var(--text-muted); min-width: 60px; text-align: right; display: flex; align-items: center; justify-content: flex-end; gap: 4px; flex-shrink: 0; }
  .time-bar-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); animation: pulse 1.5s ease-in-out infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

  /* 标签 */
  .tag-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .tag-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 500; }
  .tag-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

  /* 变更日志 */
  .changelog { display: flex; flex-direction: column; }
  .changelog-item { display: flex; gap: 12px; padding: 12px 0; position: relative; }
  .changelog-item:not(:last-child)::before { content: ''; position: absolute; left: 5px; top: 28px; bottom: -4px; width: 1px; background: var(--border); }
  .changelog-dot { width: 11px; height: 11px; border-radius: 50%; background: var(--accent); flex-shrink: 0; margin-top: 3px; }
  .changelog-content { flex: 1; min-width: 0; }
  .changelog-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
  .changelog-ver { font-size: 14px; font-weight: 600; color: var(--text); }
  .changelog-item.auto .changelog-ver { font-weight: 500; font-size: 13px; color: var(--text-secondary); }
  .changelog-item.auto .changelog-dot { background: var(--border); }
  .changelog-item.release .changelog-dot { box-shadow: 0 0 0 3px var(--accent-light); }
  .changelog-tag { font-size: 10px; padding: 1px 6px; border-radius: 999px; color: #fff; background: var(--accent); }
  .changelog-tag.muted { color: var(--text-muted); background: var(--bg); border: 1px solid var(--border); }
  .changelog-date { font-size: 11px; color: var(--text-muted); }
  .changelog-info { font-size: 13px; color: var(--text-secondary); line-height: 1.5; }

  /* 变更日志：标题右侧的「小/大版本」按钮 */
  .cl-header { display: flex; align-items: center; gap: 8px; }
  .cl-header .section-title { flex: 1; margin-bottom: 0; }
  .cl-current { font-size: 11px; font-weight: 600; color: var(--accent); background: var(--accent-light); padding: 1px 8px; border-radius: 999px; }
  .cl-actions { display: flex; gap: 6px; flex-shrink: 0; }
  .cl-btn { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; font-size: 12px; border-radius: 6px; color: var(--text-secondary); background: var(--surface); border: 1px solid var(--border); }
  .cl-btn:hover { border-color: var(--accent); color: var(--accent); }
  .cl-btn.active { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
  .cl-btn-preview { font-size: 10px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .cl-btn.active .cl-btn-preview { color: var(--accent); }

  /* 记版本表单 */
  .cl-form { display: flex; flex-direction: column; gap: 8px; padding: 12px; margin: 12px 0; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
  .cl-form-head { display: flex; align-items: center; gap: 8px; }
  .cl-ver-chip { font-size: 13px; font-weight: 600; color: #fff; background: var(--accent); padding: 2px 10px; border-radius: 6px; font-variant-numeric: tabular-nums; }
  .cl-form-kind { font-size: 11px; color: var(--text-muted); }
  .cl-form .input { width: 100%; padding: 6px 8px; font-size: 13px; border-radius: 6px; background: var(--bg); border: 1px solid var(--border); color: var(--text); box-sizing: border-box; }
  .cl-form .input:focus { border-color: var(--accent); outline: none; }
  .cl-form-actions { display: flex; justify-content: flex-end; gap: 8px; }
  .cl-cancel { padding: 6px 12px; font-size: 12px; border-radius: 6px; color: var(--text-secondary); background: var(--bg); border: 1px solid var(--border); }
  .cl-cancel:hover { border-color: var(--text-muted); }
  .cl-empty { font-size: 12px; color: var(--text-muted); padding: 8px 0; }

  /* 旧编号（1.0.0 起）提示 */
  .cl-legacy { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 10px 0 4px; padding: 8px 10px; font-size: 12px; border: 1px dashed var(--border); border-radius: 8px; color: var(--text-secondary); }
  .cl-legacy-text { flex: 1; min-width: 160px; }
  .cl-legacy-btn { padding: 3px 10px; font-size: 11px; border-radius: 6px; color: var(--accent); background: var(--accent-light); border: 1px solid transparent; }
  .cl-legacy-btn:hover { border-color: var(--accent); }
  .cl-legacy-btn.danger { color: #fff; background: var(--accent); }

  /* 按 major.minor 分组折叠 */
  .changelog-groups { display: flex; flex-direction: column; gap: 4px; }
  .cl-group { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .cl-group.open { background: var(--surface); }
  .cl-group-head { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; text-align: left; }
  .cl-group-head:hover { background: var(--accent-light); }
  .cl-caret { font-size: 10px; color: var(--text-muted); transition: transform 0.15s; }
  .cl-caret.open { transform: rotate(90deg); }
  .cl-group-label { font-size: 13px; font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; }
  .cl-group-count { font-size: 10px; color: var(--text-muted); background: var(--bg); padding: 1px 6px; border-radius: 999px; }
  .cl-group-range { margin-left: auto; font-size: 11px; color: var(--text-muted); }
  .cl-group .changelog { padding: 0 10px 4px 10px; }

  /* 里程碑 */
  .ms-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .ms-header .section-title { margin-bottom: 0; }
  .ms-add-btn { font-size: 12px; color: var(--accent); padding: 4px 10px; border-radius: 6px; }
  .ms-add-btn:hover { background: var(--accent-light); }
  .ms-form { display: flex; flex-direction: column; gap: 8px; padding: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 12px; }
  .ms-form .input { width: 100%; padding: 6px 8px; font-size: 13px; border-radius: 6px; background: var(--bg); border: 1px solid var(--border); color: var(--text); }
  .ms-form .input:focus { border-color: var(--accent); outline: none; }
  .ms-desc { width: 100%; padding: 6px 8px; font-size: 12px; border-radius: 6px; background: var(--bg); border: 1px solid var(--border); color: var(--text); resize: vertical; min-height: 48px; }
  .ms-desc:focus { border-color: var(--accent); outline: none; }
  .ms-color-row { display: flex; gap: 4px; }
  .ms-color-dot { width: 20px; height: 20px; border-radius: 50%; border: 2px solid transparent; transition: transform 0.15s; }
  .ms-color-dot.active { border-color: #fff; transform: scale(1.15); }
  .ms-submit { padding: 6px 12px; font-size: 12px; border-radius: 6px; background: var(--accent); color: #fff; align-self: flex-end; }
  .ms-submit:disabled { opacity: 0.4; cursor: not-allowed; }
  .ms-list { display: flex; flex-direction: column; }
  .ms-item { display: flex; gap: 12px; padding: 10px 0; position: relative; }
  .ms-item:not(:last-child)::before { content: ''; position: absolute; left: 6px; top: 28px; bottom: -4px; width: 1px; background: var(--border); }
  .ms-diamond { width: 13px; height: 13px; flex-shrink: 0; margin-top: 2px; transform: rotate(45deg); border-radius: 2px; }
  .ms-content { flex: 1; min-width: 0; }
  .ms-head { display: flex; align-items: baseline; gap: 8px; }
  .ms-title { font-size: 14px; font-weight: 600; color: var(--text); }
  .ms-date { font-size: 11px; color: var(--text-muted); }
  .ms-del { margin-left: auto; color: var(--text-muted); padding: 2px; opacity: 0; transition: opacity 0.15s; }
  .ms-item:hover .ms-del { opacity: 1; }
  .ms-del:hover { color: var(--red); }
  .ms-desc-text { font-size: 12px; color: var(--text-secondary); line-height: 1.5; margin-top: 2px; }
  .ms-empty { font-size: 13px; color: var(--text-muted); }

  @media (max-width: 768px) {
    .info-view { padding: 12px; }
    .info-grid { grid-template-columns: 1fr; }
    .time-summary { grid-template-columns: 1fr; gap: 8px; }
    .time-bar-label { min-width: 60px; max-width: 80px; font-size: 11px; }
    .time-bar-value { min-width: 40px; font-size: 10px; }
  }
</style>
