<script lang="ts">
/**
 * Icon — SVG 图标组件
 *
 * 内置 12 种常用图标的 SVG 渲染，支持自定义大小和 CSS 类名。
 * 包含 logo（自定义渐变）和标准 Feather 风格图标两套渲染路径。
 *
 * 支持的图标：logo、folder、folder-open、file、clipboard、check、
 * close、chevron-right、sun、moon、help、play、download、printer、
 * upload、chart、sparkles、ban、alert-triangle、repeat
 *
 * @example
 * <Icon name="check" size={16} />
 * <Icon name="folder" size={24} class="my-icon" />
 */

  interface Props {
    name: 'logo' | 'folder' | 'folder-open' | 'file' | 'clipboard' | 'check' | 'close' | 'chevron-right' | 'sun' | 'moon' | 'help' | 'play' | 'download' | 'printer' | 'upload' | 'chart' | 'sparkles' | 'ban' | 'alert-triangle' | 'repeat';
    size?: number;
    class?: string;
  }
  let { name, size = 16, class: cls = '' }: Props = $props();
</script>

{#if name === 'logo'}
  <svg class="icon {cls}" width={size} height={size} viewBox="0 0 128 128" fill="none">
    <defs>
      <linearGradient id="logo-bg" x1="0" y1="0" x2="128" y2="128" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#6366f1"/>
        <stop offset="100%" stop-color="#4f46e5"/>
      </linearGradient>
    </defs>
    <rect width="128" height="128" rx="28" fill="url(#logo-bg)"/>
    <rect x="30" y="28" width="68" height="80" rx="8" fill="rgba(255,255,255,0.15)"/>
    <rect x="46" y="20" width="36" height="16" rx="6" fill="rgba(255,255,255,0.25)"/>
    <circle cx="64" cy="28" r="4" fill="rgba(255,255,255,0.4)"/>
    <rect x="42" y="50" width="12" height="12" rx="3" fill="rgba(255,255,255,0.9)"/>
    <path d="M45 56 L48 59 L52 53" stroke="#4f46e5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="60" y="53" width="26" height="4" rx="2" fill="rgba(255,255,255,0.5)"/>
    <rect x="42" y="70" width="12" height="12" rx="3" fill="rgba(255,255,255,0.9)"/>
    <path d="M45 76 L48 79 L52 73" stroke="#4f46e5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="60" y="73" width="20" height="4" rx="2" fill="rgba(255,255,255,0.5)"/>
    <rect x="42" y="90" width="12" height="12" rx="3" fill="rgba(255,255,255,0.3)"/>
    <rect x="60" y="93" width="24" height="4" rx="2" fill="rgba(255,255,255,0.3)"/>
  </svg>
{:else}
<svg class="icon {cls}" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  {#if name === 'folder'}
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  {:else if name === 'folder-open'}
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    <path d="M2 10h20" stroke-dasharray="2 2"/>
  {:else if name === 'file'}
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  {:else if name === 'clipboard'}
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
    <rect x="8" y="2" width="8" height="4" rx="1"/>
  {:else if name === 'check'}
    <polyline points="20 6 9 17 4 12"/>
  {:else if name === 'close'}
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  {:else if name === 'chevron-right'}
    <polyline points="9 18 15 12 9 6"/>
  {:else if name === 'sun'}
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  {:else if name === 'moon'}
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  {:else if name === 'help'}
    <circle cx="12" cy="12" r="10"/>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  {:else if name === 'play'}
    <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none"/>
  {:else if name === 'download'}
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  {:else if name === 'printer'}
    <polyline points="6 9 6 2 18 2 18 9"/>
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
    <rect x="6" y="14" width="12" height="8"/>
  {:else if name === 'upload'}
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  {:else if name === 'chart'}
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/>
  {:else if name === 'sparkles'}
    <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/>
    <path d="M18.5 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>
  {:else if name === 'ban'}
    <circle cx="12" cy="12" r="10"/>
    <line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/>
  {:else if name === 'repeat'}
    <polyline points="17 1 21 5 17 9"/>
    <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
    <polyline points="7 23 3 19 7 15"/>
    <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
  {:else if name === 'alert-triangle'}
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  {/if}
</svg>
{/if}

<style>
  .icon {
    display: inline-block;
    vertical-align: middle;
    flex-shrink: 0;
  }
</style>
