import { redirect } from "next/navigation";

// agenda.livo.tec.br/<negocio>/painel — o dono digita isso por instinto.
// O painel é um só para todos os negócios; quem decide qual é o login.
export default function PainelDoNegocio() {
  redirect("/painel");
}
