import { fileSaver } from '../save/file-saver.js';
import { toast } from '../ui/toast.js';

/** Open files launched via the installed PWA's file handler (launch queue API). */
export function initPWA() {
  window.launchQueue?.setConsumer(async ({ files }) => {
    for (const handle of files ?? []) {
      await fileSaver.openHandle(handle).catch(() => toast('Failed to open file', 'error'));
    }
  });
}
