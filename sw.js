// =========================================================
// sw.js: "service worker", lo que permite abrir la app sin internet.
// Guarda una copia de los archivos de la app (NO de tus datos:
// esos siguen en el almacenamiento del navegador).
// =========================================================

// Si cambias la lista de archivos, sube este número (v2, v3...)
const CACHE = 'mis-finanzas-v1';

const ARCHIVOS = [
  './',
  './index.html',
  './estilos.css',
  './datos.js',
  './graficas.js',
  './app.js',
  './manifest.webmanifest',
  './icono-180.png',
  './icono-192.png',
  './icono-512.png',
];

// Al instalarse, guarda una copia de todos los archivos
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ARCHIVOS))
      .then(() => self.skipWaiting()),
  );
});

// Al activarse, borra las copias de versiones anteriores
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(
        nombres.filter((n) => n !== CACHE).map((n) => caches.delete(n)),
      ))
      .then(() => self.clients.claim()),
  );
});

// Cada vez que la app pide un archivo: primero intenta traerlo de internet
// (así recibes las actualizaciones) y si no hay conexión usa la copia guardada.
self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') return;
  if (new URL(evento.request.url).origin !== location.origin) return;

  evento.respondWith(
    fetch(evento.request)
      .then((respuesta) => {
        if (respuesta.ok) {
          const copia = respuesta.clone();
          caches.open(CACHE).then((cache) => cache.put(evento.request, copia));
        }
        return respuesta;
      })
      .catch(() => caches.match(evento.request, { ignoreSearch: true })
        .then((guardado) => guardado ?? caches.match('./index.html'))),
  );
});
