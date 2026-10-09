-- =====================================================================
-- 006 — Agenda (4/5): a DepiLED no banco
-- Ver o mapa em 003_agenda_tabelas.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 8. DepiLED: o catálogo e a agenda saem do código (lib/sementes) e
--    passam a morar aqui. Gerado de lib/sementes/depiled.ts — só dado
--    público. Expediente: um sábado por mês, 08h–14h (confirmado pelo
--    Pedro em 09/10/2026); o próximo dia entra pelo painel.
-- ---------------------------------------------------------------------

insert into public.categorias (tenant_id, id, nome, descricao, ordem, pausada) values
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_cat_feminino', 'Procedimentos Femininos', '', 0, false),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_cat_masculino', 'Procedimentos Masculinos', '', 1, false),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_cat_combos', 'Combos', 'Duas áreas com valor promocional', 2, false)
on conflict (tenant_id, id) do nothing;

insert into public.servicos (tenant_id, id, categoria_id, nome, descricao, duracao_min, intervalo_min, preco, modo_preco, online, ativo, pausado, destaque, ordem) values
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_abdome', 'dp_cat_feminino', 'Abdome', 'Remoção definitiva dos pelos na região abdominal, com suavidade e segurança.', 10, 0, 90, 'fixo', true, true, false, false, 0),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_antebracos', 'dp_cat_feminino', 'Antebraços', 'Remoção definitiva dos pelos dos antebraços, com suavidade e segurança.', 10, 0, 60, 'fixo', true, true, false, false, 1),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_axilas', 'dp_cat_feminino', 'Axilas', 'Remoção definitiva dos pelos das axilas, com suavidade e segurança.', 5, 0, 55, 'fixo', true, true, false, true, 2),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_axilas_virilha_simples', 'dp_cat_feminino', 'Axilas + Virilha Simples', 'Axilas e virilha simples na mesma sessão.', 10, 0, 100, 'fixo', true, true, false, false, 3),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_bracos_completos', 'dp_cat_feminino', 'Braços Completos', 'Remoção definitiva dos pelos dos braços inteiros, com suavidade e segurança.', 10, 0, 110, 'fixo', true, true, false, false, 4),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_buco', 'dp_cat_feminino', 'Buço', 'Remoção definitiva dos pelos do buço, com cuidado com a pele do rosto.', 5, 0, 45, 'fixo', true, true, false, false, 5),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_corpo_todo_fem', 'dp_cat_feminino', 'Corpo Todo - Feminino', 'Todas as áreas do corpo em uma única sessão.', 30, 0, 300, 'fixo', true, true, false, false, 6),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_costas', 'dp_cat_feminino', 'Costas', 'Remoção definitiva dos pelos das costas, com suavidade e segurança.', 10, 0, 120, 'fixo', true, true, false, false, 7),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_coxas', 'dp_cat_feminino', 'Coxas', 'Remoção definitiva dos pelos das coxas, com suavidade e segurança.', 10, 0, 80, 'fixo', true, true, false, false, 8),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_meia_perna', 'dp_cat_feminino', 'Meia Perna', 'Remoção definitiva dos pelos do joelho ao tornozelo.', 10, 0, 70, 'fixo', true, true, false, false, 9),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_meio_bracos', 'dp_cat_feminino', 'Meio Braços', 'Remoção definitiva dos pelos de meio braço, com suavidade e segurança.', 10, 0, 70, 'fixo', true, true, false, false, 10),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_perna_completa', 'dp_cat_feminino', 'Perna Completa', 'Remoção definitiva dos pelos das pernas inteiras, coxas e canelas.', 10, 0, 140, 'fixo', true, true, false, true, 11),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_seios', 'dp_cat_feminino', 'Seios', 'Remoção definitiva dos pelos da região dos seios, com delicadeza.', 10, 0, 80, 'fixo', true, true, false, false, 12),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_virilha_completa', 'dp_cat_feminino', 'Virilha Completa', 'Remoção definitiva dos pelos de toda a virilha, com suavidade e segurança.', 10, 0, 90, 'fixo', true, true, false, true, 13),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_virilha_completa_fio', 'dp_cat_feminino', 'Virilha Completa com Fio', 'Virilha completa, incluindo a região do fio.', 10, 0, 110, 'fixo', true, true, false, false, 14),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_virilha_simples', 'dp_cat_feminino', 'Virilha Simples', 'Remoção definitiva dos pelos das laterais da virilha.', 10, 0, 70, 'fixo', true, true, false, false, 15),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_antebracos_masc', 'dp_cat_masculino', 'Antebraços - Masculino', 'Remoção definitiva dos pelos dos antebraços.', 10, 0, 60, 'fixo', true, true, false, false, 16),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_axilas_masc', 'dp_cat_masculino', 'Axilas - Masculino', 'Remoção definitiva dos pelos das axilas.', 5, 0, 55, 'fixo', true, true, false, false, 17),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_barba_completa', 'dp_cat_masculino', 'Barba Completa', 'Remoção definitiva dos pelos da barba, com suavidade e segurança.', 10, 0, 80, 'fixo', true, true, false, false, 18),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_bigode', 'dp_cat_masculino', 'Bigode', 'Remoção definitiva dos pelos do bigode.', 5, 0, 45, 'fixo', true, true, false, false, 19),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_bracos_completos_masc', 'dp_cat_masculino', 'Braços Completos - Masculino', 'Remoção definitiva dos pelos dos braços inteiros.', 10, 0, 110, 'fixo', true, true, false, false, 20),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_contorno_barba', 'dp_cat_masculino', 'Contorno de Barba', 'Remoção definitiva dos pelos do contorno da barba e do pescoço.', 10, 0, 55, 'fixo', true, true, false, false, 21),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_meio_bracos_masc', 'dp_cat_masculino', 'Meio Braços - Masculino', 'Remoção definitiva dos pelos de meio braço.', 10, 0, 70, 'fixo', true, true, false, false, 22),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_peitoral', 'dp_cat_masculino', 'Peitoral', 'Remoção definitiva dos pelos do peitoral.', 30, 0, 100, 'fixo', true, true, false, false, 23),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_superior_completo', 'dp_cat_masculino', 'Superior Completo - Costas, Abdome e Peitoral', 'Costas, abdome e peitoral na mesma sessão.', 30, 0, 250, 'fixo', true, true, false, false, 24),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_axila_barba', 'dp_cat_combos', 'Axila + Barba Completa', 'Axilas e barba completa na mesma sessão, com valor promocional.', 10, 0, 110, 'fixo', true, true, false, false, 25),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_axila_bigode', 'dp_cat_combos', 'Axila + Bigode', 'Axilas e bigode na mesma sessão, com valor promocional.', 10, 0, 80, 'fixo', true, true, false, false, 26),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_axila_buco', 'dp_cat_combos', 'Axila + Buço', 'Axilas e buço na mesma sessão, com valor promocional.', 10, 0, 80, 'fixo', true, true, false, false, 27),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_axila_contorno', 'dp_cat_combos', 'Axila + Contorno de Barba', 'Axilas e contorno de barba na mesma sessão, com valor promocional.', 10, 0, 90, 'fixo', true, true, false, false, 28),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_axila_virilha', 'dp_cat_combos', 'Axila + Virilha Completa', 'Axilas e virilha completa na mesma sessão, com valor promocional.', 10, 0, 120, 'fixo', true, true, false, true, 29),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_axila_virilha_fio', 'dp_cat_combos', 'Axila + Virilha Completa com Fio', 'Axilas e virilha completa com fio na mesma sessão, com valor promocional.', 10, 0, 140, 'fixo', true, true, false, false, 30),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_aureola', null, 'Auréola', 'Remoção definitiva dos pelos ao redor da auréola.', 5, 0, 20, 'fixo', false, true, false, false, 31),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_meia_perna_virilha', null, 'Meia Perna + Virilha Completa', 'Meia perna e virilha completa na mesma sessão.', 25, 0, 160, 'fixo', false, true, false, false, 32),
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_virilha_parceria', null, 'Virilha Completa Parceria', 'Virilha completa com valor de parceria.', 10, 0, 50, 'fixo', false, true, false, false, 33)
on conflict (tenant_id, id) do nothing;

