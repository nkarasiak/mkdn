import { el } from '../utils/dom.js';
import { documentStore } from '../store/document-store.js';
import { toast } from '../ui/toast.js';

let slideContainer = null;
let currentSlide = 0;
let slides = [];

const slideCSS = `
  .slide-container {
    position: fixed;
    inset: 0;
    background: #1a1a2e;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  }
  .slide-content {
    width: 80%;
    max-width: 960px;
    max-height: 80vh;
    color: #fff;
    font-size: 24px;
    line-height: 1.6;
    overflow: auto;
  }
  .slide-content h1 { font-size: 2.5em; margin-bottom: 0.5em; font-weight: 700; }
  .slide-content h2 { font-size: 1.8em; margin-bottom: 0.4em; font-weight: 600; }
  .slide-content h3 { font-size: 1.4em; margin-bottom: 0.3em; }
  .slide-content code { background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 4px; font-size: 0.85em; }
  .slide-content pre { background: rgba(255,255,255,0.08); padding: 20px; border-radius: 8px; overflow-x: auto; }
  .slide-content pre code { background: none; padding: 0; }
  .slide-content blockquote { border-left: 4px solid rgba(255,255,255,0.3); padding-left: 20px; font-style: italic; opacity: 0.85; }
  .slide-content ul, .slide-content ol { padding-left: 1.5em; }
  .slide-content li { margin-bottom: 0.4em; }
  .slide-content img { max-width: 100%; height: auto; border-radius: 8px; }
  .slide-content a { color: #82aaff; }
  .slide-content table { border-collapse: collapse; width: 100%; }
  .slide-content th, .slide-content td { border: 1px solid rgba(255,255,255,0.2); padding: 8px 14px; }
  .slide-content th { background: rgba(255,255,255,0.08); }
  .slide-nav {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 12px;
    align-items: center;
    color: rgba(255,255,255,0.5);
    font-size: 14px;
    font-family: inherit;
    z-index: 10001;
  }
  .slide-nav button {
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.2);
    color: #fff;
    padding: 6px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-family: inherit;
  }
  .slide-nav button:hover { background: rgba(255,255,255,0.2); }
  .slide-exit {
    position: fixed;
    top: 16px;
    right: 16px;
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.2);
    color: #fff;
    padding: 6px 14px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    z-index: 10001;
    font-family: inherit;
  }
  .slide-exit:hover { background: rgba(255,255,255,0.2); }
`;

function markdownSlideToHtml(md) {
  // Reuse the inline formatting from html-export but simplified for slides
  let html = md;
  const lines = html.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(esc(lines[i]));
        i++;
      }
      i++;
      blocks.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
      continue;
    }

    if (line.trim() === '') { i++; continue; }

    const hm = line.match(/^(#{1,6})\s+(.+)/);
    if (hm) { blocks.push(`<h${hm[1].length}>${fmt(hm[2])}</h${hm[1].length}>`); i++; continue; }

    if (/^[-*+]\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(`<li>${fmt(lines[i].replace(/^[-*+]\s/, ''))}</li>`);
        i++;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(`<li>${fmt(lines[i].replace(/^\d+\.\s/, ''))}</li>`);
        i++;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    if (line.startsWith('> ')) {
      const ql = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        ql.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(`<blockquote><p>${fmt(ql.join(' '))}</p></blockquote>`);
      continue;
    }

    // Paragraph
    const pl = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].startsWith('```') && !/^[-*+]\s/.test(lines[i]) && !/^\d+\.\s/.test(lines[i]) && !lines[i].startsWith('> ')) {
      pl.push(lines[i]);
      i++;
    }
    if (pl.length) blocks.push(`<p>${fmt(pl.join(' '))}</p>`);
  }

  return blocks.join('\n');
}

