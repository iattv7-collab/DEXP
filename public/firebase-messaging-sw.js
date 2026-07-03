// public/firebase-messaging-sw.js
// Firebase Cloud Messaging service worker for DEXP.

importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyClcn2PQKYMnKkGwG5xX3WCNYpexPsY-mI",
  authDomain: "dexp-5056c.firebaseapp.com",
  projectId: "dexp-5056c",
  storageBucket: "dexp-5056c.firebasestorage.app",
  messagingSenderId: "924644421556",
  appId: "1:924644421556:web:268e79b673f94a2d34cce1",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload?.data || {};

  const title = data.title || "DEXP Notification";

  const options = {
    body: data.body || "",
    icon: "/assets/logo-v2.png",
    badge: "/assets/logo-v2.png",
    data,
    actions: [
      {
        action: "open",
        title: "Open",
      },
    ],
  };

  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification?.data || {};
  const route = data.route || "/pages/dashboard/index.html";

  const params = new URLSearchParams();

  Object.entries(data).forEach(([key, value]) => {
    if (
      key &&
      value !== undefined &&
      value !== null &&
      String(value).trim() !== "" &&
      !["title", "body", "route"].includes(key)
    ) {
      params.set(key, String(value));
    }
  });

  if (event.action) {
    params.set("notificationAction", event.action);
  }

  const relativeTargetUrl = params.toString()
  ? `${route}?${params.toString()}`
  : route;

const targetUrl = new URL(relativeTargetUrl, self.location.origin).href;

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      .then((clientList) => {
        const appClient = clientList.find((client) => {
          return client.url.includes(self.location.origin);
        });

        if (appClient) {
          return appClient.focus().then(() => {
            return appClient.navigate(targetUrl);
          });
        }

        return clients.openWindow(targetUrl);
      }),
  );
});