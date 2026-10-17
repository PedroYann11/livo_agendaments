/** Captura de tela de celular dentro de um aparelho desenhado em CSS. */
export function Tela({ nome, alt, prioridade = false }: { nome: string; alt: string; prioridade?: boolean }) {
  return (
    <span className="lv-aparelho">
      <img
        src={`/inicio/${nome}-400.webp`}
        srcSet={`/inicio/${nome}-400.webp 400w, /inicio/${nome}-780.webp 780w`}
        sizes="(min-width: 900px) 300px, 70vw"
        width={390}
        height={844}
        alt={alt}
        loading={prioridade ? "eager" : "lazy"}
        decoding="async"
      />
    </span>
  );
}
