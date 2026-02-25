import { documentStore } from '../store/document-store.js';
import { eventBus } from '../store/event-bus.js';
import { localSync } from '../local/local-sync.js';

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

// Cache file contents to avoid re-reading all files on every backlink scan.
// Invalidated on local:files-updated events.
const contentCache = new Map();
let cacheValid = false;

eventBus.on('local:files-updated', () => {
  contentCache.clear();
  cacheValid = false;
});

/**
 * Extract all [[wiki-link]] references from markdown content.
 * Returns an array of { raw, target, display } objects.
 * Supports [[page]] and [[page|display text]] syntax.
 */
export function extractWikiLinks(markdown) {
  if (!markdown) return [];
  const links = [];
  let match;
  WIKILINK_RE.lastIndex = 0;
  while ((match = WIKILINK_RE.exec(markdown)) !== null) {
    const raw = match[1];
    const parts = raw.split('|');
    links.push({
      raw,
      target: parts[0].trim(),
      display: (parts[1] || parts[0]).trim(),
    });
  }
  return links;
}

/**
 * Resolve a wiki-link target to a file path.
 * Tries exact match first, then case-insensitive, then partial name match.
 */
export function resolveWikiLink(target, files) {
  if (!files || !files.length) return null;

  // Normalize: add .md extension if missing
  const normalized = target.endsWith('.md') ? target : `${target}.md`;

  // Exact match on file name
  const exact = files.find(f => f.name === normalized || f.name === target);
  if (exact) return exact;

  // Case-insensitive match
  const lower = normalized.toLowerCase();
  const ci = files.find(f => f.name.toLowerCase() === lower);
  if (ci) return ci;

  // Match by filename without extension
  const targetBase = target.replace(/\.md$/i, '').toLowerCase();
  const partial = files.find(f => {
    const nameBase = f.name.replace(/\.md$/i, '').toLowerCase();
    return nameBase === targetBase;
  });
  if (partial) return partial;

  // Match by path ending
  const pathMatch = files.find(f => {
    const pathBase = f.path.replace(/\.md$/i, '').toLowerCase();
    return pathBase.endsWith(targetBase) || pathBase.endsWith(`/${targetBase}`);
  });
  return pathMatch || null;
}

/**
 * Scan all local files for backlinks to the current document.
 * Returns an array of { fileName, path, links } where links are the wiki-links
 * that reference the current file.
 */
export async function findBacklinks(currentFileName, files) {
  if (!currentFileName || !files?.length) return [];

  const currentBase = currentFileName.replace(/\.md$/i, '').toLowerCase();
  const backlinks = [];

  for (const file of files) {
    // Skip the current file
    if (file.name.replace(/\.md$/i, '').toLowerCase() === currentBase) continue;

    try {
      let content = contentCache.get(file.path);
      if (content === undefined) {
        content = await localSync.readFileContent(file.path);
        if (content != null) contentCache.set(file.path, content);
      }
      if (!content) continue;

      const links = extractWikiLinks(content);
      const matching = links.filter(link => {
        const linkBase = link.target.replace(/\.md$/i, '').toLowerCase();
        return linkBase === currentBase;
      });

      if (matching.length > 0) {
        backlinks.push({
          fileName: file.name,
          path: file.path,
          links: matching,
        });
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return backlinks;
}

/**
 * Get all outgoing wiki-links from the current document.
 */
export function getOutgoingLinks() {
  const markdown = documentStore.getMarkdown();
  return extractWikiLinks(markdown);
}
