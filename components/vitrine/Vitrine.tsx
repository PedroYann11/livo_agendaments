"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useLoja } from "@/lib/dados/loja";
import type { Banco } from "@/lib/tipos";
import { Icone } from "@/components/ui/Icone";
import { Avatar, Esqueleto, Estrelas } from "@/components/ui/basicos";
import { brl, duracao, plural } from "@/lib/formato";
import { NOMES_DIAS, dataRelativa, diaDaSemana, somarDias } from "@/lib/datas";
import { horariosDisponiveis, situacaoAgora } from "@/lib/disponibilidade";
import { linkWhatsApp, enderecoTexto } from "@/lib/whatsapp";
import { Arte, Emergir, Revelar } from "./efeitos";
import { capitalizar, gruposVisiveis, menorPreco, servicosVisiveis } from "./util";

/** Os próximos horários livres do serviço mais pedido — o atalho do herói. */
function proximasVagas(b: Banco, agora: string, quantas = 3) {
  const alvo = servicosVisiveis(b).find((s) => s.destaque) ?? servicosVisiveis(b)[0];
  if (!alvo) return { servico: null, vagas: [] as { data: string; hora: string }[] };
  const vagas: { data: string; hora: string }[] = [];
  for (let i = 0; i < 10 && vagas.length < quantas; i++) {
    const data = somarDias(agora.slice(0, 10), i);
    const v = horariosDisponiveis(b, { servicosIds: [alvo.id], profissionalId: null, data, agora });
    for (const x of v.slice(0, quantas - vagas.length)) vagas.push({ data, hora: x.hora });
  }
  return { servico: alvo, vagas };
}

