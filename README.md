# E-Coins · Eco Solar

Web app para reconocer el buen desempeño con e-coins canjeables por tiempo libre o dinero.
Complementa la dinámica de Empleado del Mes y Líder del Mes.

- **Empleado:** ve su saldo, pide días o medios días libres en un calendario que ya bloquea los días no permitidos, pide canjes en dinero y recibe avisos.
- **Líder:** da el visto bueno operativo a las solicitudes de su proceso.
- **Gerencia / subgerencia (admin):** asigna e-coins por concepto, registra los resultados de cada mes, aprueba solicitudes, configura reglas, bloqueos y festivos, y administra personas.

## Reglas principales

| Concepto | E-coins |
| --- | --- |
| Postulado por su proceso | 2 |
| Ganador Empleado del Mes | +6 (total 8) |
| Líder que cumple criterios | 2 |
| Ganador Líder del Mes | +4 (total 6) |
| Racha de 3 meses | +2 |
| Mejora o poka-yoke implementado | 2 |
| Finalista anual sin premio mayor | 16 |

1 e-coin = 1 hora libre o $10.000 (configurable). Día completo = 8, medio día = 4.
No se pueden elegir festivos, semanas con festivo, el día hábil siguiente a un festivo, diciembre,
fines de semana ni los bloqueos de la empresa. Hay cupo por proceso y anticipación mínima.

## Arquitectura

- Frontend estático (`index.html`, `app.js`, `styles.css`), sin dependencias, publicado en GitHub Pages.
- Backend en Supabase (proyecto `central-ingenieria`, tablas `ec_*`).
- Las tablas tienen RLS activo sin políticas: nadie las lee directamente. Todo pasa por funciones
  `ec_*` con `security definer` que validan la sesión (cédula + PIN con bcrypt, token de 30 días)
  y aplican las reglas en el servidor.
- La llave que aparece en `app.js` es la llave **publicable** de Supabase; es pública por diseño.

El esquema está en `sql/`.
