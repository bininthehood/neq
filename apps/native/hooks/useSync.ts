import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { syncAll, shouldSync, setLastSyncTime, pushToServer } from '../lib/sync';

export function useSync() {
  const syncing = useRef(false);

  const doSync = async () => {
    if (syncing.current) return;
    if (!(await shouldSync(5))) return;

    syncing.current = true;
    try {
      const result = await syncAll();
      if (result.success) {
        await setLastSyncTime();
        if (result.pulled > 0 || result.pushed > 0) {
          console.log(`[useSync] synced: pulled ${result.pulled}, pushed ${result.pushed}`);
        }
      }
    } catch (err) {
      console.error('[useSync] sync error:', err);
    } finally {
      syncing.current = false;
    }
  };

  useEffect(() => {
    doSync();

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        doSync();
      } else if (state === 'background') {
        pushToServer()
          .then((r) => { if (r.success) setLastSyncTime(); })
          .catch((err) => console.error('[useSync] push on background failed:', err));
      }
    });

    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
