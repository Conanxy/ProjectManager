<script lang="ts">
/**
 * ProjectReadme — README 编辑器视图
 *
 * 基于 Vditor 的所见即所得 Markdown 编辑器，用于编辑项目 README。
 * 功能包括：
 * - 即时渲染（IR）编辑模式
 * - 完整工具栏（表情、标题、粗体、斜体、删除线、引用、列表、代码、表格等）
 * - 深色/浅色主题自动跟随应用主题切换
 * - 项目切换时自动加载对应 README 内容
 * - 内容变更自动保存
 *
 * @example
 * <ProjectReadme />
 */

  import { activeProject, updateReadme, isDark, vditorTheme } from '$lib/stores';
  import { get } from 'svelte/store';
  import { t, locale } from '$lib/i18n';
  import Vditor from 'vditor';
  import 'vditor/dist/index.css';

  let editorEl = $state<HTMLDivElement | null>(null);
  let vditor: Vditor | null = null;
  let lastProjectId: string | null = null;
  let creating = false;
  let ready = false;

  // 自定义 CSS
  let customCSS = $state(localStorage.getItem('pm_vditor_css') || '');

  // 计算 Vditor 实际主题
  let resolvedTheme = $derived.by((): 'dark' | 'classic' => {
    const pref = $vditorTheme;
    if (pref === 'light') return 'classic';
    if (pref === 'dark') return 'dark';
    return $isDark ? 'dark' : 'classic';
  });

  // 同步 Vditor 主题
  function syncTheme() {
    if (!vditor || !ready) return;
    try { vditor.setTheme(resolvedTheme); } catch (e) {}
  }

  $effect(() => {
    const proj = $activeProject;
    const el = editorEl;
    if (!el || !proj) return;

    // readme 为空时自动生成默认内容
    let content = proj.readme;
    if (!content || content.trim() === '') {
      content = `# ${proj.name}\n\n${proj.description || get(t)('common.projectDesc')}\n`;
      updateReadme(proj.id, content);
    }

    if (!vditor && !creating) {
      creating = true;
      vditor = new Vditor(el, {
        mode: 'ir',
        theme: resolvedTheme,
        value: content,
        cache: { enable: false },
        minHeight: 400,
        placeholder: get(t)('readme.placeholder'),
        lang: $locale === 'zh' ? 'zh_CN' : 'en_US',
        toolbar: [
          'emoji', 'headings', 'bold', 'italic', 'strike', '|',
          'line', 'quote', 'list', 'ordered-list', 'check', '|',
          'code', 'inline-code', 'table', '|',
          'undo', 'redo', '|',
          'edit-mode', 'fullscreen', 'preview'
        ],
        input: (value: string) => {
          if ($activeProject) {
            updateReadme($activeProject.id, value);
          }
        },
        after: () => {
          creating = false;
          ready = true;
          lastProjectId = proj.id;
          syncTheme();
        }
      });
    } else if (vditor && ready && proj.id !== lastProjectId) {
      lastProjectId = proj.id;
      vditor.setValue(content);
    }
  });

  // 监听主题切换（应用主题 + Vditor 主题设置）
  $effect(() => {
    const _dark = $isDark;
    const _vt = $vditorTheme;
    if (ready) syncTheme();
  });

  function cleanup() {
    vditor?.destroy();
    vditor = null;
    lastProjectId = null;
    creating = false;
    ready = false;
  }
</script>

