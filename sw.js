const CACHE_VERSION = 'lofiland-v1';
const MAX_AUDIO_ENTRIES = 80;
const MAX_RESPONSE_BYTES = 25 * 1024 * 1024;
const AUDIO_EXTS = ['.ogg', '.wav', '.mp3'];

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (isAudioRequest(url)) {
    event.respondWith(handleAudioRequest(event));
    return;
  }

  if (isManifestRequest(url) || isDocumentRequest(request, url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
});

function isDocumentRequest(request, url) {
  if (request.mode === 'navigate') return true;
  const path = url.pathname;
  return path.endsWith('/index.html') || path === '/' || path === '';
}

function isManifestRequest(url) {
  return url.pathname.endsWith('manifest.json');
}

function isAudioRequest(url) {
  if (!url.pathname.includes('/packs/')) return false;
  return AUDIO_EXTS.some((ext) => url.pathname.endsWith(ext));
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => cacheResponse(cache, request, response))
    .catch(() => null);

  if (cached) {
    // Update in background.
    if (networkPromise) {
      networkPromise.catch(() => {});
    }
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;
  return new Response('Offline', { status: 503, statusText: 'Offline' });
}

async function handleAudioRequest(event) {
  const { request } = event;
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);

  const networkFetch = (async () => {
    try {
      const response = await fetch(request);
      await cacheAudio(cache, request, response.clone());
      return response;
    } catch (err) {
      return null;
    }
  })();

  if (cached) {
    event.waitUntil(networkFetch.catch(() => {}));
    return cached;
  }

  const response = await networkFetch;
  if (response) return response;
  return new Response('Offline', { status: 503, statusText: 'Offline' });
}

async function cacheResponse(cache, request, response) {
  if (!response || !response.ok) return response;
  const sizeOk = await withinSizeLimit(response.clone());
  if (!sizeOk) return response;
  try {
    await cache.put(request, response.clone());
  } catch (err) {
    // Ignore cache put errors.
  }
  return response;
}

async function cacheAudio(cache, request, response) {
  if (!response || !response.ok) return;
  const sizeOk = await withinSizeLimit(response.clone());
  if (!sizeOk) return;
  try {
    await cache.put(request, response.clone());
    await enforceAudioLimit(cache);
  } catch (err) {
    // Ignore cache put errors.
  }
}

async function withinSizeLimit(response) {
  try {
    const buf = await response.arrayBuffer();
    return buf.byteLength <= MAX_RESPONSE_BYTES;
  } catch (err) {
    return false;
  }
}

async function enforceAudioLimit(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_AUDIO_ENTRIES) return;
  const excess = keys.length - MAX_AUDIO_ENTRIES;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}
