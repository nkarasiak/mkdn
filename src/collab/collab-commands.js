import { commandRegistry } from '../command-palette/command-registry.js';
import { openCollabDialog, createCollabUI, checkUrlForCollabRoom } from './collab-ui.js';
import { collabManager } from './collab-manager.js';
import { toast } from '../ui/toast.js';

export function registerCollabCommands() {
  // Initialize collab UI styles
  createCollabUI();

  // Check URL for collab room
  checkUrlForCollabRoom();

  commandRegistry.registerMany([
    {
      id: 'collab:start',
      label: 'Collaboration: Start Session',
      category: 'Collaboration',
      keywords: ['collaborate', 'share', 'live', 'realtime', 'peer', 'together', 'multiplayer'],
      action: () => {
        if (collabManager.isActive()) {
          openCollabDialog();
        } else {
          openCollabDialog();
        }
      },
    },
    {
      id: 'collab:stop',
      label: 'Collaboration: End Session',
      category: 'Collaboration',
      keywords: ['stop', 'end', 'disconnect', 'leave'],
      action: () => {
        if (collabManager.isActive()) {
          collabManager.stopSession();
        } else {
          toast('No active collaboration session', 'info');
        }
      },
    },
    {
      id: 'collab:copy-link',
      label: 'Collaboration: Copy Share Link',
      category: 'Collaboration',
      keywords: ['share', 'link', 'url', 'copy', 'invite'],
      action: () => {
        const url = collabManager.getShareUrl();
        if (url) {
          navigator.clipboard.writeText(url).then(() => {
            toast('Share URL copied!', 'success');
          });
        } else {
          toast('Start a collaboration session first', 'info');
        }
      },
    },
    {
      id: 'collab:manage',
      label: 'Collaboration: Manage Session',
      category: 'Collaboration',
      keywords: ['manage', 'peers', 'users', 'session'],
      action: openCollabDialog,
    },
  ]);
}
