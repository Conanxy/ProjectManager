/**
 * 项目模板系统
 *
 * 内置 4 种项目模板：默认项目、Electron 应用、硬件开发、Web 项目。
 * 每个模板定义了初始目录结构和文件内容生成器，
 * 在创建新项目时自动生成对应的文件骨架。
 *
 * @module templates
 */

import type { TemplateName, TemplateConfig } from './types';

/** 模板注册表：名称 → 配置 */
const templates: Record<TemplateName, TemplateConfig> = {
  default: {
    name: '默认项目',
    dirs: ['Bitmap', 'Hardware', 'Software', 'Reference', 'DataSheet'],
    files: ['Readme.md', '.gitignore'],
    fileContents: {
      'Readme.md': (name) => `<div align="center"><h1>${name}</h1></div>`,
      '.gitignore': () => 'node_modules/\n.env\n.DS_Store\n'
    }
  },
  electron: {
    name: 'Electron 应用',
    dirs: ['src', 'assets', 'build'],
    files: ['package.json', 'main.js', 'index.html', 'README.md', '.gitignore'],
    fileContents: {
      'package.json': (name) => JSON.stringify({
        name: name.toLowerCase().replace(/\s+/g, '-'),
        version: '1.0.0',
        main: 'main.js',
        scripts: { start: 'electron .' },
        devDependencies: { electron: '^latest' }
      }, null, 2),
      'main.js': () => `const { app, BrowserWindow } = require('electron')

function createWindow () {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  })
  win.loadFile('index.html')
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})`,
      'index.html': (name) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${name}</title>
</head>
<body>
  <h1>Hello from Electron!</h1>
</body>
</html>`,
      'README.md': (name) => `# ${name}\n\nElectron application.`,
      '.gitignore': () => 'node_modules/\n.DS_Store\n'
    }
  },
  hardware: {
    name: '硬件开发项目',
    dirs: ['Hardware', 'Software', 'Firmware', 'Documentation', 'PCB', 'BOM', 'Datasheets'],
    files: ['README.md', '.gitignore', 'CHANGELOG.md'],
    fileContents: {
      'README.md': (name) => `# ${name}\n\nHardware project.`,
      '.gitignore': () => '*.sch\n*.brd\n*.backup\n*.depend\n*.o\n*.elf\n*.hex\n*.bak\n*.log\n*.lst\n*.lss\n*.sym\n*.map\n*.eep\n*.bin\n',
      'CHANGELOG.md': () => `# Changelog\n\n## [1.0.0] - ${new Date().toISOString().split('T')[0]}\n### Added\n- Initial release`
    }
  },
  web: {
    name: 'Web 项目',
    dirs: ['src', 'public', 'styles', 'scripts'],
    files: ['index.html', 'styles/main.css', 'scripts/main.js', 'README.md', '.gitignore'],
    fileContents: {
      'index.html': (name) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${name}</title>
  <link rel="stylesheet" href="styles/main.css">
</head>
<body>
  <h1>Hello World</h1>
  <script src="scripts/main.js"></script>
</body>
</html>`,
      'styles/main.css': () => 'body { font-family: sans-serif; margin: 2rem; }',
      'scripts/main.js': () => 'console.log("Hello, world!");',
      'README.md': (name) => `# ${name}\n\nWeb project.`,
      '.gitignore': () => 'node_modules/\n.DS_Store\n'
    }
  },
  todo: {
    name: '清单看板',
    dirs: [],
    files: ['README.md'],
    fileContents: {
      'README.md': (name) => `# ${name}\n\n轻量清单看板项目，支持自定义列。`
    }
  }
};

/**
 * 获取指定名称的模板配置
 *
 * @param name - 模板名称
 * @returns 模板配置对象，名称无效时回退到默认模板
 */
export function getTemplate(name: TemplateName): TemplateConfig {
  return templates[name] || templates.default;
}

/**
 * 获取所有可用模板的名称列表
 *
 * @returns 模板选项数组，每项包含 value（模板标识）和 label（显示名称）
 */
export function getTemplateNames(): { value: TemplateName; label: string }[] {
  return Object.entries(templates).map(([k, v]) => ({ value: k as TemplateName, label: v.name }));
}

/**
 * 生成模板的目录和文件内容
 *
 * 根据模板配置和项目名称，生成所有目录列表和文件内容。
 * 文件内容通过模板中的生成器函数动态生成。
 *
 * @param templateName - 模板名称
 * @param projectName - 项目名称，用于文件内容模板变量替换
 * @returns 包含 dirs（目录列表）和 files（文件路径→内容映射）的对象
 */
export function generateTemplateFiles(templateName: TemplateName, projectName: string): { dirs: string[]; files: Record<string, string> } {
  const tpl = getTemplate(templateName);
  const files: Record<string, string> = {};
  for (const [filename, generator] of Object.entries(tpl.fileContents)) {
    files[filename] = generator(projectName);
  }
  return { dirs: [...tpl.dirs], files };
}
