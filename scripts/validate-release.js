const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function fail(message) {
  throw new Error(message);
}

function loadVersion() {
  const source = read('app-version.js');
  const sandbox = { module: { exports: {} }, globalThis: {} };
  vm.runInNewContext(source, sandbox, { filename: 'app-version.js' });
  const version = sandbox.module.exports.APP_VERSION;
  if (!version) fail('app-version.js must export APP_VERSION.');
  return version;
}

function validateVersionJson(version) {
  const data = JSON.parse(read('version.json'));
  if (data.version !== version) {
    fail(`version.json has "${data.version}" but app-version.js has "${version}".`);
  }
}

function validateIndex(version) {
  const source = read('index.html');
  const assetVersions = Array.from(source.matchAll(/(?:href|src)="(?!https?:\/\/)[^"]+\.(?:css|js)\?v=([^"]+)"/g), match => match[1]);
  if (!assetVersions.length) fail('index.html has no versioned CSS/JS assets.');
  const mismatched = assetVersions.filter(assetVersion => assetVersion !== version);
  if (mismatched.length) fail(`index.html contains asset versions that do not match ${version}: ${[...new Set(mismatched)].join(', ')}`);

  const versionScriptIndex = source.indexOf('src="app-version.js?');
  const appScriptIndex = source.indexOf('src="app.js?');
  if (versionScriptIndex === -1) fail('index.html must load app-version.js.');
  if (appScriptIndex === -1) fail('index.html must load app.js.');
  if (versionScriptIndex > appScriptIndex) fail('index.html must load app-version.js before app.js.');
}

function validateServiceWorker() {
  const source = read('service-worker.js');
  if (!source.includes("importScripts('./app-version.js');")) fail('service-worker.js must import app-version.js.');
  if (!source.includes('const CACHE_NAME = `somthingreat-${APP_VERSION}`;')) fail('service-worker.js must derive CACHE_NAME from APP_VERSION.');
  if (!source.includes('const versionedAsset = asset => `${asset}?v=${APP_VERSION}`;')) fail('service-worker.js must derive asset URLs from APP_VERSION.');
  if (/\.(?:css|js)\?v=/.test(source)) fail('service-worker.js must not hardcode versioned asset URLs.');
  if (!source.includes("versionedAsset('./app-version.js')")) fail('service-worker.js must cache app-version.js as a versioned asset.');
  if (!/filter\(key => key !== CACHE_NAME\)/.test(source) || !/caches\.delete\(key\)/.test(source)) {
    fail('service-worker.js must delete every cache except CACHE_NAME during activation.');
  }
}

function validateApp(version) {
  const source = read('app.js');
  if (!source.includes("const APP_VERSION = window.SOMTHINGREAT_VERSION || window.APP_VERSION || 'dev';")) {
    fail('app.js must read APP_VERSION from app-version.js globals.');
  }
  if (source.includes(`'${version}'`) || source.includes(`"${version}"`)) {
    fail('app.js must not hardcode the current release version.');
  }
  if (!source.includes('fetch(`./version.json?ts=${Date.now()}`, { cache: \'no-store\' })')) {
    fail('checkLiveVersion() must fetch version.json with a no-store request.');
  }
  if (!source.includes('setVersionUpdateReady(latestVersion !== APP_VERSION, latestVersion);')) {
    fail('update banner must compare latest version.json only against the running APP_VERSION.');
  }
  if (!source.includes('updateBannerReady = versionUpdateReady;')) {
    fail('update banner readiness must derive from versionUpdateReady.');
  }
}

function main() {
  const version = loadVersion();
  validateVersionJson(version);
  validateIndex(version);
  validateServiceWorker();
  validateApp(version);
  console.log(`Release validation passed for ${version}.`);
}

main();
