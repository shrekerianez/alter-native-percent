(() => {
  'use strict';
  const version = '27.9';
  if (typeof self !== 'undefined') self.APP_VERSION = version;
  if (typeof window !== 'undefined') window.APP_VERSION = version;
})();
