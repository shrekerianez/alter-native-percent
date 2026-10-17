(() => {
  'use strict';

  const version = '27.9';
  if (typeof self !== 'undefined') self.APP_VERSION = version;

  if (typeof window !== 'undefined') {
    window.APP_VERSION = version;

    if (typeof document !== 'undefined' && !document.querySelector('link[data-alternative-enhancements]')) {
      const root = document.documentElement;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = './enhancements.css';
      link.dataset.alternativeEnhancements = 'true';

      root.style.opacity = '0';
      const reveal = () => { root.style.opacity = ''; };
      link.addEventListener('load', reveal, { once: true });
      link.addEventListener('error', reveal, { once: true });
      window.setTimeout(reveal, 1500);
      document.head.append(link);
    }
  }
})();
