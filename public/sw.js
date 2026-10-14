// =====================================================================
// Service worker do painel: mostra os avisos de agendamento (Web Push) e,
// no toque, abre a agenda no dia. Sem cache nenhum — o painel nunca é
// servido desatualizado. Registrado só quando a pessoa liga os avisos
// (lib/avisos.ts), com escopo /painel: a página dos clientes não o vê.
//
// Origem: livo@d74d591 · public/sw.js (adaptado: textos da agenda, o painel
// aberto relê a agenda na hora e o toque leva ao dia do agendamento)
// =====================================================================

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  const aviso = { titulo: "Livo Agenda", corpo: "Tem novidade na sua agenda.", url: "/painel/agenda", tag: "" };
  try {
    if (event.data) Object.assign(aviso, event.data.json());
  } catch {}

  // Cada aviso com a PRÓPRIA etiqueta: avisos com a mesma etiqueta se
  // substituem na tela, e o dono acharia que chegou um agendamento só.
  const etiqueta = aviso.tag || `aviso-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(aviso.titulo, {
        body: aviso.corpo,
        icon: "/icones/painel-192.png",
        data: { url: aviso.url },
        tag: etiqueta,
        renotify: true,
        vibrate: [120, 60, 120],
      }),
      // painel aberto: relê a agenda agora, sem esperar a próxima volta de 30 s
      self.clients
        .matchAll({ type: "window" })
        .then((janelas) => janelas.forEach((j) => j.postMessage({ tipo: "agenda-mudou" }))),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/painel/agenda", self.location.origin);
  // só leva para dentro do painel
  const destino = url.origin === self.location.origin && url.pathname.startsWith("/painel") ? url.href : `${self.location.origin}/painel/agenda`;

  event.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const painel = janelas.find((j) => new URL(j.url).pathname.startsWith("/painel"));
      if (painel) {
        try {
          const focada = await painel.focus();
          await focada.navigate(destino);
          return;
        } catch {}
      }
      await self.clients.openWindow(destino);
    })(),
  );
});
