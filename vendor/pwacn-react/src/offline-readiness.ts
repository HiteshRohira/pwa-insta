import { useEffect, useState } from 'react';

export type OfflineReadiness = 'preparing' | 'ready' | 'unavailable' | 'unsupported';

/** Register a pwacn offline worker and report the verified state of its current build. */
export function useOfflineReadiness(swUrl = '/sw.js'): OfflineReadiness {
  const [state, setState] = useState<OfflineReadiness>('preparing');
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setState('unsupported');
      return;
    }
    let mounted = true;
    const update = (event: MessageEvent) => {
      if (event.data?.type === 'pwacn:offline' && mounted)
        setState(event.data.ready ? 'ready' : 'unavailable');
    };
    const query = () =>
      navigator.serviceWorker.controller?.postMessage({ type: 'pwacn:offline-status' });
    const online = () => {
      setState('preparing');
      query();
      void navigator.serviceWorker.register(swUrl).catch(() => setState('unavailable'));
    };
    navigator.serviceWorker.addEventListener('message', update);
    navigator.serviceWorker.addEventListener('controllerchange', query);
    window.addEventListener('online', online);
    window.addEventListener('pageshow', query);
    window.addEventListener('offline', query);
    const visible = () => {
      if (document.visibilityState === 'visible') query();
    };
    document.addEventListener('visibilitychange', visible);
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register(swUrl);
        const installing = registration.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'redundant' && mounted) setState('unavailable');
          if (installing.state === 'activated') query();
        });
        query();
      } catch {
        if (mounted) setState('unavailable');
      }
    };
    void register();
    return () => {
      mounted = false;
      navigator.serviceWorker.removeEventListener('message', update);
      navigator.serviceWorker.removeEventListener('controllerchange', query);
      window.removeEventListener('online', online);
      window.removeEventListener('pageshow', query);
      window.removeEventListener('offline', query);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [swUrl]);
  return state;
}
