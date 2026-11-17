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

## Diseño propuesto: simulación

1. Tomar las fechas del `Ejercicio` del consorcio, con su fundamento. Aplicar límites de fecha uniformes (`rangoConsultaEjercicio`).
2. Capturar apertura: caja, cada banco, créditos por unidad, anticipos, proveedores, otras obligaciones y fondos afectados. Distinguir cero confirmado de dato pendiente. Conservar respaldo y origen; no registrar la apertura como ingreso del ejercicio. El detalle por cuenta queda para una tabla de saldos de apertura a diseñar con la simulación.
3. Mostrar ingresos y egresos efectivos, agrupados por mes, rubro y cuenta. Separar gastos del ejercicio de sus pagos y cargos nuevos de deudas arrastradas.
4. Reconstruir créditos y deudas al corte, excluyendo pagos posteriores. Evitar duplicar las expensas trasladadas a otra liquidación.
5. Conciliar fondos iniciales, movimientos y fondos finales con extractos y arqueo. Incluir cuentas hoy inactivas con actividad en el período.
6. Preparar información patrimonial y de resultados, anexos de deudores y proveedores, fondo de reserva, notas e índice de comprobantes. No rotular estados como certificados ni afirmar cumplimiento integral sin revisión profesional y documental.
7. Mostrar faltantes e inconsistencias con acceso al registro de origen. Los datos desconocidos no deben convertirse en cero ni en ausencia de contingencias.
8. Poder repetir la simulación sin modificar saldos, emitir expensas, enviar comunicaciones ni cerrar meses.

## Confirmación posterior a la revisión

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
