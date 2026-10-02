(() => {
  'use strict';
  const injected = '__SCHOOLTRACK_API_BASE_URL__';
  const queryValue = new URLSearchParams(location.search).get('api');
  const runtimeValue = typeof window.SCHOOLTRACK_API_BASE_URL === 'string' ? window.SCHOOLTRACK_API_BASE_URL : '';
  const configured = injected.startsWith('__') ? (queryValue || runtimeValue) : injected;
  window.SchoolTrackConfig = Object.freeze({
    apiBaseUrl: String(configured || '').trim().replace(/\/$/, ''),
    refreshStorage: 'memory-only'
  });
})();
