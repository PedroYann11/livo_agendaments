// Teste do navegador (ver components/ui/NavegadorAntigo.tsx).
// Bloco "static" de classe: só navegador novo (iPhone com iOS 16.4 ou mais)
// entende. No antigo, este arquivo inteiro dá erro e a marca não é feita.
class LivoNavegadorModerno {
  static {
    window.__livoModerno = true;
  }
}
