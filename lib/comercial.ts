// Dados comerciais da Livo Agenda: o que a página inicial e as telas de acesso
// mostram para quem quer contratar. Para mudar número, mensagens, perguntas ou
// clientes exibidos, edite só este arquivo.

/** WhatsApp comercial, só dígitos com DDI. A variável da Vercel, se existir, vale mais. */
export const WHATSAPP = process.env.NEXT_PUBLIC_LIVO_WHATSAPP || "5588993107761";

/** O número como as pessoas escrevem. */
export const WHATSAPP_ESCRITO = "(88) 9 9310-7761";

export const INSTAGRAM = "_livostudio";

/**
 * Mensagem pronta de cada botão: quem atende vê de onde a pessoa veio.
 * Preço e forma de pagamento são combinados na conversa (Pedro, 17/10).
 */
export const MENSAGENS = {
  topo: "Oi! Vim pelo site e quero minha agenda online.",
  cliente: "Oi! Vi como a cliente agenda e quero isso no meu negócio.",
  painel: "Oi! Quero conhecer o painel da Livo Agenda.",
  arena: "Oi! Tenho quadra/arena e quero saber da Livo Agenda.",
  duvida: "Oi! Tenho uma dúvida sobre a Livo Agenda.",
  fim: "Oi! Quero minha agenda online.",
  semConvite: "Oi! Quero contratar a Livo Agenda.",
} as const;

export function linkWhatsAppLivo(mensagem: string = MENSAGENS.topo) {
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(mensagem)}`;
}

export const LINK_INSTAGRAM = `https://instagram.com/${INSTAGRAM}`;

/** Negócios que autorizaram aparecer na página (DepiLED: Pedro, 16/10). */
export const CLIENTES = [
  {
    nome: "DepiLED",
    tipo: "Depilação",
    endereco: "/depiled",
    logo: "/marcas/depiled/logo.png",
    texto: "Atende em sábados marcados. As clientes escolhem o procedimento e o horário pelo link, sem trocar mensagem.",
  },
];

export const PERGUNTAS: { pergunta: string; resposta: string }[] = [
  {
    pergunta: "Quanto custa?",
    resposta: "Chame no WhatsApp: a gente passa os planos, as formas de pagamento e tira as dúvidas na mesma conversa.",
  },
  {
    pergunta: "Minha cliente precisa baixar aplicativo ou criar conta?",
    resposta: "Não. Ela abre o seu link, escolhe e confirma com nome e WhatsApp. Funciona no navegador de qualquer celular atualizado.",
  },
  {
    pergunta: "Como a cliente remarca ou cancela?",
    resposta: "Pelo link que ela recebe ao agendar, até o prazo que você definir. O horário volta a ficar livre na hora.",
  },
  {
    pergunta: "Tenho mais de um profissional. Funciona?",
    resposta: "Funciona. Cada pessoa tem os próprios horários e serviços, e a agenda nunca deixa dois atendimentos no mesmo horário.",
  },
  {
    pergunta: "Só atendo alguns dias no mês.",
    resposta: "Você abre só as datas em que atende. A DepiLED, por exemplo, atende em sábados marcados.",
  },
  {
    pergunta: "Já tenho uma lista de clientes.",
    resposta: "Dá para trazer os contatos do celular para o painel, sem digitar um por um.",
  },
  {
    pergunta: "Preciso deixar o computador ligado?",
    resposta: "Não. O painel funciona no celular e pode ficar na tela inicial, como um aplicativo, com aviso a cada agendamento.",
  },
];
