export function getEditorFeedback(params: { error?: string; ok?: string }) {
  switch (params.error) {
    case "fecha_requerida":
      return { type: "error" as const, text: "La fecha de la asamblea es obligatoria." };
    case "hora_requerida":
      return { type: "error" as const, text: "La hora de la asamblea es obligatoria." };
    case "lugar_requerido":
      return { type: "error" as const, text: "El lugar es obligatorio." };
    case "asamblea_inexistente":
      return { type: "error" as const, text: "No se encontró la asamblea indicada." };
    case "asamblea_no_borrador":
      return { type: "error" as const, text: "La asamblea ya no está en borrador: se edita desde su detalle." };
    case "punto_con_votaciones":
      return {
        type: "error" as const,
        text: "No se guardó: quitaste un punto del orden del día que tiene votaciones. Eliminá primero sus votaciones desde el detalle.",
      };
  }

  if (params.ok === "borrador_guardado") {
    return { type: "ok" as const, text: "Borrador guardado." };
  }

  return null;
}
