# Kary Fashion · Plataforma web

Panel de administración para **Kary Fashion** (ropa para damas, calzados, perfumes y accesorios · Mao, Valverde, RD).
- **Fase 1 (lista):** interfaz del dashboard y sistema de diseño.
- **Fase 2 (lista):** base de datos PostgreSQL/Supabase con roles, seguridad y reglas de negocio. Ver [`supabase/README.md`](supabase/README.md).
- **Fase 3 (lista):** inicio de sesión por rol y pantallas de operación: punto de venta, ventas y facturas, pedidos con anticipos,
  productos con tallas y colores, inventario, compras, clientes y proveedores. Capturas en [`docs/capturas`](docs/capturas).

> Sin base de datos configurada, el panel abre en **modo demostración** (cifras de ejemplo marcadas en pantalla).
> Con `DATABASE_URL` usa datos reales y pide inicio de sesión.

## Cómo ejecutarlo

```bash
npm install
cp .env.example .env.local   # configure DATABASE_URL y AUTH_MODE (o déjelo vacío para modo demostración)
bash supabase/dev_setup.sh --con-actividad   # base local con usuarias y datos de ejemplo (requiere PostgreSQL)
npm run dev        # http://localhost:3000
npm test           # pruebas de las fórmulas financieras
npm run test:db    # pruebas de la base de datos (requiere PostgreSQL local)
npm run build      # compilación de producción
```

Requisitos: Node.js 20.9 o superior.

## Tecnología

| Capa | Herramienta |
|---|---|
| Framework | Next.js 16 (App Router, Cache Components) + TypeScript |
| Estilos | Tailwind CSS 4 con tokens de marca en `src/app/globals.css` |
| Componentes | Primitivas propias estilo shadcn/ui (`src/components/ui`) + Radix UI |
| Iconos / gráficos | Lucide React · Recharts |
| Tipografías | Poppins (títulos), Inter (números y tablas), Great Vibes (marca), servidas localmente con `@fontsource` |

## Arquitectura de pantallas

```
/                          Inicio (dashboard)            ← Fase 1 (listo)
/login                     Inicio de sesión                ← Fase 3 (listo)
/pedidos[/nuevo|/:id]      Pedidos, anticipos y entrega    ← Fase 3 (listo)
/ventas[/nueva|/:id]       Punto de venta y facturas       ← Fase 3 (listo)
/productos[/nuevo|/:id]    Catálogo, tallas y colores      ← Fase 3 (listo)
/inventario[/movimientos]  Existencias, ajustes, kardex    ← Fase 3 (listo)
/compras  /clientes  /proveedores                          ← Fase 3 (listo)
/facturacion  /gastos  /ganancias  /reportes[/…]         ← Fase 4
/tienda-online[/banners]   Tienda pública                ← Fase 5
/configuracion             Usuarios, roles, impuestos     ← Fase 6
```

Las rutas de fases futuras ya existen y muestran qué contendrán, así que todo el menú navega.

### Qué hay en el dashboard
- **Menú lateral** fijo con logo, submenús, contadores (pedidos pendientes y stock bajo), modo contraído que se recuerda y cajón en el celular.
- **Barra superior**: buscador global (`Ctrl + K`, flechas y Enter), fecha local de RD, **selector de período** (hoy, semana, mes, año) que recalcula todo el panel, notificaciones, ayuda y menú de usuario.
- **Banner de bienvenida** con el logo de Kary Fashion. Para usar una foto de moda, pase `photoSrc` a `WelcomeBanner`.
- **KPI**: ventas, pedidos (pendientes y completados), stock (bajo y agotado) y ganancia neta con margen y comparación con el período anterior.
- **Gráficos**: ventas y ganancia bruta (líneas con área, por día, semana, mes o año) e inventario por categoría (dona interactiva).
- **Tablas**: pedidos recientes (vista de lista en el celular), alertas de stock, productos más vendidos, resumen financiero y márgenes.

## Sistema de diseño

