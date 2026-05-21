# Diseno: Resumen progresivo de pedidos proveedor

Fecha: 2026-05-19

## Contexto

PresuControl trabaja alrededor de presupuestos, pero un presupuesto puede tener entre 1 y 20 pedidos a proveedor. Mostrar cada pedido directamente en dashboard o kanban vuelve las pantallas densas y dificiles de escanear.

La necesidad aprobada es no ocultar datos importantes, sino mostrarlos por capas:

- resumen compacto siempre visible;
- detalle completo accesible sin perder contexto;
- excepciones visibles en dashboard;
- mismo criterio en todas las vistas donde aparezcan presupuestos.

## Objetivos

- Mostrar total de pedidos, estados, proveedores, fechas e importes sin saturar dashboard ni kanban.
- Comparar importe de pedidos contra importe del presupuesto: `Pedidos X EUR / Presu Y EUR`.
- Detectar pedidos sin importe, sin fecha prevista o vencidos.
- Usar un resumen comun en dashboard, kanban, tabla, detalle y vistas secundarias.
- Permitir editar pedidos existentes desde el panel lateral del kanban.

## Fuera de alcance

- Crear pedidos nuevos desde el panel lateral del kanban. La creacion queda en el detalle del presupuesto.
- Crear una vista independiente de centro operativo de pedidos.
- Cambiar reglas de negocio principales de estados del presupuesto.

## Modelo de resumen comun

Cada presupuesto con pedidos tendra un resumen derivado desde su lista `pedidos`:

- `total_pedidos`
- `pendientes`
- `parciales`
- `completados`
- `importe_pedidos_total_conocido`
- `importe_presupuesto`
- `hay_importes_incompletos`
- `hay_fechas_previstas_faltantes`
- `hay_pedidos_vencidos`
- `importe_completo`
- `nivel_excepcion`

Reglas:

- Los pedidos sin importe no se cuentan como cero silenciosamente.
- Si falta algun importe, se muestra el total conocido y un aviso de importes incompletos.
- Los pedidos sin importe entran como excepcion.
- Los pedidos sin fecha prevista entran como excepcion.
- Los pedidos pendientes o parciales con fecha prevista vencida entran como excepcion prioritaria.

## Priorizacion de excepciones

El dashboard ordenara las excepciones asi:

1. pedidos vencidos o sin fecha prevista;
2. pedidos con importes incompletos;
3. presupuestos con importe relevante frente al presupuesto;
4. presupuestos con muchos pedidos.

## Dashboard

El dashboard tendra un bloque de excepciones de pedidos proveedor. No sera una tabla completa de pedidos.

Cada fila mostrara:

- numero de presupuesto;
- cliente;
- total de pedidos;
- chips por estado: pendientes, parciales, completados;
- comparacion `Pedidos X EUR / Presu Y EUR`;
- avisos compactos: vencido, sin fecha, importe incompleto.

Al hacer clic en una excepcion, la app navegara al kanban completo y resaltara la tarjeta de ese presupuesto. El objetivo es detectar el problema y resolverlo en contexto, no convertir el dashboard en una pantalla de edicion.

## Kanban

Cada tarjeta mostrara un resumen compacto:

- `N pedidos`;
- chips de estado con numeros;
- `Pedidos X EUR / Presu Y EUR`;
- avisos compactos si hay pedidos vencidos, sin fecha o con importes incompletos.

Al pulsar el resumen de pedidos, se abrira un panel lateral dentro del kanban.

El panel lateral mostrara todos los pedidos del presupuesto con:

- proveedor;
- numero de pedido;
- estado de entrega;
- fecha prevista;
- importe;
- avisos por fila;
- controles para editar pedidos existentes.

Crear nuevos pedidos seguira en el detalle del presupuesto.

Cuando se llegue desde dashboard, el kanban se mantiene completo y la tarjeta objetivo queda resaltada.

## Tabla y detalle

La tabla de presupuestos reemplazara la columna actual de pedido proveedor por el mismo resumen compacto.

El detalle del presupuesto mantendra la pestana de pedidos como lugar principal de gestion. Se anadira una cabecera-resumen arriba de la tabla de pedidos con:

- chips por estado;
- importe pedidos/presupuesto;
- avisos de fechas faltantes, vencimientos e importes incompletos.

La tabla de pedidos del detalle seguira mostrando cada pedido y permitira crear, editar y eliminar como hasta ahora.

## Otras vistas

Vistas como riesgo, reportes, busqueda, mi mesa o calendario usaran el resumen compacto cuando haya espacio. En vistas estrechas o muy densas, se mostrara solo contador, estado dominante y aviso principal, con enlace al detalle del presupuesto.

## Componentes propuestos

- `pedidoSummary.ts`: calcula el resumen derivado desde `Presupuesto.pedidos`.
- `PedidoSummaryBadge`: visual compacto reutilizable.
- `PedidoSummaryPanel`: panel lateral del kanban con lista y edicion de pedidos existentes.
- Ajustes de dashboard para consumir el resumen y priorizar excepciones.

## Datos y API

La API ya devuelve `pedidos` en `Presupuesto`. La primera implementacion puede calcular el resumen en frontend para evitar cambios de contrato.

Si el rendimiento se degrada con muchos presupuestos, se podra mover el resumen al backend en una fase posterior.

## Errores y estados vacios

- Si un presupuesto no tiene pedidos, el resumen mostrara `Sin pedidos`.
- Si hay pedidos sin importe, el importe mostrado sera parcial y se marcara como incompleto.
- Si no hay fecha prevista en pedidos pendientes o parciales, se mostrara aviso `sin fecha`.
- Si una edicion desde el panel lateral falla, el panel conservara los datos en pantalla y mostrara el error sin cerrar.

## Pruebas

Pruebas unitarias de resumen:

- presupuesto sin pedidos;
- pedidos pendientes, parciales y completados;
- importes completos;
- importes incompletos;
- fechas previstas faltantes;
- fechas vencidas;
- comparacion con importe de presupuesto.

Pruebas de UI/manuales:

- dashboard muestra excepciones en orden correcto;
- click desde dashboard navega al kanban y resalta tarjeta;
- kanban muestra resumen compacto sin crecer con 20 pedidos;
- panel lateral lista y edita pedidos existentes;
- tabla y detalle usan el mismo resumen.

