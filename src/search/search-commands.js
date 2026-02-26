import { commandRegistry } from '../command-palette/command-registry.js';
import { openSearchPanel, closeSearchPanel, findRelatedDocuments, initAutoIndex } from './semantic-search-ui.js';

let autoIndexed = false;

export function registerSearchCommands() {
  commandRegistry.registerMany([
    {
      id: 'search:semantic',
      label: 'Semantic Search',
      category: 'Search',
      keywords: ['search', 'semantic', 'meaning', 'find', 'similar', 'natural', 'language'],
      action: () => {
        if (!autoIndexed) { initAutoIndex(); autoIndexed = true; }
        openSearchPanel();
      },
    },
    {
      id: 'search:related',
      label: 'Find Related Documents',
      category: 'Search',
      keywords: ['related', 'similar', 'notes', 'documents', 'connections'],
      action: findRelatedDocuments,
    },
  ]);
}
