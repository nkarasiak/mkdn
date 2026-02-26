import { el } from '../utils/dom.js';
import { settingsStore } from '../store/settings-store.js';
import { eventBus } from '../store/event-bus.js';
import { STORAGE_CUSTOM_THEME, CUSTOM_THEME_STYLE_ID } from '../constants.js';
const PRESETS = {
  default: { label: 'Default', accent: null, font: null },
  ocean: { label: 'Ocean Blue', accent: '#2563eb', font: null },
  forest: { label: 'Forest Green', accent: '#16a34a', font: null },
  sunset: { label: 'Sunset', accent: '#dc2626', font: null },
  lavender: { label: 'Lavender', accent: '#7c3aed', font: null },
  mono: { label: 'Monochrome', accent: '#525252', font: 'var(--font-mono)' },
};

let customStyleEl = null;

function loadCustomTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_CUSTOM_THEME);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveCustomTheme(theme) {
  try {
    localStorage.setItem(STORAGE_CUSTOM_THEME, JSON.stringify(theme));
  } catch { /* quota exceeded */ }
}

// Validate hex color: #RRGGBB only
function isValidHexColor(val) {
  return typeof val === 'string' && /^#[0-9a-fA-F]{6}$/.test(val);
}

// Validate numeric CSS value within bounds
function isValidNumber(val, min, max) {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  return typeof n === 'number' && !isNaN(n) && n >= min && n <= max;
}

// Allowed font-family values (whitelist) — blocks CSS injection via font property
const ALLOWED_FONTS = new Set([
  '',
  'system-ui, -apple-system, sans-serif',
  "'Georgia', serif",
  "'Palatino Linotype', serif",
  "'Courier New', monospace",
  'var(--font-mono)',
]);

function isValidFont(val) {
  return typeof val === 'string' && ALLOWED_FONTS.has(val);
}

