# Cierre anual — anexo: Jara 166

Caso concreto del diseño general de [`cierre-anual.md`](cierre-anual.md). Este anexo documenta los parámetros del primer ejercicio de Jara 166 y su respaldo documental; no define reglas para otros consorcios.

Fecha de relevamiento: 02/11/2026. Reorganizado como anexo el 16/11/2026.

## Parámetros del ejercicio N.º 1

| Dato | Valor |
| --- | --- |
| Inicio | 01/10/2025 |
| Fin | 30/09/2026 (inclusive) |
| Vencimiento de la rendición | 29/11/2026 (fin + 60 días corridos, arts. 6 y 2067 inc. e CCyC) |
| Ejercicios anteriores | No existen. No exigir cierre previo ni inventar comparativos. |
| Apertura | Cero en todas las cuentas, confirmado expresamente por el usuario el 02/11/2026 (`aperturaEstado = CERO_CONFIRMADO`). No volver a pedirlo como dato pendiente; distinguir esta declaración de una conciliación documental independiente. |
| Fundamento | Acta N.º 1 del 02/03/2026, punto 8 (cierre en septiembre). Las fechas exactas y la condición de primer ejercicio las indicó el usuario. |

Con la lectura del acta queda identificado el fundamento documental del cierre en septiembre. No se requiere otra confirmación del usuario para usar estos parámetros en la simulación. Mantener la presentación de la rendición y su tratamiento en asamblea como hechos separados.

## Reglamento de propiedad revisado

Fuente aportada por el usuario: `J:/Mi unidad/Reglamento y Escrituras/Jara 166 - Reglamento de Propiedad.docx`. Lectura del texto del documento, sin modificar el original; no se verificó su concordancia con la escritura inscripta ni la existencia de reformas posteriores.

- Artículo décimo, apartado «Ejercicio financiero»: fija cierre el treinta y uno de diciembre de cada año. Mantener este antecedente junto con el acuerdo posterior del punto 8 del acta N.º 1, que fija septiembre.
- Artículo décimo, inciso e: rendición documentada dentro de sesenta días del cierre.
- Artículo décimo, inciso d: disposición del fondo de reserva con conformidad del consejo de propietarios.
- Artículo décimo, inciso i: libros, archivo cronológico de liquidaciones y conservación documental.
- Artículo décimo segundo: asamblea ordinaria en diciembre; considera informes, balances, rendiciones y presupuesto anual, entre otros asuntos. El texto fija treinta días de anticipación para la citación a extraordinarias; no extender automáticamente esa regla a todas las convocatorias.
- Artículo décimo tercero, inciso b: el documento exige unanimidad para modificar el reglamento. Registrar la cláusula, sin resolver aquí su interacción jurídica con normas imperativas ni dar por válida una reforma no aportada.
- La escritura es de 2022. La inexistencia de ejercicios anteriores es un dato declarado por el usuario; no inferir del archivo que octubre de 2025 sea la fecha de constitución jurídica.

## Acta N.º 1 del 02/03/2026 revisada

Fuente: `J:/Mi unidad/Actas/Acta 20260302 firmada.pdf`. PDF escaneado de cuatro páginas, inspeccionadas visualmente. Original sin modificaciones. La inspección de las firmas no constituye autenticación.

- Punto 8, páginas 3–4: propone realizar el cierre tres meses antes de la asamblea ordinaria, en septiembre, y registra aceptación unánime. No explicita el día 30, el inicio 01/10/2025 ni una vigencia retroactiva; las fechas exactas para la simulación las confirmó el usuario. La lectura no verifica formalidades notariales o registrales de reforma del reglamento.
- Punto 3, página 3: designación ad honorem de Jerónimo Eyharchet hasta la siguiente asamblea ordinaria de diciembre de 2026, con aceptación unánime. No confundir duración del mandato con período financiero.
- Punto 5, página 3: aceptación unánime de formar un fondo de reserva equivalente a un mes de expensas e ir actualizándolo con el 10 % del valor de las expensas mensualmente. La simulación debe distinguir lo aprobado, lo liquidado, lo efectivamente cobrado y las aplicaciones del fondo; no crear cobros ni ajustes automáticos a partir del acta. El texto no precisa mes base, importe inicial ni fórmula detallada: contrastar con liquidaciones y decisiones de ejecución.
- Punto 7, página 3: designación de Oscar Aller y Julio Cameranesi como miembros del consejo, con aceptación unánime.
- Punto 6, página 3: pago del 1 al 10 y evaluación de un segundo vencimiento con recargo hasta el 20. No interpretar esa evaluación como tasa de interés aprobada.

## Primera simulación (datos de `dev`, copia de producción, 16/11/2026)

- Banco Provincia al 30/09/2026: calculado 142.029,40, igual al registrado. Caja: 0.
- Gastos devengados 2026-02 a 2026-09: 1.922.626,86; pagados al cierre 1.902.769,66; pendiente 19.857,20 (luz de septiembre).
- Créditos al cierre: 119.207 (liquidación de septiembre, emitida el 02/10).
- Observaciones y cómo se resolvieron (17/11/2026):
  - Diez cobros de la expensa 2026-02 (09 y 12/03/2026) sin movimiento de fondos: cargas iniciales pagadas por transferencia; suman 277.655 e ingresaron al banco por el ajuste manual del 13/03 «Pago de expensas previo al módulo de tesorería». La simulación los cuenta como cobranzas.
  - Expensa 2026-02 de UF 01 (17.345) trasladada completa a la liquidación 2026-03 (el propietario pagó con más de un mes de atraso): quedó `TRASLADADA`. Los estados de cuenta de UF 01 emitidos desde 2026-04 mostraban un saldo anterior inflado en 17.345 (el total a pagar era correcto); se corrigen al regenerarlos.
  - Transferencia banco → caja del 10/04/2026: el banco registraba 47.999,99 por la conversión desde Float; el importe real es 48.000. Corregido con la migración `20261117110000_corregir_transferencia_banco_20260410` (saldos posteriores −0,01; saldo del banco 152.506,99 al 16/11/2026; al 30/09/2026, 142.029,39).
  - Gastos sin comprobante: los de María Fernanda Galimberti Bentancur (por acuerdo con los propietarios no emite comprobante) y los de luz de espacios comunes (proporción de un medidor medida internamente) se justifican con motivo. El #20 (poda de césped, 2026-04) fue una compensación aprobada por el consejo de administración a un propietario que pagó sin comprobante. Para el resto hay comprobantes, a adjuntar desde la edición del gasto. El gasto #40 (2026-08) estaba en el rubro «Sueldos y Cargas Sociales» por error; el usuario lo corrigió a «Gastos de Limpieza».
  - Octubre 2025 a enero 2026 sin liquidaciones: explicar en notas (inicio del uso del sistema / primer ejercicio).

## Información pendiente de Jara 166

- Formalización del cambio respecto del reglamento original (diciembre → septiembre): no verificada con esta lectura; no bloquea el desarrollo de la simulación con el período indicado.
- Ejecución del fondo de reserva: identificar importes, base y aportes en las liquidaciones sin inventar movimientos.
- Completitud de operaciones, extractos y comprobantes del ejercicio.
- Revisión del contador sobre marco de estados contables, valuación, ajustes y eventual intervención profesional aplicable.
