// Navegador antigo: o site não roda nele (o código pede iOS 16.4 ou mais).
// Mostra o aviso que já veio pronto na página e, na página de um negócio,
// põe nele o botão do WhatsApp. JavaScript antigo de propósito, para rodar
// justamente onde o resto não roda. Ver components/ui/NavegadorAntigo.tsx.
(function () {
  if (window.__livoModerno) return;
  var aviso = document.getElementById("navegador-antigo");
  if (!aviso) return;
  var zap = document.getElementById("navegador-antigo-zap");
  if (zap && aviso.firstElementChild) {
    aviso.firstElementChild.appendChild(zap);
    zap.removeAttribute("hidden");
  }
  aviso.removeAttribute("hidden");
})();
