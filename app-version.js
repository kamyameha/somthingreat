(function (scope) {
  const APP_VERSION = '2026.07.17.152500';

  scope.APP_VERSION = APP_VERSION;
  scope.SOMTHINGREAT_VERSION = APP_VERSION;

  if (typeof document !== 'undefined') {
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = `preview-actions.css?v=${APP_VERSION}`;
    document.head.appendChild(style);

    scope.addEventListener('load', () => {
      const script = document.createElement('script');
      script.src = `preview-actions.js?v=${APP_VERSION}`;
      document.body.appendChild(script);
    }, { once: true });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { APP_VERSION };
  }
})(typeof self !== 'undefined' ? self : globalThis);