<div class="readme-view">
  {#if $activeProject}
    <div class="readme-header">
      <span class="dot" style="background:{$activeProject.color}"></span>
      <h2>{$activeProject.name}</h2>
      <span class="meta">README.md</span>
    </div>
    <div class="readme-body">
      <div class="editor-wrap" bind:this={editorEl}></div>
      {#if customCSS}
        <style>{customCSS}</style>
      {/if}
    </div>
  {:else}
    <div class="empty">{$t('readme.selectProject')}</div>
  {/if}
</div>

<svelte:window on:beforeunload={cleanup} />

<style>
  .readme-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .readme-header { display: flex; align-items: center; gap: 10px; padding: 16px 24px; border-bottom: 1px solid var(--border); }
  .readme-header .dot { width: 12px; height: 12px; border-radius: 50%; }
  .readme-header h2 { font-size: 16px; font-weight: 600; }
  .readme-header .meta { font-size: 12px; color: var(--text-muted); }
  .readme-body { flex: 1; overflow: auto; padding: 16px 24px; }
  .empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 14px; }

  .editor-wrap { min-height: 400px; }

  /* 通用：边框、背景（两个主题都适用） */
  .editor-wrap :global(.vditor) { border: 1px solid var(--border) !important; border-radius: 8px; background: var(--bg) !important; }
  .editor-wrap :global(.vditor-toolbar) { background: var(--surface) !important; border-bottom: 1px solid var(--border) !important; border-radius: 8px 8px 0 0; }
  .editor-wrap :global(.vditor-toolbar__item) { color: var(--text-secondary) !important; }
  .editor-wrap :global(.vditor-toolbar__item:hover) { color: var(--accent) !important; }
  .editor-wrap :global(.vditor-toolbar__item--current) { color: var(--accent) !important; }
  .editor-wrap :global(.vditor-ir) { background: var(--bg) !important; }
  .editor-wrap :global(.vditor-ir pre.vditor-ir__marker) { background: var(--surface) !important; }
  .editor-wrap :global(.vditor-ir code) { background: var(--surface) !important; }
  .editor-wrap :global(.vditor-ir blockquote) { border-left-color: var(--accent) !important; }
  .editor-wrap :global(.vditor-ir hr) { border-top-color: var(--border) !important; }
  .editor-wrap :global(.vditor-ir table) { border-color: var(--border) !important; }
  .editor-wrap :global(.vditor-ir table th) { background: var(--surface) !important; border-color: var(--border) !important; }
  .editor-wrap :global(.vditor-ir table td) { border-color: var(--border) !important; }
  .editor-wrap :global(.vditor-ir .vditor-ir__link) { color: var(--accent) !important; }
  .editor-wrap :global(.vditor-counter) { color: var(--text-muted) !important; }
  .editor-wrap :global(.vditor-panel) { background: var(--surface) !important; border-color: var(--border) !important; }
  .editor-wrap :global(.vditor-hint) { background: var(--surface) !important; border-color: var(--border) !important; }
  .editor-wrap :global(.vditor-hint--current) { background: var(--accent-light) !important; }
  .editor-wrap :global(.vditor-emojis) { background: var(--surface) !important; }
  .editor-wrap :global(.vditor-emojis span:hover) { background: var(--accent-light) !important; }
  .editor-wrap :global(.vditor-tooltip) { background: var(--surface) !important; box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important; }

  .editor-wrap :global(.vditor-content) { background: var(--bg) !important; }
  .editor-wrap :global(.vditor-sv) { background: var(--bg) !important; }
  .editor-wrap :global(.vditor-preview) { background: var(--bg) !important; }

  /* 暗色模式：强制覆盖文字颜色 */
  :global(.dark) .editor-wrap :global(.vditor-ir) { color: var(--text) !important; }
  :global(.dark) .editor-wrap :global(.vditor-ir *) { color: var(--text) !important; }
  :global(.dark) .editor-wrap :global(.vditor-content) { color: var(--text) !important; }
  :global(.dark) .editor-wrap :global(.vditor-content *) { color: var(--text) !important; }
  :global(.dark) .editor-wrap :global(.vditor-sv) { color: var(--text) !important; }
  :global(.dark) .editor-wrap :global(.vditor-preview) { color: var(--text) !important; }
  :global(.dark) .editor-wrap :global(.vditor-toolbar__item svg) { fill: var(--text-secondary) !important; color: var(--text-secondary) !important; }
  :global(.dark) .editor-wrap :global(.vditor-toolbar__item:hover svg) { fill: var(--accent) !important; color: var(--accent) !important; }
  :global(.dark) .editor-wrap :global(.vditor-hint) { color: var(--text) !important; }
  :global(.dark) .editor-wrap :global(.vditor-hint li) { color: var(--text) !important; }
  :global(.dark) .editor-wrap :global(.vditor-arrow) { color: var(--text-muted) !important; }
  :global(.dark) .editor-wrap :global(.vditor-tooltip) { color: var(--text) !important; }
  :global(.dark) .editor-wrap :global(.vditor-placeholder) { color: var(--text-muted) !important; }

  @media (max-width: 768px) {
    .readme-view { padding: 12px; }
    .editor-wrap :global(.vditor-toolbar) { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  }
</style>
