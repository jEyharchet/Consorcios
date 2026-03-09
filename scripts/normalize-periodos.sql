UPDATE Gasto
SET periodo = substr(periodo, 1, 4) || '-' || substr(periodo, 5, 2)
WHERE length(periodo) = 6
  AND periodo GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'
  AND CAST(substr(periodo, 5, 2) AS INTEGER) BETWEEN 1 AND 12;

UPDATE Liquidacion
SET periodo = substr(periodo, 1, 4) || '-' || substr(periodo, 5, 2)
WHERE length(periodo) = 6
  AND periodo GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]'
  AND CAST(substr(periodo, 5, 2) AS INTEGER) BETWEEN 1 AND 12
  AND NOT EXISTS (
    SELECT 1
    FROM Liquidacion l2
    WHERE l2.consorcioId = Liquidacion.consorcioId
      AND l2.periodo = substr(Liquidacion.periodo, 1, 4) || '-' || substr(Liquidacion.periodo, 5, 2)
      AND l2.id <> Liquidacion.id
  );
