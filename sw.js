// ========================
// SERVICE WORKER متقدم
// يدعم الأوفلاين الأساسي + توليد أيقونات مشغل الفيديو ديناميكيًا
// ========================

const CACHE_NAME = 'hashim-video-pwa-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/sw.js'
];

// تثبيت الـ SW وتخزين الملفات الأساسية
self.addEventListener('install', (event) => {
  console.log('[SW] Installing ...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// تنظيف الإصدارات القديمة
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating ...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Removing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

/**
 * توليد أيقونة PNG ديناميكية لمشغل الفيديو باستخدام OffscreenCanvas
 * تصميم احترافي: خلفية بنفسجية داكنة مع مثلث تشغيل أزرق فاتح
 */
async function generateVideoIcon(width, height) {
  // استخدام OffscreenCanvas للرسم داخل Service Worker
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // خلفية متدرجة جذابة
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#3a0ca3');
  gradient.addColorStop(1, '#7209b7');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  // إطار خارجي بحدود نيون
  ctx.strokeStyle = '#00d2ff';
  ctx.lineWidth = width * 0.04;
  ctx.strokeRect(width * 0.05, height * 0.05, width * 0.9, height * 0.9);
  
  // رسم دائرة خلفية للزر
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = width * 0.28;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#000000AA';
  ctx.fill();
  ctx.shadowBlur = 12;
  ctx.shadowColor = '#00d2ff';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.strokeStyle = '#00d2ff';
  ctx.lineWidth = width * 0.025;
  ctx.stroke();
  
  // مثلث التشغيل (play icon)
  const triangleSize = width * 0.22;
  const triangleOffsetX = width * 0.06; // إزاحة بسيطة لمركز بصري
  ctx.beginPath();
  const x1 = centerX - triangleSize/2 + triangleOffsetX;
  const y1 = centerY - triangleSize/2;
  const x2 = x1;
  const y2 = centerY + triangleSize/2;
  const x3 = centerX + triangleSize/2 + triangleOffsetX;
  const y3 = centerY;
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.shadowBlur = 0;
  
  // إضافة تفاصيل : دائرة صغيرة خارجية
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.85, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffd966';
  ctx.lineWidth = width * 0.012;
  ctx.stroke();
  
  // أخيراً, تحويل إلى Blob ثم Response
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Response(blob, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=31536000' }
  });
}

// اعتراض طلبات الأيقونات وتوليدها مباشرةً مع خدمة ممتازة
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // توليد أيقونات المشغل ديناميكيًا بناءً على الطلب
  if (url.pathname === '/icons/icon-192.png' || url.pathname === '/icons/icon-512.png') {
    const size = url.pathname.includes('512') ? 512 : 192;
    event.respondWith(generateVideoIcon(size, size));
    return;
  }
  
  // إذا كان الطلب لملف داخل مجلد icons بشكل عام (احتياطي)
  if (url.pathname.startsWith('/icons/') && (url.pathname.endsWith('.png') || url.pathname.endsWith('.jpg'))) {
    const finalSize = url.pathname.includes('512') ? 512 : 192;
    event.respondWith(generateVideoIcon(finalSize, finalSize));
    return;
  }
  
  // استراتيجية التخزين المؤقت: Cache First ثم شبكة للملفات الثابتة مع تحديث في الخلفية
  // للملفات الأساسية (HTML, JS, Manifest) نستخدم cache-first مما يعطي أداء ممتاز ويعمل Offline
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // تحديث الكاش في الخلفية للصفحة الرئيسية (stale-while-revalidate)
        if (event.request.url.includes('index.html') || event.request.url === '/') {
          fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
            }
          }).catch(console.log);
        }
        return cachedResponse;
      }
      // إذا لم يكن في الكاش، نذهب للشبكة
      return fetch(event.request).then(networkResponse => {
        // نضيف إلى الكاش إذا كان طلب GET و صالح
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // صفحة أوفلان بديلة صغيرة عند فقدان الاتصال وعدم وجود الصفحة الأساسية
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return new Response('❌ غير متصل - الرجاء التحقق من الاتصال بالإنترنت', { status: 503 });
      });
    })
  );
});
