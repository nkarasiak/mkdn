import { localSync } from '../local/local-sync.js';
import { extractWikiLinks, resolveWikiLink } from '../backlinks/backlinks-engine.js';
import { documentStore } from '../store/document-store.js';

/**
 * Collect nodes and edges for the knowledge graph from local files.
 * Returns { nodes: Map<id, Node>, edges: Edge[] }
 *
 * Node = { id, name, path, x, y, vx, vy, linkCount, isCurrent }
 * Edge = { source, target, type: 'wikilink'|'similarity', weight }
 */
export async function collectGraphData({ includeSemanticLinks = false } = {}) {
  const files = localSync.getFiles();
  if (!files?.length) return { nodes: new Map(), edges: [] };

  const currentFile = documentStore.getFileName();
  const nodes = new Map();
  const edges = [];
  const edgeSet = new Set(); // Dedup edges

  // Create nodes for all files
  for (const file of files) {
    const id = file.path || file.name;
    nodes.set(id, {
      id,
      name: file.name.replace(/\.md$/i, ''),
      path: file.path || file.name,
      x: Math.random() * 600 - 300,
      y: Math.random() * 600 - 300,
      vx: 0,
      vy: 0,
      linkCount: 0,
      isCurrent: file.name === currentFile,
      hasEmbedding: false,
    });
  }

  // Read file contents and extract wiki-links
  const batchSize = 20;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    await Promise.all(batch.map(async (file) => {
      try {
        const content = await localSync.readFileContent(file.path);
        if (!content) return;

        const links = extractWikiLinks(content);
        const sourceId = file.path || file.name;

        for (const link of links) {
          const resolved = resolveWikiLink(link.target, files);
          if (!resolved) continue;

          const targetId = resolved.path || resolved.name;
          if (targetId === sourceId) continue; // Skip self-links

          const edgeKey = [sourceId, targetId].sort().join('::');
          if (edgeSet.has(edgeKey)) continue;
          edgeSet.add(edgeKey);

          edges.push({
            source: sourceId,
            target: targetId,
            type: 'wikilink',
            weight: 1,
          });

          // Increment link counts
          const sNode = nodes.get(sourceId);
          const tNode = nodes.get(targetId);
          if (sNode) sNode.linkCount++;
          if (tNode) tNode.linkCount++;
        }
      } catch { /* skip unreadable files */ }
    }));
  }

  // Optionally add semantic similarity edges
  if (includeSemanticLinks) {
    try {
      const { vectorDB } = await import('../search/vector-db.js');
      const { embeddingEngine } = await import('../search/embedding-engine.js');

      const allEmbeddings = await vectorDB.getAll();
      if (allEmbeddings.length > 1) {
        const SIMILARITY_THRESHOLD = 0.5;

        // Mark nodes that have embeddings
        for (const emb of allEmbeddings) {
          const node = nodes.get(emb.path);
          if (node) node.hasEmbedding = true;
        }

        // Compare all pairs (O(n^2) but acceptable for <500 files)
        for (let i = 0; i < allEmbeddings.length; i++) {
          for (let j = i + 1; j < allEmbeddings.length; j++) {
            const a = allEmbeddings[i];
            const b = allEmbeddings[j];
            if (!a.embedding || !b.embedding) continue;

            const sim = embeddingEngine.cosineSimilarity(a.embedding, b.embedding);
            if (sim < SIMILARITY_THRESHOLD) continue;

            const edgeKey = [a.path, b.path].sort().join('::sim::');
            if (edgeSet.has(edgeKey)) continue;
            edgeSet.add(edgeKey);

            edges.push({
              source: a.path,
              target: b.path,
              type: 'similarity',
              weight: sim,
            });
          }
        }
      }
    } catch { /* semantic search not available */ }
  }

  return { nodes, edges };
}
