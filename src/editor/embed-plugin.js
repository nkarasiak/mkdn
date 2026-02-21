import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { el } from '../utils/dom.js';
import { eventBus } from '../store/event-bus.js';

export const embedKey = new PluginKey('embed');

// --- URL matchers ---

const youtubeRe = /^https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})(?:[?&].*)?$/;
const tweetRe = /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/\w+\/status\/(\d+)(?:\?.*)?$/;

export function extractYouTubeId(url) {
  const m = url.match(youtubeRe);
  return m ? m[1] : null;
}

export function extractTweetId(url) {
  const m = url.match(tweetRe);
  return m ? m[1] : null;
}

function isEmbedUrl(url) {
  return youtubeRe.test(url) || tweetRe.test(url);
}

// --- Twitter widget.js loader ---

let twttrLoadState = 'idle'; // 'idle' | 'loading' | 'loaded'

function ensureTwitterWidgets() {
  if (twttrLoadState !== 'idle') return;
  twttrLoadState = 'loading';
  const script = document.createElement('script');
  script.src = 'https://platform.twitter.com/widgets.js';
  script.async = true;
  script.onload = () => { twttrLoadState = 'loaded'; };
  document.head.appendChild(script);
}

function waitForTwttr(timeout = 10000) {
  if (window.twttr?.widgets) return Promise.resolve(window.twttr);
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (window.twttr?.widgets) return resolve(window.twttr);
      if (Date.now() - start > timeout) return reject(new Error('twttr timeout'));
      setTimeout(check, 100);
    };
    check();
  });
}

// --- Widget builders ---

function createYouTubeEmbed(videoId) {
  const iframe = el('iframe', {
    src: `https://www.youtube.com/embed/${videoId}`,
    frameborder: '0',
    loading: 'lazy',
    allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
    allowfullscreen: '',
  });
  iframe.className = 'embed-youtube-iframe';

  return el('div', { className: 'embed-wrapper embed-youtube' }, iframe);
}

function createTweetEmbed(tweetId) {
  const container = el('div', { className: 'embed-wrapper embed-tweet' });
  const inner = el('div', { className: 'embed-tweet-inner' });
  container.appendChild(inner);

  ensureTwitterWidgets();
  const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  waitForTwttr().then(twttr => {
    twttr.widgets.createTweet(tweetId, inner, { theme, dnt: true });
  }).catch(() => {
    inner.textContent = `Tweet ${tweetId} could not be loaded.`;
  });

  return container;
}

// --- Decoration builder ---

function getLinkUrl(node) {
  // Check if paragraph has a single child that is a text node with a single link mark
  if (node.childCount !== 1) return null;
  const child = node.firstChild;
  if (!child.isText) return null;
  const linkMark = child.marks.find(m => m.type.name === 'link');
  if (!linkMark) return null;
  // The entire paragraph text must be the link (no surrounding text)
  const href = linkMark.attrs.href;
  if (child.text.trim() === href || child.text.trim() === decodeURI(href)) {
    return href;
  }
  // Also match if text is a shortened display like the URL itself
  return href;
}

function buildDecorations(doc) {
  const decorations = [];

  doc.forEach((node, pos) => {
    if (node.type.name !== 'paragraph') return;
    const url = getLinkUrl(node);
    if (!url) return;

    const videoId = extractYouTubeId(url);
    const tweetId = extractTweetId(url);
    if (!videoId && !tweetId) return;

    // Hide the link paragraph visually
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, { class: 'embed-hidden-link' })
    );

    // Place widget decoration at the end of the paragraph node
    const widgetPos = pos + node.nodeSize;
    decorations.push(
      Decoration.widget(widgetPos, () => {
        if (videoId) return createYouTubeEmbed(videoId);
        return createTweetEmbed(tweetId);
      }, { side: -1, key: `embed-${url}` })
    );
  });

  return DecorationSet.create(doc, decorations);
}

// --- Theme sync for tweet re-renders ---

let currentPlugin = null;

eventBus.on('settings:theme', () => {
  // Force a re-render of decorations on theme change
  if (!currentPlugin) return;
  try {
    // The plugin will pick up the meta and rebuild decorations
    const view = currentPlugin._view;
    if (view) {
      const tr = view.state.tr.setMeta('embed-theme-change', true);
      view.dispatch(tr);
    }
  } catch { /* ignore */ }
});

// --- ProseMirror plugin ---

export function createEmbedPlugin() {
  const plugin = new Plugin({
    key: embedKey,
    state: {
      init(_, state) {
        return buildDecorations(state.doc);
      },
      apply(tr, old, _oldState, newState) {
        if (tr.docChanged || tr.getMeta('embed-theme-change')) {
          return buildDecorations(newState.doc);
        }
        return old;
      },
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
      handlePaste(view, event) {
        const text = event.clipboardData?.getData('text/plain')?.trim();
        if (!text) return false;

        // Only handle single-line bare URLs
        if (text.includes('\n')) return false;
        if (!isEmbedUrl(text)) return false;

        event.preventDefault();

        const { state, dispatch } = view;
        const { schema } = state;
        const linkMark = schema.marks.link.create({ href: text });
        const linkNode = schema.text(text, [linkMark]);
        const paragraph = schema.nodes.paragraph.create(null, linkNode);

        // Insert the paragraph at current selection
        const tr = state.tr.replaceSelectionWith(paragraph).scrollIntoView();
        dispatch(tr);
        return true;
      },
    },
    view(editorView) {
      currentPlugin = { _view: editorView };
      return {
        update(view) {
          currentPlugin._view = view;
        },
        destroy() {
          currentPlugin = null;
        },
      };
    },
  });

  return plugin;
}
