# Cierre anual: alcance y base normativa

Documento de diseño general, válido para cualquier consorcio. Relevamiento inicial: 02/11/2026; reorganizado el 16/11/2026 para separar el caso concreto de Jara 166 en [`cierre-anual-jara-166.md`](cierre-anual-jara-166.md). No implementa ni confirma cierres.

## Decisiones

- El ejercicio es configurable por consorcio, con fechas explícitas de inicio y fin en cada ejercicio (modelo `Ejercicio`). No se deriva de un "mes de cierre" fijo: así se admiten primeros ejercicios irregulares y ejercicios de transición cuando cambia la fecha de cierre.
- Un consorcio puede no tener ejercicios anteriores. La ausencia de cierre previo no es un error ni habilita a inventar comparativos.
- Los saldos de apertura se registran con su estado: pendiente, cero confirmado o informados. Un dato desconocido nunca se trata como cero.
- Objetivo: atender las exigencias del Código Civil y Comercial y de la normativa bonaerense.
- Primero se implementa y revisa la simulación; después, la confirmación.

## Modelo de ejercicio

Implementado en `prisma/schema.prisma` (modelo `Ejercicio`, migración `20261116120000_ejercicio_consorcio`) y en `src/lib/ejercicios.ts` (reglas puras, probadas con `npx tsx scripts/test-ejercicios.ts`).

| Campo | Uso |
| --- | --- |
| `numero` | Correlativo por consorcio (único por `consorcioId`). |
| `fechaInicio`, `fechaFin` | Fechas de calendario (`DATE`), ambas inclusive. |
| `estado` | `ABIERTO` / `CERRADO`. Un ejercicio cerrado no se edita: se rectifica. |
| `fundamento` | Reglamento, acta o decisión que fija el período. |
| `aperturaEstado` | `PENDIENTE` / `CERO_CONFIRMADO` / `INFORMADA`, con usuario, fecha y observaciones de la confirmación. |
| `vencimientoRendicion` | Por defecto `fechaFin` + 60 días corridos (arts. 6 y 2067 inc. e CCyC); editable si el reglamento fija otro plazo compatible. |

Reglas (`validarEjercicio`):

- Error si el fin es anterior al inicio, si el vencimiento es anterior al cierre, si se superpone con otro ejercicio, si queda un hueco entre ejercicios consecutivos o si se intenta modificar uno cerrado. La base además impone un `CHECK` de fechas; la superposición se valida en la aplicación.
- Advertencia si la duración no es exactamente un año: es válida para un primer ejercicio o un cambio de cierre, pero exige registrar el fundamento.
- `sugerirSiguienteEjercicio` propone el día posterior al cierre y un año de duración (contempla años bisiestos). Es solo una sugerencia.

Criterio de fechas: los registros operativos cargados como «AAAA-MM-DD» se guardan con `new Date("AAAA-MM-DDT00:00:00")`, que depende de la zona horaria del servidor (00:00Z en Vercel, 03:00Z en local). En ambos casos la fecha UTC coincide con el día cargado, por eso `rangoConsultaEjercicio` filtra con `{ gte: inicio 00:00Z, lt: día siguiente al fin 00:00Z }`. Los campos con hora real (por ejemplo `createdAt`) pueden caer en otro día UTC entre las 21:00 y las 24:00 de Argentina: la simulación debe usar fechas efectivas de operación, no fechas de carga.

## Base normativa y límites de la revisión

El CCyC exige rendición documentada dentro de los 60 días del cierre fijado en el reglamento (art. 2067 inc. e), con explicaciones, comprobantes y concordancia con los libros (art. 859). El plazo se computa en días corridos (art. 6). Si el reglamento original fija una fecha de cierre y una asamblea acuerda otra, conservar ambos antecedentes: la lectura del acta acredita su contenido, no las formalidades de modificación del reglamento. Los artículos 320–326 deben contemplarse al definir contabilidad, registros y estados; no se presume una exención del consorcio. El encuadre profesional de los estados todavía requiere verificación.

