import { registerSW } from 'virtual:pwa-register';
import { fileSaver } from '../save/file-saver.js';
import { toast } from '../ui/toast.js';
import { el } from '../utils/dom.js';

/** Open files launched via the installed PWA's file handler (launch queue API). */
export function initPWA() {
  // New version deployed: offer the reload (session and tabs are saved on pagehide).
  const updateSW = registerSW({
    onNeedRefresh() {
      toast(el('button', { className: 'toast-action', onClick: () => updateSW(true) }, 'MKDN was updated — Reload'), 'info', 0);
    },
  });

  window.launchQueue?.setConsumer(async ({ files }) => {
    for (const handle of files ?? []) {
      await fileSaver.openHandle(handle).catch(() => toast('Failed to open file', 'error'));
    }
  });
}
