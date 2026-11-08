// 오프라인 지원: 앱 파일을 캐시. 새 버전 배포 시 VERSION을 올리면 캐시가 갱신됨
const VERSION = 'popshot-v8';
const CORE = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'js/main.js', 'js/game.js', 'js/world.js', 'js/targets.js', 'js/scenarios.js', 'js/hud.js', 'js/audio.js',
  'js/storage.js', 'js/i18n.js', 'js/analysis.js', 'js/custom.js',
  'vendor/three.module.min.js',
  'vendor/addons/postprocessing/EffectComposer.js', 'vendor/addons/postprocessing/RenderPass.js',
  'vendor/addons/postprocessing/UnrealBloomPass.js', 'vendor/addons/postprocessing/OutputPass.js',
  'vendor/addons/postprocessing/Pass.js', 'vendor/addons/postprocessing/ShaderPass.js', 'vendor/addons/postprocessing/MaskPass.js',
  'vendor/addons/shaders/CopyShader.js', 'vendor/addons/shaders/LuminosityHighPassShader.js', 'vendor/addons/shaders/OutputShader.js',
  'vendor/addons/environments/RoomEnvironment.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// 네트워크 우선 → 실패하면 캐시 (항상 최신 버전을 쓰되 오프라인에서도 동작)
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && new URL(req.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
  );
});
