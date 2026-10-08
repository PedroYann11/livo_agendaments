import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <main className="nao-encontrado">
      <p className="nao-encontrado-codigo">404</p>
      <h1>Não encontramos esta página</h1>
      <p>Confira o endereço com quem te enviou o link. Se você é dono de um negócio, entre pelo painel.</p>
      <Link href="/" className="ui-botao ui-botao-secundario ui-botao-m">
        Ir para o início
      </Link>
    </main>
  );
}