Fuente: [CCyC actualizado](https://www.argentina.gob.ar/normativa/nacional/ley-26994-235975/actualizacion).

La Ley PBA 14.701 exige conservación y acceso a documentación, libros, auditoría si la dispone la asamblea e informe anual del administrador, incluidas las actas relativas a rendiciones (arts. 8 y 10). Su artículo 11 regula liquidaciones mensuales: no confundirlas con la rendición anual. El Decreto 1734/2022 exige solicitar rúbrica y delega la definición de fechas y formas del informe anual en la autoridad de aplicación. La aplicación no reemplaza esas formalidades.

Fuentes: [Ley 14.701](https://normas.gba.gob.ar/documentos/VmKmqtlx.html), [Decreto 1734/2022, anexo I](https://www.argentina.gob.ar/normativa/provincial/ley-1734-123456789-0abc-437-1000-2202bvorpced/actualizacion), [portal oficial RPAC](https://www.gba.gob.ar/DPPJ/ADMINISTRACION-CONSORCIOS).

La declaración anual del administrador ante RPAC tiene su propio trámite y calendario. Confirmar un ejercicio no equivale a presentarla. No se verificó aún el plazo específico de la presentación del año 2026.

### Libro de Administración

Ni la Ley 14.701 (art. 8 inc. d: libros de administración, actas y registro de firmas) ni el Decreto 1734/2022 definen el contenido, la frecuencia o el formato del Libro de Administración. El [procedimiento de rúbrica del RPAC](https://drive.mjus.gba.gob.ar/docs/dppj/rpac/procedimiento-de-rubrica.pdf) solo regula la rúbrica: acta notarial ante escribano de la Provincia, que verifica la matrícula del administrador y la correlatividad de los libros. No se encontró norma sobre libros digitales u hojas pegadas; confirmarlo con el escribano.

Criterio adoptado: la rendición debe concordar con los libros (art. 859 CCyC), así que en el libro se asienta el cierre del ejercicio en una hoja: movimiento de fondos por mes con saldo, saldos por cuenta, saldo neto y su composición, totales de gastos y liquidaciones, respaldo de los gastos (con comprobante y sin comprobante, por motivo) y constancia de la asamblea que trata la rendición. El detalle por unidad, el índice de comprobantes y las observaciones de la simulación quedan en la rendición archivada. Las fechas del ejercicio y la aprobación de la rendición se asientan en el Libro de Actas.

La hoja se genera en `/api/ejercicios/[id]/libro-administracion` (`src/lib/libro-administracion-html.ts`): A4 a tamaño real, con marcas de corte del área útil del libro de Jara 166 (200 × 290 mm, constantes `HOJA_LIBRO_ANCHO_MM` / `HOJA_LIBRO_ALTO_MM`). La firma va a mano. Si la simulación tiene observaciones ALTA o MEDIA, la hoja sale con la leyenda «BORRADOR».

## Diseño propuesto: simulación

1. Tomar las fechas del `Ejercicio` del consorcio, con su fundamento. Aplicar límites de fecha uniformes (`rangoConsultaEjercicio`).
2. Capturar apertura: caja, cada banco, créditos por unidad, anticipos, proveedores, otras obligaciones y fondos afectados. Distinguir cero confirmado de dato pendiente. Conservar respaldo y origen; no registrar la apertura como ingreso del ejercicio. El detalle por cuenta queda para una tabla de saldos de apertura a diseñar con la simulación.
3. Mostrar ingresos y egresos efectivos, agrupados por mes, rubro y cuenta. Separar gastos del ejercicio de sus pagos y cargos nuevos de deudas arrastradas.
4. Reconstruir créditos y deudas al corte, excluyendo pagos posteriores. Evitar duplicar las expensas trasladadas a otra liquidación.
5. Conciliar fondos iniciales, movimientos y fondos finales con extractos y arqueo. Incluir cuentas hoy inactivas con actividad en el período.
6. Preparar información patrimonial y de resultados, anexos de deudores y proveedores, fondo de reserva, notas e índice de comprobantes. No rotular estados como certificados ni afirmar cumplimiento integral sin revisión profesional y documental.
7. Mostrar faltantes e inconsistencias con acceso al registro de origen. Los datos desconocidos no deben convertirse en cero ni en ausencia de contingencias.
8. Poder repetir la simulación sin modificar saldos, emitir expensas, enviar comunicaciones ni cerrar meses.

### Implementación de la simulación (16/11/2026)

`src/lib/cierre-simulacion.ts` (solo lectura) y pantalla `/administracion/ejercicios/[id]/simulacion`. Prueba en modo lectura: `npx tsx scripts/test-cierre-simulacion.ts <consorcioId> <inicio> <fin> [apertura]`.

- Lo percibido (cobros, pagos y movimientos de fondos) se toma por fecha efectiva; lo devengado (gastos y liquidaciones), por período «AAAA-MM» dentro del ejercicio. Así la liquidación del último mes, emitida después del cierre, queda en el ejercicio.
- Caja y bancos: saldo inicial según la apertura (solo `CERO_CONFIRMADO` es conocido por ahora) más cobranzas, pagos y ajustes manuales del período. Se compara con el `saldoPosterior` del último movimiento **cargado** (mayor id) con fecha hasta el cierre: ese saldo sigue el orden de carga, no el cronológico.
- Créditos al cierre: capital de expensas con período hasta el cierre menos capital cobrado hasta el cierre, descontando el capital trasladado a otra liquidación (criterios TOTAL/CAPITAL/PARCIAL). No incluye intereses no liquidados.
- Liquidaciones: el total emitido se separa en cargos nuevos y deuda de meses anteriores incluida otra vez (mismo criterio que el paso 3 del wizard).
- Observaciones detectadas: apertura sin detalle, cobros y pagos sin movimiento de fondos (y si los compensa un ajuste manual del mismo importe), ajustes manuales, transferencias caja/banco del mismo día que no cierran, deuda trasladada que sigue pendiente en la expensa original, gastos sin comprobante, liquidaciones sin finalizar, meses sin liquidación, actividad anterior al inicio sin ejercicio previo, cuentas inactivas con actividad y fondos que no concilian.
- Rendición en PDF (17/11/2026): `/api/ejercicios/[id]/rendicion` (`src/lib/rendicion.ts`, `src/lib/rendicion-pdf-html.ts`), botón «Rendición en PDF» en la simulación. Se genera al momento, sin guardar archivos: resumen y situación al cierre, caja y bancos, ingresos y egresos por mes, gastos por rubro, liquidaciones, estado por unidad, gastos pendientes de pago, detalle de gastos con índice de comprobantes (o motivo), notas y firma del administrador vigente (imagen de firma si está cargada). Si quedan observaciones no informativas, se listan al inicio.
- Notas libres del administrador (`Ejercicio.notasRendicion`), editables en la simulación mientras el ejercicio está abierto; van al final de las notas de la rendición.
- Anexo de comprobantes (17/11/2026): al final del PDF, en el orden del detalle de gastos, con un índice (sección 11) y el código `A1`, `A2`… en la columna de comprobante. Un archivo con el mismo contenido (sha256) cargado en varios gastos se anexa una sola vez con todos sus gastos (ej.: #30 y #31). Los PDF se copian página por página (sin decodificar su contenido) y se reducen para dejar la franja del encabezado; los protegidos con contraseña de propietario (facturas de ARCA, RC4 128) se descifran con la contraseña de usuario vacía (`src/lib/pdf-descifrado.ts`). Las imágenes van en una hoja A4. Lo que no se pueda incorporar queda marcado en el índice. Prueba en lectura: `npx tsx scripts/test-rendicion-anexo.ts <consorcioId> <inicio> <fin> <carpeta>`.
- Pendiente: identificación del fondo de reserva en lo cobrado y sus aplicaciones, intereses devengados no liquidados.

Traslado de deuda (corregido el 17/11/2026, `src/lib/expensa-traslado.ts`): al finalizar una liquidación que incluye deuda de expensas anteriores (`LiquidacionDeuda`), la expensa original baja su saldo por el capital trasladado y, si no queda capital, pasa a `TRASLADADA`. El cálculo de deuda de la expensa (`getExpensaCobranzaSnapshot`) trata el traslado como una cancelación con fecha (`fechaCalculoInteres`): deja de generar intereses y no admite cobros. El estado de cuenta de los PDF suma la deuda trasladada solo hasta la liquidación que la incluyó. La migración `20261117090000_cerrar_expensas_trasladadas` corrigió los traslados ya registrados. Limitación conocida: un traslado PARCIAL o solo de INTERES deja capital en la expensa original que el paso 2 no vuelve a ofrecer.

Gastos sin comprobante: el gasto admite `comprobanteFaltanteMotivo` (proveedor que no emite comprobante, medidor interno, compensación aprobada). La simulación los informa como justificados. El comprobante se puede adjuntar o reemplazar desde la edición del gasto aunque esté pagado o liquidado (límite 4 MB, `src/lib/gasto-comprobante.ts`).

Ajustes manuales: los cobros sin movimiento de fondos compensados por un ajuste del mismo total se cuentan como cobranzas; los ajustes del mismo día entre caja y banco que se compensan se informan como transferencias internas.

## Confirmación posterior a la revisión

Implementada el 17/11/2026 (`src/lib/cierre-confirmacion.ts`, botón «Confirmar cierre» en la simulación, solo `ADMIN`):

- Requisitos: el día posterior al cierre ya llegó, el ejercicio anterior (si existe) está cerrado, la apertura es conocida y no hay observaciones `ALTA`. Las `MEDIA` se pueden confirmar marcando que se revisaron.
- El ejercicio pasa a `CERRANDO` (ya bloquea escrituras), se recalcula la simulación y se compara su huella (sha256 de la simulación sin la hora de cálculo + las notas) con la que vio el usuario: si cambió, vuelve a `ABIERTO`. Luego se generan la rendición con el anexo y la hoja del libro, y en una transacción serializable se crea `CierreEjercicio` (versión, resultados JSON, huella, ambos PDF, usuario y fecha), el ejercicio pasa a `CERRADO` y la apertura del siguiente toma los saldos al cierre. Ante un error vuelve a `ABIERTO`; una confirmación interrumpida se puede cancelar después de 5 minutos. Un índice parcial único impide dos versiones `VIGENTE`.
- Con el ejercicio cerrado, la simulación muestra los resultados guardados y los PDF (`/api/ejercicios/[id]/rendicion` y `/libro-administracion`, o `?version=N`) son los guardados.
- Bloqueo (`src/lib/ejercicio-bloqueo.ts`, todo estado distinto de `ABIERTO`): alta, edición, comprobante y baja de gastos por período; pagos de gastos y cobros de expensas por fecha; alta, wizard, emisión, cierre, finalización y baja de liquidaciones por período; baja de cuentas bancarias con movimientos y de unidades con expensas del ejercicio. Los ajustes de tesorería usan la fecha del día, que nunca cae en un ejercicio cerrado. El traslado de deuda de una expensa vieja al finalizar una liquidación nueva sigue permitido: es una operación del ejercicio nuevo y la simulación cerrada solo cuenta traslados de liquidaciones de su período.
- Reapertura (con motivo, mínimo 10 caracteres): la versión vigente queda `REABIERTO` con fecha, usuario y motivo; no se borra. Si la apertura del ejercicio siguiente salió de esa versión, vuelve a `PENDIENTE`. No se puede reabrir si el siguiente está cerrado. La nueva confirmación genera otra versión.
- Apertura (`Ejercicio.aperturaDetalle`, `src/lib/apertura.ts`): caja y cada banco, expensas pendientes de cobro por unidad, gastos pendientes de pago y saldo neto. No genera registros: las expensas y gastos pendientes siguen en el sistema y se cobran o pagan con fecha del ejercicio nuevo. Un ejercicio nuevo creado después de uno cerrado la toma sola. La composición del saldo parte del saldo neto de apertura.
- Envío de la rendición (`enviarRendicionEjercicio` en `src/lib/administracion.ts`): el PDF guardado a los responsables vigentes por unidad, como las convocatorias (`RENDICION_EJERCICIO`), o una prueba a la administración (`RENDICION_PRUEBA_ADMIN`). Los envíos quedan en `EnvioEmail.cierreEjercicioId`; el primero a propietarios registra `presentadaAt`.
- Falta: registrar el tratamiento de la rendición en asamblea (fecha, acta, decisión) dentro del sistema.

Criterios de diseño originales:

- Persistir la versión exacta de resultados, fuentes, parámetros y documentos revisados, con usuario y fecha.
- Detectar cambios entre simulación y confirmación; exigir nueva revisión si cambian los datos.
- Ejecutar la confirmación de forma atómica, sin duplicados ante reintentos y con control de concurrencia compartido con las operaciones afectadas.
- Proteger los datos históricos en todos los caminos de escritura y eliminación, incluidos gastos, liquidaciones, cuentas y unidades.
- Mantener la cobranza y el pago posteriores de partidas pendientes con fecha del nuevo ejercicio.
- Permitir rectificaciones trazables conservando la versión original; no sobrescribir un cierre confirmado.
- Registrar por separado la presentación de la rendición y su tratamiento en asamblea: fecha, acta, decisión y observaciones. No aprobar automáticamente por tiempo transcurrido.

## Puntos del repositorio que condicionan la implementación

- `prisma/schema.prisma`: ya existe `Ejercicio`; no hay cierre confirmado, plan de cuentas ni asientos; los importes son `Float`.
- `src/lib/liquidacion-paso4.ts`: crea expensas desde totales prorrateados y guarda gastos históricos.
- `src/app/liquidaciones/[id]/wizard/paso-2/page.tsx`: contempla deudas trasladadas; requiere criterio histórico al corte.
- `src/lib/cobranzas-expensas.ts`: calcula capital e intereses a una fecha; revisar su uso masivo y la deuda trasladada.
- `src/lib/pagos-gastos.ts`: separa obligaciones y pagos.
- `src/lib/tesoreria.ts`: movimientos con saldos anteriores/posteriores; conciliar por fecha efectiva, sin asumir que el orden de carga equivale al cronológico.
- Los controles de gastos omiten FINALIZADA en algunos caminos. Un cierre anual requiere validación uniforme.
- La eliminación de cuentas permite perder asociaciones históricas. Protegerlas antes de confirmar cierres.
- Separar la lógica monetaria del acceso a datos y definir una precisión uniforme para nuevos cálculos y persistencia.

## Verificaciones de aceptación propuestas

- Primer ejercicio sin predecesor, con apertura cero confirmada o distinta de cero.
- Primer ejercicio irregular y ejercicio de transición por cambio de cierre.
- Corte entre ejercicios y pagos posteriores que no alteran el informe cerrado.
- Deuda trasladada entre meses sin duplicar capital, intereses ni ingresos.
- Cuenta inactiva, pago parcial y gasto pendiente correctamente incluidos.
- Comprobantes y saldos faltantes visibles; la ausencia de cierre previo no es error.
- Un cambio concurrente invalida la revisión; una doble confirmación no duplica resultados.
- Aislamiento entre consorcios y permisos de simulación/confirmación comprobados.

## Información pendiente (general)

- Plazo de la declaración anual ante RPAC para 2026.
- Revisión del contador sobre marco de estados contables, valuación, ajustes y eventual intervención profesional aplicable.
- Pendientes propios de cada consorcio: ver su anexo (por ejemplo, [Jara 166](cierre-anual-jara-166.md)).
