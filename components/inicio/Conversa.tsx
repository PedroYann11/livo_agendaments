// A conversa que todo dono de negócio conhece: perguntas chegando o dia todo e
// uma resposta só, com o link. Animação só em CSS (inicio.css › .lv-conversa).

const PERGUNTAS = [
  { texto: "Oi! Tem horário no sábado?", hora: "09:12" },
  { texto: "Quanto fica axila + virilha?", hora: "09:15" },
  { texto: "Ainda tem vaga de manhã?", hora: "10:02" },
  { texto: "Pode ser às 10h?", hora: "10:03" },
  { texto: "Oi?? Conseguiu ver?", hora: "11:40" },
];

export function Conversa() {
  return (
    <figure className="lv-conversa" aria-label="Exemplo de conversa no WhatsApp">
      <ol>
        {PERGUNTAS.map((p, i) => (
          <li key={p.hora} className="lv-balao" style={{ "--i": i } as React.CSSProperties}>
            {p.texto}
            <time>{p.hora}</time>
          </li>
        ))}
        <li className="lv-balao lv-balao-digitando" aria-hidden="true">
          <span />
          <span />
          <span />
        </li>
        <li className="lv-balao lv-balao-resposta">
          Marca por aqui que aparece tudo, preço e horário livre:
          <span className="lv-balao-link">agenda.livo.tec.br/depiled</span>
          <time>11:41</time>
        </li>
      </ol>
    </figure>
  );
}
