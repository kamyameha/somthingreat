(function (scope) {
  const APP_VERSION = '2026.07.24.120942';

  scope.APP_VERSION = APP_VERSION;
  scope.SOMTHINGREAT_VERSION = APP_VERSION;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { APP_VERSION };
  }
})(typeof self !== 'undefined' ? self : globalThis);