function applyCustomTheme(theme = null) {
  if (!theme) theme = loadCustomTheme();
  if (!customStyleEl) {
    customStyleEl = document.createElement('style');
    customStyleEl.id = CUSTOM_THEME_STYLE_ID;
    document.head.appendChild(customStyleEl);
  }

  const rules = [];

  if (theme.accent && isValidHexColor(theme.accent)) {
    // Generate accent variants
    rules.push(`
      [data-theme="light"] {
        --accent: ${theme.accent};
        --accent-hover: ${adjustBrightness(theme.accent, -15)};
        --accent-light: ${hexToRgba(theme.accent, 0.1)};
      }
      [data-theme="dark"] {
        --accent: ${adjustBrightness(theme.accent, 20)};
        --accent-hover: ${adjustBrightness(theme.accent, 10)};
        --accent-light: ${hexToRgba(theme.accent, 0.15)};
      }
    `);
  }

  if (theme.font && isValidFont(theme.font)) {
    rules.push(`
      .editor-pane .ProseMirror,
      .milkdown .ProseMirror {
        font-family: ${theme.font} !important;
      }
    `);
  }

  if (theme.fontSize && isValidNumber(theme.fontSize, 10, 32)) {
    rules.push(`
      :root {
        --font-size-lg: ${parseInt(theme.fontSize)}px;
      }
    `);
  }

  if (theme.contentWidth && isValidNumber(theme.contentWidth, 400, 1600)) {
    rules.push(`
      :root {
        --content-max-width: ${parseInt(theme.contentWidth)}px;
      }
    `);
  }

  if (theme.lineHeight && isValidNumber(theme.lineHeight, 1.0, 3.0)) {
    rules.push(`
      .editor-pane .ProseMirror,
      .milkdown .ProseMirror {
        line-height: ${parseFloat(theme.lineHeight)} !important;
      }
    `);
  }

  customStyleEl.textContent = rules.join('\n');
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function adjustBrightness(hex, percent) {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  r = Math.min(255, Math.max(0, r + Math.round(r * percent / 100)));
  g = Math.min(255, Math.max(0, g + Math.round(g * percent / 100)));
  b = Math.min(255, Math.max(0, b + Math.round(b * percent / 100)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function openThemeEditor() {
  const theme = loadCustomTheme();

  const accentInput = el('input', {
    type: 'color',
    value: theme.accent || '#E8850C',
    style: { width: '40px', height: '32px', padding: '2px', cursor: 'pointer' },
  });

  const fontSelect = el('select', {},
    el('option', { value: '' }, 'Default (Spectral Serif)'),
    el('option', { value: 'system-ui, -apple-system, sans-serif' }, 'System Sans-Serif'),
    el('option', { value: "'Georgia', serif" }, 'Georgia'),
    el('option', { value: "'Palatino Linotype', serif" }, 'Palatino'),
    el('option', { value: "'Courier New', monospace" }, 'Courier New'),
    el('option', { value: "var(--font-mono)" }, 'Monospace'),
  );
  if (theme.font) fontSelect.value = theme.font;

  const fontSizeInput = el('input', {
    type: 'range',
    min: '14',
    max: '24',
    value: String(theme.fontSize || 19),
    style: { width: '150px' },
  });
  const fontSizeLabel = el('span', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', minWidth: '32px' } },
    `${theme.fontSize || 19}px`,
  );

  const widthInput = el('input', {
    type: 'range',
    min: '500',
    max: '1200',
    value: String(theme.contentWidth || 728),
    style: { width: '150px' },
  });
  const widthLabel = el('span', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', minWidth: '40px' } },
    `${theme.contentWidth || 728}px`,
  );

  const lineHeightInput = el('input', {
    type: 'range',
    min: '1.2',
    max: '2.2',
    step: '0.1',
    value: String(theme.lineHeight || 1.6),
    style: { width: '150px' },
  });
  const lineHeightLabel = el('span', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', minWidth: '32px' } },
    String(theme.lineHeight || 1.6),
  );

  function applyLive() {
    const updated = {
      accent: accentInput.value !== '#E8850C' ? accentInput.value : null,
      font: fontSelect.value || null,
      fontSize: parseInt(fontSizeInput.value) !== 19 ? parseInt(fontSizeInput.value) : null,
      contentWidth: parseInt(widthInput.value) !== 728 ? parseInt(widthInput.value) : null,
      lineHeight: parseFloat(lineHeightInput.value) !== 1.6 ? parseFloat(lineHeightInput.value) : null,
    };
    // Clean nulls
    Object.keys(updated).forEach(k => { if (updated[k] === null) delete updated[k]; });
    saveCustomTheme(updated);
    applyCustomTheme(updated);
  }

  accentInput.addEventListener('input', applyLive);
  fontSelect.addEventListener('change', applyLive);
  fontSizeInput.addEventListener('input', () => {
    fontSizeLabel.textContent = `${fontSizeInput.value}px`;
    applyLive();
  });
  widthInput.addEventListener('input', () => {
    widthLabel.textContent = `${widthInput.value}px`;
    applyLive();
  });
  lineHeightInput.addEventListener('input', () => {
    lineHeightLabel.textContent = lineHeightInput.value;
    applyLive();
  });

  // Preset buttons
  const presetRow = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' } });
  for (const [key, preset] of Object.entries(PRESETS)) {
    const color = preset.accent || '#E8850C';
    const btn = el('button', {
      className: 'theme-preset-btn',
      style: { background: color, color: '#fff', padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)', fontWeight: '500' },
      onClick: () => {
        if (preset.accent) accentInput.value = preset.accent;
        else accentInput.value = '#E8850C';
        if (preset.font) fontSelect.value = preset.font;
        else fontSelect.value = '';
        applyLive();
      },
    }, preset.label);
    presetRow.appendChild(btn);
  }

  // Reset button
  const resetBtn = el('button', {
    style: { marginTop: '12px', padding: '6px 16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' },
    onClick: () => {
      saveCustomTheme({});
      applyCustomTheme({});
      accentInput.value = '#E8850C';
      fontSelect.value = '';
      fontSizeInput.value = '19';
      fontSizeLabel.textContent = '19px';
      widthInput.value = '728';
      widthLabel.textContent = '728px';
      lineHeightInput.value = '1.6';
      lineHeightLabel.textContent = '1.6';
    },
  }, 'Reset to Default');

  // Export / Import
  const exportBtn = el('button', {
    style: { marginTop: '12px', marginLeft: '8px', padding: '6px 16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' },
    onClick: () => {
      const data = JSON.stringify(loadCustomTheme(), null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mkdn-theme.json';
      a.click();
      URL.revokeObjectURL(url);
    },
  }, 'Export Theme');

  const importInput = el('input', { type: 'file', accept: '.json', style: 'display:none' });
  importInput.addEventListener('change', () => {
    const file = importInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result);
        // Only allow known safe keys
        const imported = {};
        if (raw.accent && isValidHexColor(raw.accent)) imported.accent = raw.accent;
        if (raw.font && isValidFont(raw.font)) imported.font = raw.font;
        if (raw.fontSize && isValidNumber(raw.fontSize, 10, 32)) imported.fontSize = raw.fontSize;
        if (raw.contentWidth && isValidNumber(raw.contentWidth, 400, 1600)) imported.contentWidth = raw.contentWidth;
        if (raw.lineHeight && isValidNumber(raw.lineHeight, 1.0, 3.0)) imported.lineHeight = raw.lineHeight;
        saveCustomTheme(imported);
        applyCustomTheme(imported);
        if (imported.accent) accentInput.value = imported.accent;
        if (imported.font) fontSelect.value = imported.font;
        if (imported.fontSize) {
          fontSizeInput.value = String(imported.fontSize);
          fontSizeLabel.textContent = `${imported.fontSize}px`;
        }
      } catch { /* invalid JSON */ }
    };
    reader.readAsText(file);
  });
  const importBtn = el('button', {
    style: { marginTop: '12px', marginLeft: '8px', padding: '6px 16px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' },
    onClick: () => importInput.click(),
  }, 'Import Theme');

  const content = el('div', { className: 'theme-editor' },
    el('p', { style: { marginBottom: '12px', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' } }, 'Presets'),
    presetRow,
    row('Accent Color', accentInput),
    row('Editor Font', fontSelect),
    row('Font Size', el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, fontSizeInput, fontSizeLabel)),
    row('Content Width', el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, widthInput, widthLabel)),
    row('Line Height', el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, lineHeightInput, lineHeightLabel)),
    el('div', { style: { display: 'flex', flexWrap: 'wrap' } }, resetBtn, exportBtn, importBtn),
    importInput,
  );

  import('../ui/modal.js').then(({ showInfo }) => showInfo('Theme Editor', content));
}

function row(label, control) {
  return el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-light)' } },
    el('span', { style: { fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' } }, label),
    control,
  );
}

export function initThemeEditor() {
  // Apply saved custom theme on startup
  applyCustomTheme();
}
