import { el, injectStyles } from '../utils/dom.js';
import { documentStore } from '../store/document-store.js';
import { toast } from '../ui/toast.js';
import { STORAGE_CUSTOM_TEMPLATES } from '../constants.js';

const BUILTIN_TEMPLATES = [
  {
    id: 'blank',
    name: 'Blank Document',
    description: 'Start with a clean slate',
    content: '',
  },
  {
    id: 'blog-post',
    name: 'Blog Post',
    description: 'Structured blog post with sections',
    content: `# Blog Post Title

*Published on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}*

## Introduction

Start with a hook that grabs the reader's attention.

## Main Point

Elaborate on your main argument or topic here.

## Key Takeaways

- First takeaway
- Second takeaway
- Third takeaway

## Conclusion

Wrap up your thoughts and include a call to action.

---

*Thanks for reading!*
`,
  },
  {
    id: 'meeting-notes',
    name: 'Meeting Notes',
    description: 'Template for meeting minutes',
    content: `# Meeting Notes

**Date:** ${new Date().toLocaleDateString()}
**Attendees:**
**Location:**

## Agenda

1. Topic 1
2. Topic 2
3. Topic 3

## Discussion

### Topic 1

Notes here...

### Topic 2

Notes here...

## Action Items

- [ ] Action item 1 — @person — Due date
- [ ] Action item 2 — @person — Due date
- [ ] Action item 3 — @person — Due date

## Next Meeting

**Date:** TBD
`,
  },
  {
    id: 'journal',
    name: 'Daily Journal',
    description: 'Daily reflection and gratitude',
    content: `# ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

## Morning Intentions

What do I want to accomplish today?

-

## Gratitude

Three things I'm grateful for:

1.
2.
3.

## Notes & Reflections



## End of Day Review

What went well? What could improve?

`,
  },
  {
    id: 'readme',
    name: 'README',
    description: 'Project README with standard sections',
    content: `# Project Name

Short description of the project.

## Features

- Feature 1
- Feature 2
- Feature 3

## Installation

\`\`\`bash
npm install project-name
\`\`\`

## Usage

\`\`\`javascript
import { something } from 'project-name';
\`\`\`

## API Reference

### \`functionName(param)\`

Description of the function.

| Parameter | Type | Description |
|-----------|------|-------------|
| param | string | Description |

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Open a pull request

## License

MIT
`,
  },
  {
    id: 'todo',
    name: 'To-Do List',
    description: 'Simple task list with categories',
    content: `# To-Do List

## High Priority

- [ ] Task 1
- [ ] Task 2

## Medium Priority

- [ ] Task 3
- [ ] Task 4

## Low Priority

- [ ] Task 5

## Done

- [x] Completed task
`,
  },
  {
    id: 'weekly-review',
    name: 'Weekly Review',
    description: 'Weekly planning and reflection',
    content: `# Weekly Review — Week of ${new Date().toLocaleDateString()}

## Accomplishments

What did I achieve this week?

-

## Challenges

What obstacles did I face?

-

## Lessons Learned

-

## Next Week's Goals

1.
2.
3.

## Notes

`,
  },
  {
    id: 'technical-spec',
    name: 'Technical Spec',
    description: 'Design document for a technical project',
    content: `# Technical Specification: [Feature Name]

**Author:** [Name]
**Date:** ${new Date().toLocaleDateString()}
**Status:** Draft

## Summary

One paragraph overview of the proposed change.

## Motivation

Why is this change needed? What problem does it solve?

## Proposed Solution

### Architecture

Describe the high-level architecture.

### API Changes

\`\`\`
// Example API
\`\`\`

### Data Model

| Field | Type | Description |
|-------|------|-------------|
|       |      |             |

## Alternatives Considered

1. **Alternative A** — Why rejected
2. **Alternative B** — Why rejected

## Implementation Plan

1. Phase 1: ...
2. Phase 2: ...

## Open Questions

- Question 1?
- Question 2?
`,
  },
];

function loadCustomTemplates() {
  try {
    const stored = localStorage.getItem(STORAGE_CUSTOM_TEMPLATES);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveCustomTemplates(templates) {
  try {
    localStorage.setItem(STORAGE_CUSTOM_TEMPLATES, JSON.stringify(templates));
  } catch { /* quota exceeded */ }
}

export function openTemplateChooser() {
  const customTemplates = loadCustomTemplates();
  const allTemplates = [...BUILTIN_TEMPLATES, ...customTemplates];

  const container = el('div', { className: 'template-chooser' });

  // "Save current as template" button
  const saveAsBtn = el('button', {
    className: 'template-save-btn',
    onClick: () => {
      const name = prompt('Template name:');
      if (!name) return;
      const content = documentStore.getMarkdown();
      const custom = loadCustomTemplates();
      custom.push({
        id: `custom-${Date.now()}`,
        name,
        description: 'Custom template',
        content,
        custom: true,
      });
      saveCustomTemplates(custom);
      toast(`Template "${name}" saved`, 'success');
      // Refresh the modal
      import('../ui/modal.js').then(({ closeModal }) => {
        closeModal();
        openTemplateChooser();
      });
    },
  }, '+ Save current document as template');

  container.appendChild(saveAsBtn);

  for (const template of allTemplates) {
    const card = el('div', {
      className: 'template-card',
      onClick: () => {
        documentStore.newDocument();
        // Small delay to let newDocument clear state
        requestAnimationFrame(() => {
          documentStore.setMarkdown(template.content, 'new-document');
          import('../ui/modal.js').then(({ closeModal }) => closeModal());
          toast(`Created from "${template.name}"`, 'success');
        });
      },
    },
      el('div', { className: 'template-card-name' }, template.name),
      el('div', { className: 'template-card-desc' }, template.description),
    );

    // Delete button for custom templates
    if (template.custom) {
      const deleteBtn = el('button', {
        className: 'template-delete-btn',
        onClick: (e) => {
          e.stopPropagation();
          const custom = loadCustomTemplates().filter(t => t.id !== template.id);
          saveCustomTemplates(custom);
          card.remove();
          toast('Template deleted', 'info');
        },
      }, '\u00d7');
      card.appendChild(deleteBtn);
    }

    container.appendChild(card);
  }

  import('../ui/modal.js').then(({ showInfo }) => showInfo('New from Template', container));
}

// Inject styles
injectStyles(`
  .template-chooser {
    min-width: 360px;
    max-height: 400px;
    overflow-y: auto;
  }
  .template-save-btn {
    width: 100%;
    padding: 10px;
    margin-bottom: 12px;
    background: var(--bg-secondary);
    border: 1px dashed var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: background var(--transition-fast);
  }
  .template-save-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
  .template-card {
    position: relative;
    padding: 12px;
    margin-bottom: 6px;
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: background var(--transition-fast);
  }
  .template-card:hover {
    background: var(--bg-hover);
  }
  .template-card-name {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 2px;
  }
  .template-card-desc {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }
  .template-delete-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-size: 14px;
    color: var(--text-muted);
    background: transparent;
  }
  .template-delete-btn:hover {
    background: var(--error);
    color: white;
  }
`);
