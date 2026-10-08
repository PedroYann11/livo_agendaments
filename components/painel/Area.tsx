"use client";

// Guarda de área no painel: papel sem permissão ou função desligada
// mostram um aviso em vez da tela. (No backend, a RLS repete a regra.)

import Link from "next/link";
import type { ReactNode } from "react";
import { usePainel } from "./PainelRaiz";
import { EstadoVazio } from "@/components/ui/basicos";

export function Area({ area, children }: { area: string; children: ReactNode }) {
  const { pode, papel } = usePainel();
  if (pode(area)) return <>{children}</>;
  const semPermissao = papel === "professional" || papel === "reception";
  return (
    <div className="pn-pagina" style={{ paddingTop: 40 }}>
      <EstadoVazio
        icone={semPermissao ? "cadeado" : "grade"}
        titulo={semPermissao ? "Seu acesso não inclui esta área" : "Esta função está desligada"}
        texto={semPermissao ? "Peça ao dono do negócio, se precisar." : "Ligue em Configurações › Funções."}
        acao={
          !semPermissao && (
            <Link href="/painel/configuracoes?s=modulos" className="ui-botao ui-botao-principal ui-botao-m">
              Ver funções
            </Link>
          )
        }
      />
    </div>
  );
}