insert into public.profissionais (tenant_id, id, nome, cargo, bio, cor, comissao_pct, ativo, ordem, servicos_ids, horario) values
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'dp_agenda', 'DepiLED', 'Atendimento', '', 0, 0, true, 0,
   array['dp_abdome', 'dp_antebracos', 'dp_axilas', 'dp_axilas_virilha_simples', 'dp_bracos_completos', 'dp_buco', 'dp_corpo_todo_fem', 'dp_costas', 'dp_coxas', 'dp_meia_perna', 'dp_meio_bracos', 'dp_perna_completa', 'dp_seios', 'dp_virilha_completa', 'dp_virilha_completa_fio', 'dp_virilha_simples', 'dp_antebracos_masc', 'dp_axilas_masc', 'dp_barba_completa', 'dp_bigode', 'dp_bracos_completos_masc', 'dp_contorno_barba', 'dp_meio_bracos_masc', 'dp_peitoral', 'dp_superior_completo', 'dp_axila_barba', 'dp_axila_bigode', 'dp_axila_buco', 'dp_axila_contorno', 'dp_axila_virilha', 'dp_axila_virilha_fio', 'dp_aureola', 'dp_meia_perna_virilha', 'dp_virilha_parceria'],
   '{"0":[],"1":[],"2":[],"3":[],"4":[],"5":[],"6":[]}'::jsonb)
on conflict (tenant_id, id) do nothing;

insert into public.store_settings (tenant_id, chave, valor) values
  ('ab00de9b-81fa-4a2e-a084-948f77eda90e', 'config', '{"sobre":"","destaques":["Sessões de 5 a 30 minutos","Femininos e masculinos","Combos com valor promocional"],"logoUrl":"/marcas/depiled/simbolo.png","logoCompletoUrl":"/marcas/depiled/logo.png","capaUrl":null,"galeria":[],"contato":{"whatsapp":"","instagram":"","telefone":"","email":""},"endereco":{"cep":"","rua":"","numero":"","complemento":"","bairro":"","cidade":"","uf":"CE","referencia":""},"horario":{"0":[],"1":[],"2":[],"3":[],"4":[],"5":[],"6":[]},"aberturas":[{"data":"2026-10-10","inicio":"08:00","fim":"14:00"}],"datasEspeciais":[],"regras":{"intervaloSlotsMin":10,"antecedenciaMinHoras":2,"janelaMaxDias":60,"confirmacao":"automatica","cancelamentoAteHoras":12,"fuso":"America/Fortaleza","escolherProfissional":false,"multiplosServicos":true},"modulos":{"anamnese":true,"pacotes":true,"comissoes":false,"financeiro":true,"sinal":false,"retorno":true,"avaliacoes":true,"aniversarios":true},"pix":{"chave":"","nome":"","cidade":""},"sinal":{"percentual":30,"servicosIds":[]},"metaMensal":0,"aviso":{"texto":"","ativo":false}}'::jsonb)
on conflict (tenant_id, chave) do nothing;