function esc(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function fmt(t) {
  let r = esc(t);
  r = r.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  r = r.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  r = r.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  r = r.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  r = r.replace(/\*(.+?)\*/g, '<em>$1</em>');
  r = r.replace(/~~(.+?)~~/g, '<del>$1</del>');
  r = r.replace(/`([^`]+)`/g, '<code>$1</code>');
  return r;
}

function showSlide(index) {
  if (index < 0 || index >= slides.length) return;
  currentSlide = index;
  const content = slideContainer.querySelector('.slide-content');
  content.innerHTML = slides[currentSlide];
  const counter = slideContainer.querySelector('.slide-counter');
  if (counter) counter.textContent = `${currentSlide + 1} / ${slides.length}`;
}

function handleKey(e) {
  if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    showSlide(currentSlide + 1);
  } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
    e.preventDefault();
    showSlide(currentSlide - 1);
  } else if (e.key === 'Escape') {
    exitSlideMode();
  }
}

export function enterSlideMode() {
  const markdown = documentStore.getMarkdown();

  // Split on --- (horizontal rules) as slide separators
  const slideMarkdowns = markdown.split(/\n---+\n/).map(s => s.trim()).filter(Boolean);

  if (slideMarkdowns.length < 2) {
    toast('Add --- between sections to create slides', 'warning');
    return;
  }

  slides = slideMarkdowns.map(md => markdownSlideToHtml(md));
  currentSlide = 0;

  // Inject styles
  const style = document.createElement('style');
  style.id = 'slide-styles';
  style.textContent = slideCSS;
  document.head.appendChild(style);

  // Create container
  slideContainer = el('div', { className: 'slide-container' },
    el('div', { className: 'slide-content' }),
    el('div', { className: 'slide-nav' },
      el('button', { onClick: () => showSlide(currentSlide - 1) }, 'Prev'),
      el('span', { className: 'slide-counter' }, `1 / ${slides.length}`),
      el('button', { onClick: () => showSlide(currentSlide + 1) }, 'Next'),
    ),
    el('button', { className: 'slide-exit', onClick: exitSlideMode }, 'Exit (Esc)'),
  );

  document.body.appendChild(slideContainer);
  showSlide(0);
  document.addEventListener('keydown', handleKey);

  // Try fullscreen
  try { slideContainer.requestFullscreen?.(); } catch {}
}

export function exitSlideMode() {
  if (slideContainer) {
    slideContainer.remove();
    slideContainer = null;
  }
  const style = document.getElementById('slide-styles');
  if (style) style.remove();
  document.removeEventListener('keydown', handleKey);
  if (document.fullscreenElement) {
    try { document.exitFullscreen(); } catch {}
  }
}

export function exportSlidesHtml() {
  const markdown = documentStore.getMarkdown();
  const slideMarkdowns = markdown.split(/\n---+\n/).map(s => s.trim()).filter(Boolean);

  if (slideMarkdowns.length < 2) {
    toast('Add --- between sections to create slides', 'warning');
    return;
  }

  const slidesHtml = slideMarkdowns.map((md, i) =>
    `<section class="slide" id="slide-${i + 1}">${markdownSlideToHtml(md)}</section>`
  ).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Slides</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #1a1a2e; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    .slide { display: none; min-height: 100vh; padding: 60px 10%; color: #fff; font-size: 24px; line-height: 1.6; align-items: center; justify-content: center; flex-direction: column; }
    .slide.active { display: flex; }
    .slide h1 { font-size: 2.5em; margin-bottom: 0.5em; }
    .slide h2 { font-size: 1.8em; margin-bottom: 0.4em; }
    .slide code { background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 4px; }
    .slide pre { background: rgba(255,255,255,0.08); padding: 20px; border-radius: 8px; width: 100%; overflow-x: auto; }
    .slide pre code { background: none; }
    .slide ul, .slide ol { padding-left: 1.5em; }
    .slide li { margin-bottom: 0.4em; }
    .slide img { max-width: 100%; border-radius: 8px; }
    .nav { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 12px; align-items: center; color: rgba(255,255,255,0.5); font-size: 14px; }
    .nav button { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 6px 16px; border-radius: 6px; cursor: pointer; }
  </style>
</head>
<body>
${slidesHtml}
<div class="nav">
  <button onclick="go(-1)">Prev</button>
  <span id="counter">1 / ${slideMarkdowns.length}</span>
  <button onclick="go(1)">Next</button>
</div>
<script>
let cur = 0;
const slides = document.querySelectorAll('.slide');
slides[0].classList.add('active');
function go(d) {
  slides[cur].classList.remove('active');
  cur = Math.max(0, Math.min(slides.length - 1, cur + d));
  slides[cur].classList.add('active');
  document.getElementById('counter').textContent = (cur+1)+' / '+slides.length;
}
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
});
</script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'slides.html';
  a.click();
  URL.revokeObjectURL(url);

  toast('Slides exported as HTML', 'success');
}
