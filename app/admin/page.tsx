import { redirect } from "next/navigation";

// Atalho que as pessoas tentam primeiro: o painel mora em /painel.
export default function Admin() {
  redirect("/painel");
}