| Token | Color | Uso |
|---|---|---|
| `night` | `#211625` | Menú lateral |
| `plum` | `#49243E` | Títulos y navegación |
| `pink` | `#F65B9A` | Botones, gráficos, indicadores |
| `blush` | `#FADCE8` | Tarjetas y fondos destacados |
| `lavender` | `#A66BE3` | Serie secundaria de gráficos |
| `cream` | `#FFF8F5` | Fondos suaves |
| `canvas` | `#F5F4F7` | Fondo de la aplicación |
| `gold` | `#C99A2E` | Dorado del logotipo Kary Fashion |
| `success` / `warning` / `danger` | `#16A36A` / `#F4A340` / `#DC465E` | Estados |

Se usan como clases de Tailwind: `bg-plum`, `text-pink`, `bg-blush-soft`, etc.

## Cómo se calculan las ganancias (`src/lib/finance.ts`)

```
Ingresos netos     = Ventas brutas − Descuentos − Devoluciones     (el ITBIS no es ingreso)
Ganancia bruta     = Ingresos netos − Costo de la mercancía vendida
Ganancia operativa = Ganancia bruta − Gastos operativos
Ganancia neta      = Ganancia operativa − Gastos financieros − Impuesto sobre la renta
```

Las **compras de mercancía no se restan** como gasto: pasan al inventario y se vuelven costo cuando se venden.
Los montos se manejan en **centavos enteros** para evitar errores de redondeo.

## Estructura del código

```
src/
├── app/(admin)/layout.tsx        Estructura con menú y barra superior
├── app/(admin)/page.tsx          Dashboard
├── app/(admin)/[...modulo]/      Páginas de módulos de fases futuras
├── components/layout/            Sidebar, Topbar, buscador
├── components/dashboard/         Tarjetas, gráficos y tablas
├── components/ui/                Card, Button, Badge, DropdownMenu
└── lib/
    ├── dashboard-repository.ts   ÚNICO punto de acceso a datos (hoy demo, mañana PostgreSQL)
    ├── demo-data.ts              Datos de demostración determinísticos
    ├── finance.ts                Fórmulas financieras (con pruebas en tests/)
    ├── navigation.ts             Menú y fases
    └── types.ts                  Contratos de datos
```

Para conectar la base de datos solo se cambia el cuerpo de `getDashboardData()`; los componentes no se tocan.
La función SQL `income_statement()` devuelve exactamente los campos de `IncomeStatementInput`.

## Plan de las próximas fases

1. ✅ **UI/UX**: dashboard y sistema de diseño.
2. ✅ **Base de datos**: PostgreSQL (Supabase) con productos y variantes, inventario, ventas, pedidos, pagos, gastos, facturas, devoluciones y auditoría; seguridad por filas (RLS) y roles. 71 pruebas automáticas.
3. ✅ **Operaciones**: productos, inventario, compras, clientes, pedidos y ventas con transacciones atómicas.
4. **Finanzas**: gastos, rentabilidad, facturación PDF (NCF/e-CF solo con autorización de la DGII) y reportes Excel/CSV/PDF.
5. **Tienda online**: catálogo, carrito, checkout con transferencia y pasarela de pago más adelante.
6. **Pruebas y despliegue**: pruebas end-to-end, respaldos, dominio y puesta en producción.

## Publicación, datos y seguridad (resumen)

- **GitHub Pages no sirve** para esta aplicación: solo publica páginas estáticas, sin servidor ni base de datos, y no puede guardar ventas ni controlar usuarios.
- Opción recomendada para empezar: **Vercel** (aplicación) + **Supabase** (PostgreSQL, inicio de sesión, fotos y respaldos). Ambos tienen plan gratuito suficiente para una tienda pequeña; para producción conviene el plan pago de Supabase (~US$25/mes), que incluye respaldos diarios y evita que el proyecto se pause por inactividad.
- Acceso: cada administradora tiene su propio usuario y contraseña; los roles (administradora, empleada) se validan **en el servidor** y en la base de datos, no solo en la pantalla.
