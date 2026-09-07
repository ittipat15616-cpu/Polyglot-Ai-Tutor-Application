try {
  if (typeof window !== 'undefined' && window.fetch) {
    const originalFetch = window.fetch;
    Object.defineProperty(window, 'fetch', {
      get: () => originalFetch,
      set: () => { console.warn("Prevented window.fetch override"); },
      configurable: true
    });
  }
} catch(e) {}
