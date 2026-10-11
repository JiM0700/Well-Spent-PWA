import { defineConfig } from 'vite';

function offlineShell() {
  return {
    name: 'well-spent-offline-shell',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle).filter(name => /\.(?:js|css|svg|png)$/.test(name));
      const shell = ['index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', ...assets];
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `const CACHE='well-spent-react-v9';\nconst SHELL=${JSON.stringify(shell)};\nconst base=self.registration.scope;\nself.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL.map(path=>new URL(path,base).href))).then(()=>self.skipWaiting())));\nself.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('well-spent-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));\nself.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(new URL('index.html',base),copy))}return response}).catch(()=>caches.match(new URL('index.html',base))));return}event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)))});\n`
      });
    }
  };
}

export default defineConfig({
  base: './',
  server: {port: 8000, strictPort: true},
  preview: {port: 8000, strictPort: true},
  plugins: [offlineShell()]
});