export function Vitrine() {
  const { banco, agora, slug } = useLoja();
  const [rolou, setRolou] = useState(false);

  useEffect(() => {
    const f = () => setRolou(window.scrollY > 24);
    f();
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);

  if (!banco) return <VitrineCarregando />;
  return <Conteudo b={banco} agora={agora()} slug={slug} rolou={rolou} />;
}

function VitrineCarregando() {
  return (
    <div className="vt-container" style={{ paddingTop: 120, display: "grid", gap: 16 }}>
      <Esqueleto altura={30} largura={180} raio={20} />
      <Esqueleto altura={64} largura="80%" />
      <Esqueleto altura={64} largura="60%" />
      <Esqueleto altura={18} largura="70%" />
      <Esqueleto altura={56} largura={220} raio={30} />
    </div>
  );
}

function Conteudo({ b, agora, slug, rolou }: { b: Banco; agora: string; slug: string; rolou: boolean }) {
  const n = b.negocio;
  const situacao = situacaoAgora(b, agora);
  const servicos = servicosVisiveis(b);
  const destaques = servicos.filter((s) => s.destaque);
  const grupos = gruposVisiveis(b);
  const equipe = b.profissionais.filter((p) => p.ativo).sort((a, c) => a.ordem - c.ordem);
  const depoimentos = n.modulos.avaliacoes ? b.depoimentos.filter((d) => d.visivel) : [];
  const media = depoimentos.length ? depoimentos.reduce((s, d) => s + d.nota, 0) / depoimentos.length : 0;
  const { servico: alvo, vagas } = useMemo(() => proximasVagas(b, agora), [b, agora]);
  const hoje = agora.slice(0, 10);
  const agendar = `/${slug}/agendar`;
  const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${n.nome}, ${enderecoTexto(b)}`)}`;

  return (
    <>
      <header className={`vt-topo${rolou ? " rolou" : ""}`}>
        <div className="vt-container vt-topo-linha">
          <Link href={`/${slug}`} className="vt-marca">
            <span className={`vt-marca-simbolo${n.logoUrl ? " com-imagem" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {n.logoUrl ? <img src={n.logoUrl} alt="" /> : n.nome.charAt(0)}
            </span>
            <span className="vt-marca-nome">{n.nome}</span>
          </Link>
          <div className="vt-topo-acoes">
            {n.contato.instagram && (
              <a href={`https://instagram.com/${n.contato.instagram}`} target="_blank" rel="noopener noreferrer" className="ui-botao-icone" aria-label="Instagram">
                <Icone nome="instagram" />
              </a>
            )}
            {n.contato.whatsapp && (
              <a href={linkWhatsApp(n.contato.whatsapp, `Olá, ${n.nome}!`)} target="_blank" rel="noopener noreferrer" className="ui-botao-icone" aria-label="WhatsApp">
                <Icone nome="whatsapp" />
              </a>
            )}
            <Link href={agendar} className="ui-botao ui-botao-principal ui-botao-p">
              Agendar
            </Link>
          </div>
        </div>
      </header>

      <section className="vt-heroi">
        <Arte pele={n.pele} nome={n.nome} />
        <div className="vt-container vt-heroi-grade">
          <div>
            {n.logoCompletoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <motion.img
                src={n.logoCompletoUrl}
                alt={n.nome}
                className="vt-logo"
                initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
              />
            )}
            <motion.span
              className={`vt-estado${situacao.aberto ? " aberto" : ""}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            >
              <span className="vt-estado-ponto" />
              {situacao.texto}
            </motion.span>
            <h1 className="vt-titulo">
              <Emergir texto={n.tagline || n.nome} />
            </h1>
            <Revelar atraso={0.35}>
              <p className="vt-heroi-texto">{n.descricao}</p>
              <div className="vt-heroi-acoes">
                <Link href={agendar} className="vt-cta">
                  <span>Agendar horário</span>
                  <span className="vt-cta-seta">
                    <Icone nome="avancar" tamanho={20} peso="bold" />
                  </span>
                </Link>
                <a href="#servicos" className="vt-link">
                  Ver serviços
                </a>
              </div>
              {n.aviso.ativo && n.aviso.texto && (
                <div className="vt-aviso">
                  <Icone nome="megafone" tamanho={18} />
                  {n.aviso.texto}
                </div>
              )}
              <div className="vt-heroi-meta">
                {depoimentos.length > 0 && (
                  <span>
                    <Estrelas nota={Math.round(media)} />
                    <strong>{media.toFixed(1).replace(".", ",")}</strong> · {depoimentos.length} avaliações
                  </span>
                )}
                {n.endereco.cidade && (
                  <span>
                    <Icone nome="local" tamanho={16} />
                    {n.endereco.bairro ? `${n.endereco.bairro}, ` : ""}
                    {n.endereco.cidade}
                  </span>
                )}
              </div>
            </Revelar>
          </div>

          {alvo && vagas.length > 0 && (
            <Revelar atraso={0.5} className="vt-heroi-cartao">
              <h2>Próximos horários livres</h2>
              <p style={{ fontSize: 14, color: "var(--c-texto-2)", marginTop: 4 }}>{alvo.nome}</p>
              <div className="vt-proximos">
                {vagas.map((v) => (
                  <Link key={v.data + v.hora} href={`${agendar}?servico=${alvo.id}&data=${v.data}`} className="vt-proximo">
                    <span>
                      <small>{capitalizar(dataRelativa(v.data, hoje))}</small>
                      <strong className="vt-proximo-hora">{v.hora}</strong>
                    </span>
                    <Icone nome="avancar" tamanho={18} />
                  </Link>
                ))}
              </div>
            </Revelar>
          )}
        </div>
        {n.destaques.length > 0 && (
          <div className="vt-container">
            <Revelar atraso={0.6}>
              <div className="vt-destaques">
                {n.destaques.map((d) => (
                  <span key={d}>
                    <Icone nome="okCirculo" tamanho={16} peso="fill" />
                    {d}
                  </span>
                ))}
              </div>
            </Revelar>
          </div>
        )}
      </section>

      <section className="vt-secao" id="servicos" style={{ paddingTop: 12 }}>
        <div className="vt-container">
          <Revelar className="vt-secao-topo">
            <div>
              <span className="vt-sobretitulo">Serviços</span>
              <h2 className="vt-titulo">O que você procura?</h2>
            </div>
          </Revelar>

          <div className="vt-cats">
            {grupos.map((g, i) => {
              const minimo = menorPreco(g.servicos);
              return (
                <motion.div
                  key={g.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-30px" }}
                  transition={{ duration: 0.5, delay: Math.min(i, 4) * 0.06, ease: [0.23, 1, 0.32, 1] }}
                >
                  <Link href={`${agendar}?categoria=${g.id}`} className="vt-cat">
                    <span className="vt-cat-info">
                      <strong className="vt-titulo">{g.nome}</strong>
                      <small>
                        {g.descricao ? `${g.descricao} · ` : ""}
                        {plural(g.servicos.length, "opção", "opções")}
                        {minimo !== null ? ` · a partir de ${brl(minimo)}` : ""}
                      </small>
                    </span>
                    <span className="vt-mais" aria-hidden="true">
                      <Icone nome="direita" tamanho={18} peso="bold" />
                    </span>
                  </Link>
                </motion.div>
              );
            })}
          </div>

          {destaques.length > 1 && (
            <>
              <h3 className="vt-subtitulo">Mais procurados</h3>
              <div className="vt-carrossel">
                {destaques.map((s, i) => (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.5, delay: Math.min(i, 4) * 0.06, ease: [0.23, 1, 0.32, 1] }}
                    style={{ display: "contents" }}
                  >
                    <Link href={`${agendar}?servico=${s.id}`} className="vt-destaque">
                      <span className="vt-destaque-selo">Mais procurado</span>
                      <strong>{s.nome}</strong>
                      <span className="vt-destaque-rodape">
                        <span>
                          {duracao(s.duracaoMin)} · {s.modoPreco === "oculto" ? "sob consulta" : brl(s.preco)}
                        </span>
                        <span>
                          Agendar <Icone nome="avancar" tamanho={16} />
                        </span>
                      </span>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {equipe.length > 1 && (
        <section className="vt-secao">
          <div className="vt-container">
            <Revelar className="vt-secao-topo">
              <div>
                <span className="vt-sobretitulo">Equipe</span>
                <h2 className="vt-titulo">Quem cuida de você</h2>
              </div>
            </Revelar>
            <div className="vt-equipe">
              {equipe.map((p, i) => (
                <motion.div
                  key={p.id}
                  className="vt-pessoa"
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.07, ease: [0.23, 1, 0.32, 1] }}
                >
                  <Avatar nome={p.nome} cor={p.cor} tamanho={56} foto={p.fotoUrl} />
                  <strong>{p.nome}</strong>
                  <span>{p.cargo}</span>
                  {p.bio && <p>{p.bio}</p>}
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {depoimentos.length > 0 && (
        <section className="vt-secao">
          <div className="vt-container">
            <Revelar className="vt-secao-topo">
              <div>
                <span className="vt-sobretitulo">Avaliações</span>
                <h2 className="vt-titulo">Quem já veio</h2>
              </div>
              <div className="vt-nota">
                <strong>{media.toFixed(1).replace(".", ",")}</strong>
                <span>
                  <Estrelas nota={Math.round(media)} />
                  {depoimentos.length} avaliações
                </span>
              </div>
            </Revelar>
            <div className="vt-avaliacoes">
              {depoimentos.map((d) => (
                <article key={d.id} className="vt-avaliacao">
                  <Estrelas nota={d.nota} />
                  <p>“{d.texto}”</p>
                  <footer>
                    <strong>{d.nome}</strong>
                    <span>{d.servico}</span>
                  </footer>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="vt-secao" id="sobre">
        <div className="vt-container vt-sobre">
          <Revelar>
            <span className="vt-sobretitulo">Sobre</span>
            <h2 className="vt-titulo" style={{ marginBottom: 18 }}>
              {n.nome}
            </h2>
            <p className="vt-sobre-texto">{n.sobre || n.descricao}</p>
          </Revelar>
          <Revelar atraso={0.1} className="vt-info">
            {n.endereco.rua && (
              <div>
                <h3>Onde estamos</h3>
                <p className="vt-endereco">
                  {n.endereco.rua}, {n.endereco.numero}
                  {n.endereco.complemento && ` · ${n.endereco.complemento}`}
                  <br />
                  {n.endereco.bairro} · {n.endereco.cidade}/{n.endereco.uf}
                  {n.endereco.referencia && (
                    <>
                      <br />
                      <small style={{ color: "var(--c-texto-2)" }}>{n.endereco.referencia}</small>
                    </>
                  )}
                </p>
              </div>
            )}
            <div>
              <h3>Horário</h3>
              <div className="vt-horarios">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                  const faixas = n.horario[d] ?? [];
                  return (
                    <div key={d} className={diaDaSemana(hoje) === d ? "hoje" : ""}>
                      <span>{capitalizar(NOMES_DIAS[d].replace("-feira", ""))}</span>
                      <span>{faixas.length ? faixas.map((f) => `${f.inicio}–${f.fim}`).join(" · ") : "Fechado"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="vt-info-acoes">
              {n.endereco.rua && (
                <a href={mapa} target="_blank" rel="noopener noreferrer" className="ui-botao ui-botao-secundario ui-botao-p">
                  <Icone nome="local" tamanho={16} /> Como chegar
                </a>
              )}
              {n.contato.whatsapp && (
                <a href={linkWhatsApp(n.contato.whatsapp, `Olá, ${n.nome}! Tenho uma dúvida.`)} target="_blank" rel="noopener noreferrer" className="ui-botao ui-botao-secundario ui-botao-p">
                  <Icone nome="whatsapp" tamanho={16} /> WhatsApp
                </a>
              )}
              {n.contato.instagram && (
                <a href={`https://instagram.com/${n.contato.instagram}`} target="_blank" rel="noopener noreferrer" className="ui-botao ui-botao-secundario ui-botao-p">
                  <Icone nome="instagram" tamanho={16} /> @{n.contato.instagram}
                </a>
              )}
            </div>
          </Revelar>
        </div>
      </section>

      <footer className="vt-rodape">
        <div className="vt-container">
          © {new Date().getFullYear()} {n.nome} · Agendamento online por <Link href="/">Livo Agenda</Link>
        </div>
      </footer>

      <motion.div
        className="vt-barra"
        initial={{ y: 120, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
      >
        <div>
          {vagas[0] ? (
            <>
              <small>Próximo horário livre</small>
              <strong>
                {capitalizar(dataRelativa(vagas[0].data, hoje))}, {vagas[0].hora}
              </strong>
            </>
          ) : (
            <>
              <small>{n.nome}</small>
              <strong>Agende em 1 minuto</strong>
            </>
          )}
        </div>
        <Link href={agendar} className="ui-botao ui-botao-principal ui-botao-m">
          Agendar
        </Link>
      </motion.div>
    </>
  );
}
