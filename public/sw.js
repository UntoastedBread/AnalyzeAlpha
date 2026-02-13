// AnalyzeAlpha Service Worker — Push Notifications & Alert Monitoring
const CACHE_NAME = "aa-sw-v1";
const CHECK_INTERVAL = 60 * 1000; // 1 minute

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "AnalyzeAlpha";
  const options = {
    body: data.body || "Price alert triggered",
    icon: "/logo192.png",
    badge: "/logo192.png",
    tag: data.tag || "aa-alert",
    data: data.url ? { url: data.url } : undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

// Message handler for alert checking from main thread
self.addEventListener("message", (event) => {
  if (event.data?.type === "CHECK_ALERTS") {
    const alerts = event.data.alerts || [];
    checkAlerts(alerts);
  }
  if (event.data?.type === "SHOW_NOTIFICATION") {
    self.registration.showNotification(
      event.data.title || "AnalyzeAlpha",
      {
        body: event.data.body || "",
        icon: "/logo192.png",
        tag: event.data.tag || "aa-alert",
      }
    );
  }
});

async function checkAlerts(alerts) {
  for (const alert of alerts) {
    if (alert.triggered) continue;
    try {
      const resp = await fetch(`/api/chart/${encodeURIComponent(alert.ticker)}?range=1d&interval=1m`);
      if (!resp.ok) continue;
      const json = await resp.json();
      const quotes = json?.chart?.result?.[0]?.indicators?.quote?.[0];
      if (!quotes?.close?.length) continue;
      const closes = quotes.close.filter((c) => c != null);
      const lastPrice = closes[closes.length - 1];
      if (lastPrice == null) continue;

      let triggered = false;
      if (alert.type === "above" && lastPrice >= alert.value) triggered = true;
      if (alert.type === "below" && lastPrice <= alert.value) triggered = true;

      if (triggered) {
        const direction = alert.type === "above" ? "above" : "below";
        await self.registration.showNotification("Price Alert — AnalyzeAlpha", {
          body: `${alert.ticker} is now $${lastPrice.toFixed(2)} (${direction} $${alert.value})`,
          icon: "/logo192.png",
          tag: `aa-alert-${alert.ticker}-${alert.type}-${alert.value}`,
        });
        // Notify main thread that alert was triggered
        const clients = await self.clients.matchAll();
        for (const client of clients) {
          client.postMessage({
            type: "ALERT_TRIGGERED",
            alertId: alert.id,
            ticker: alert.ticker,
            price: lastPrice,
          });
        }
      }
    } catch {
      // Silently skip failed checks
    }
  }
}
