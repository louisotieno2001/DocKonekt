// Install the service worker
self.addEventListener('install', function(event) {
    event.waitUntil(
      caches.open('your-app-cache').then(function(cache) {
        return cache.addAll([
          '/',
          '/styles/index.css',
          '/styles/small-devices.css',
          'app.js',
          '/res/Picture4.png',
          '/res/Picture4.png'
          // Add more URLs to cache as needed
        ]);
      })
    );
  });
  
  // Serve cached content when offline
  self.addEventListener('fetch', function(event) {
    event.respondWith(
      caches.match(event.request).then(function(response) {
        return response || fetch(event.request);
      })
    );
  });
  