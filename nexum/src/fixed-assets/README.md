# Módulo de Activos Fijos (Fixed Assets)

## Descripción

Módulo para la gestión de Activos Fijos Tangibles (AFT) conforme a las Normas Contables Cubanas (NCC) y la Resolución 340 del Ministerio de Finanzas y Precios (MFP).

## Características

### Funcionalidades Principales

- **Gestión CRUD** de activos fijos con validaciones de datos
- **Depreciación mensual** automática con catálogo de tasas por grupo
- **Bajas de activos** con contabilización automática
- **Revalorización de activos** según NCC cubana
- **Transferencias entre entidades** con comprobantes contables
- **Exportación a Excel y PDF** de reportes
- **Auditoría completa** de todas las operaciones
- **Paginación** de listados para performance
- **Control de versiones** (optimistic locking)

### Cumplimiento NCC Cuba (Nomenclador 2016)

- **Cuentas oficiales**: 240, 375, 613, 620, 626, 696, 332, 335, 555, 845, 950, 700-0020, 731, 822.
- **Depreciación mensual** desde el mes siguiente al alta, con cierre del mes real.
- **Subelemento 70100** en las líneas de gasto de depreciación.
- **Revalorización** con superávit y déficit contra la cuenta patrimonial 613.
- **Reporte de depreciación acumulada** basado en `DepreciationHistory` real.
- **Bloqueo de eliminación** de activos contabilizados; baja obligatoria con reversión.

## Entidades

### FixedAsset
Activos fijos tangibles con campos:
- `id`: Identificador auto-incremental
- `companyId`: ID de la entidad (multi-tenant)
- `version`: Control de versiones (optimistic locking)
- `assetCode`: Código único del activo
- `name`: Nombre del activo
- `description`: Descripción detallada
- `groupNumber`: Grupo de depreciación (1-9)
- `subgroup`: Subgrupo según catálogo
- `subgroupDetail`: Detalle del subgrupo
- `depreciationRate`: Tasa anual de depreciación (%)
- `acquisitionValue`: Valor de adquisición (CUP)
- `currentValue`: Valor actual después de depreciación
- `acquisitionDate`: Fecha de adquisición
- `location`: Ubicación física
- `responsiblePerson`: Persona responsable
- `status`: Estado (active, disposed, fully_depreciated, transferred).
- `revaluationSurplus`: Superávit acumulado en la cuenta 613.
- `createdAt`, `updatedAt`, `deletedAt`: Timestamps

### DepreciationHistory
Historial de depreciaciones mensuales para auditoría:
- `companyId`: ID de la entidad
- `assetId`: ID del activo fijo
- `year`: Año de la depreciación
- `month`: Mes de la depreciación
- `monthlyDepreciation`: Depreciación del mes
- `accumulatedDepreciation`: Depreciación acumulada
- `currentValue`: Valor actual
- `depreciationRate`: Tasa aplicada
- `voucherReference`: Referencia al comprobante contable
- `status`: Estado del proceso
- `errorMessage`: Error si falló
- `createdAt`: Fecha de registro
- Auto-seed con tasas oficiales de la Res. 235-2005 MFP.

### DepreciationCatalog
Catálogo persistente de tasas de depreciación por grupo:
- `groupNumber`: Número de grupo (1-9)
- `groupName`: Nombre del grupo
- `subgroup`: Subgrupo
- `annualRate`: Tasa anual de depreciación (%)
- `usefulLifeYears`: Vida útil en años

### FixedAssetInventory
Modelo oficial cubano de registro de inventario AFT:
- Campos completos según formato oficial cubano
- Integración con reportes oficiales

## API Endpoints

### Gestión de Activos

```
GET    /fixed-assets
POST   /fixed-assets
GET    /fixed-assets/:id
PUT    /fixed-assets/:id
DELETE /fixed-assets/:id
```

### Operaciones Especiales

```
POST   /fixed-assets/:id/dispose              # Baja de activo
POST   /fixed-assets/:id/revalue             # Avalúo / revalorización
POST   /fixed-assets/:id/transfer            # Transferencia entre entidades
POST   /fixed-assets/:id/improvement         # Mejora capitalizable
POST   /fixed-assets/:id/resolve             # Resolver investigación
POST   /fixed-assets/depreciation/process    # Procesar depreciación mensual
```

### Catálogo y Reportes

```
GET    /fixed-assets/depreciation-catalog
GET    /fixed-assets/statistics
GET    /fixed-assets/accumulated-depreciation?year=&month=
GET    /fixed-assets/export/excel
GET    /fixed-assets/export/pdf
GET    /fixed-assets/:id/acta/:type          # Acta baja | recepcion
```

## DTOs

### CreateFixedAssetDto
```typescript
{
  assetCode: string;
  name: string;
  description?: string;
  groupNumber: number;
  subgroup: string;
  subgroupDetail?: string;
  acquisitionValue: number;  // Max: 999,999,999.99
  acquisitionDate: string;  // No puede ser futura
  acquisitionType: 'compra' | 'donacion' | 'sobrante';
  location?: string;
  responsiblePerson?: string;
  costCenterId?: string;
  employeeId?: string;
  supplierId?: string;
}
```

### UpdateFixedAssetDto
Solo permite editar campos lógicamente modificables:
```typescript
{
  name?: string;
  description?: string;
  subgroupDetail?: string;
  location?: string;
  areaId?: number | null;
  responsiblePerson?: string;
  employeeId?: string | null;
  costCenterId?: string | null;
}
```

### RevalueAssetDto
```typescript
{
  newValue: number;         // Nuevo valor de tasación
  reason: string;          // Motivo de revalorización
  revaluationDate: string;
  appraisalReference?: string;
}
```

### TransferAssetDto
```typescript
{
  targetCompanyId: number;  // ID de la entidad destino
  reason: string;
  transferDate: string;
  newLocation?: string;
  newResponsiblePerson?: string;
}
```

### DisposeAssetDto
```typescript
{
  reason: string;
  disposalType: 'faltante' | 'deterioro' | 'venta' | 'devolucion_compra' | 'obsolescencia' | 'rotura' | 'donacion';
  disposalDate?: string;
  bankAccountId?: string;
  saleAmount?: number;
  assetAccountCode?: string;
  counterpartAccountCode?: string;
  proceedsAccountCode?: string;
}
```

## Contabilización Automática (Nomenclador 2016)

### Adquisición de AFT
- **Compra**: Débito `240` / Crédito `410` (Cuentas por Pagar) o `110` (Banco).
- **Donación recibida**: Débito `240` / Crédito `620`.
- **Sobrante en investigación**: Débito `240` / Crédito `555`.

### Depreciación Mensual
- **Débito**: gasto según tipo de centro de costo:
  - `production` → `700-0020`
  - `associated` → `731`
  - otros → `822`
- **Crédito**: `375` (Depreciación Acumulada de AFT).
- Las líneas de gasto llevan `costCenterId` y `subelement: '70100'`.
- La fecha del comprobante es el **último día real del mes**.
- La depreciación comienza el **mes siguiente** a la fecha de adquisición.

### Baja de AFT
- **Débito**: `375` por lo depreciado + cuenta por concepto del valor residual.
- **Crédito**: `240` por el valor de adquisición.

| Concepto | Contrapartida del valor residual |
|---|---|
| Venta | `135-0020` / `110` por importe + `950` (ganancia) o `845` (pérdida) |
| Faltante | `332` Faltantes de Bienes en Investigación |
| Devolución de compra | `410` (parte no pagada) / `335` (parte ya pagada) |
| Donación entregada | `626` Donaciones Entregadas-Nacionales |
| Deterioro / obsolescencia / rotura | `845` Faltantes y Pérdidas |

### Revalorización (Superávit)
- **Débito**: `240`
- **Crédito**: `613` (Revalorización de Activos Fijos Tangibles)
- Incrementa `revaluationSurplus`.

### Revalorización (Déficit)
- **Débito**: `613` hasta agotar el `revaluationSurplus` acumulado; exceso a `845`.
- **Crédito**: `240`

### Transferencia entre entidades
- **Cuenta puente**: `696` Operaciones entre Dependencias.
- **Salida**: Débito `696` (valor neto) + `375` (depreciación) / Crédito `240`.
- **Entrada**: Débito `240` / Crédito `375` + `696`.

### Mejora Capitalizable
- **Débito**: `240`
- **Crédito**: `110` (banco) o `410` (obligación)
- Permite reactivar la depreciación de un activo `fully_depreciated`.

## Validaciones

- Tasa de depreciación > 0 y ≤ 100 %.
- Fecha de adquisición no futura.
- Código de activo único por entidad.
- No se puede dar de baja, revalorizar ni transferir un activo ya dado de baja.
- No se puede cambiar el estado a `disposed` desde `update`; se exige el procedimiento de baja.
- No se puede eliminar un activo con comprobantes, historial de depreciación o investigación pendiente.

## Auditoría

Todas las operaciones (create, update, delete, dispose, revalue, transfer) generan registros de auditoría:
- `companyId`: Entidad
- `userName`: Usuario que realizó la acción
- `action`: Tipo de acción (CREATE, UPDATE, DELETE)
- `resource`: Tipo de recurso (FIXED_ASSET)
- `resourceId`: ID del recurso
- `resourceName`: Nombre descriptivo
- `oldValues`: Valores anteriores
- `newValues`: Valores nuevos
- `createdAt`: Timestamp

## Paginación

El endpoint `GET /fixed-assets` soporta paginación:
```
GET /fixed-assets?page=1&limit=50
```

Respuesta:
```typescript
{
  assets: FixedAsset[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

## Filtros

```
GET /fixed-assets?status=active&group_number=1&search=equipo
```

- `status`: Filtra por estado (active, disposed, fully_depreciated)
- `group_number`: Filtra por grupo de depreciación
- `search`: Busca en nombre, código o descripción

## Reportes

### Estadísticas
```
GET /fixed-assets/statistics
```
Retorna:
- `totalAssets`
- `activeCount`
- `disposedCount`
- `fullyDepreciatedCount`
- `transferredCount`
- `totalAcquisitionValue`
- `totalCurrentValue`
- `totalDepreciation` (acumulada real)
- `totalValueVariation`

### Depreciación Acumulada
```
GET /fixed-assets/accumulated-depreciation?year=2026&month=5
```
Retorna reporte detallado con:
- Basado en `DepreciationHistory` real.
- Detalle por activo, resumen por grupo y totales.
- Incluye advertencias de conciliación si el acumulado real difiere del teórico.

## Exportación

### Excel
```
GET /fixed-assets/export/excel
```
Genera archivo Excel con todos los activos.

### PDF
```
GET /fixed-assets/export/pdf
```
Genera reporte PDF con formato oficial.

## Dependencias

- TypeORM (ORM PostgreSQL)
- ExcelJS (exportación Excel)
- PDF-Lib (generación PDF)
- AuditService (auditoría)
- VoucherService (contabilización)

## Estructura de Archivos

```
src/fixed-assets/
├── dto/
│   ├── fixed-asset.dto.ts
│   └── fixed-asset-validator.ts
├── fixed-assets.controller.ts
├── fixed-assets.module.ts
├── fixed-assets.service.ts
├── fixed-assets.service.spec.ts
└── README.md
```

## Notas de Implementación

- El esquema se gestiona mediante migraciones (`synchronize: false` en producción).
- Todas las entidades incluyen `companyId` para aislamiento multi-tenant.
- La depreciación se calcula automáticamente por método lineal desde el mes siguiente al alta.
- Los comprobantes contables se generan vía `VoucherService.createVoucherFromModule()`.
- La auditoría se registra vía `AuditService.log()`.

## Pruebas

- `fixed-assets.service.spec.ts` cubre las regresiones principales:
  - Bloqueo de eliminación de activos contabilizados / depreciados / en investigación.
  - Conteo de `fully_depreciated` y `transferred` en estadísticas.
  - Bloqueo de cambio directo a `disposed` en `update`.

Ejecutar:

```bash
npx jest src/fixed-assets/fixed-assets.service.spec.ts
```

---

## Procedimientos de Validación y Control (Resolución 340)

### Validaciones de Datos

1. **Tasa de Depreciación**
   - Validación: `@Max(100)` en DTO
   - Objetivo: Evitar tasas superiores al 100%
   - Ubicación: `CreateFixedAssetDto.depreciationRate`

2. **Fecha de Adquisición**
   - Validación: `@IsNotFutureDate` (validator personalizado)
   - Objetivo: Evitar fechas futuras en adquisiciones
   - Ubicación: `CreateFixedAssetDto.acquisitionDate`

3. **Valores Monetarios**
   - Validación: `@Max(999999999.99)` en todos los campos monetarios
   - Objetivo: Limitar valores a máximo permitido por sistema
   - Ubicación: `acquisitionValue`, `newValue` (revalorización)

4. **Código de Activo**
   - Validación: `unique: true` en columna `asset_code`
   - Objetivo: Evitar duplicados de códigos por entidad
   - Ubicación: `FixedAsset.entity.ts`

### Control de Operaciones

1. **Creación de Activo**
   - Verifica que el código sea único
   - Valida que la fecha de adquisición no sea futura
   - Genera comprobante contable de adquisición
   - Registra auditoría con oldValues y newValues

2. **Actualización de Activo**
   - Valida que el activo exista
   - Registra auditoría con valores antes/después
   - No permite actualizar campos críticos (companyId, acquisitionValue)

3. **Baja de Activo**
   - Valida que el activo no esté ya dado de baja
   - Calcula depreciación acumulada y pérdida residual
   - Genera comprobante contable de baja
   - Actualiza estado a 'disposed'
   - Registra auditoría completa

4. **Revalorización de Activo**
   - Valida que el activo no esté dado de baja
   - Valida que el nuevo valor sea diferente al actual
   - Genera comprobante contable (superávit o déficit)
   - Revierte cambios si falla contabilización
   - Registra auditoría

5. **Transferencia de Activo**
   - Valida que el activo no esté dado de baja
   - Valida que entidad destino sea diferente a origen
   - Genera comprobante de salida (entidad origen)
   - Genera comprobante de entrada (entidad destino)
   - Revierte cambios si falla contabilización destino
   - Registra auditoría

6. **Procesamiento de Depreciación**
   - Solo procesa activos con estado 'active'
   - Calcula depreciación mensual según tasa
   - Actualiza valor actual del activo
   - Registra en DepreciationHistory
   - Genera comprobante contable de depreciación
   - Maneja errores individualmente por activo

### Auditoría

Todas las operaciones registran:
- `companyId`: Entidad responsable
- `userName`: Usuario que ejecutó la acción
- `action`: CREATE, UPDATE, DELETE
- `resource`: FIXED_ASSET
- `resourceId`: ID del activo
- `resourceName`: Nombre descriptivo
- `oldValues`: Estado anterior
- `newValues`: Estado nuevo
- `createdAt`: Timestamp

### Seguridad y Aislamiento

- **Multi-tenant**: Todas las entidades incluyen `companyId`
- **Guard**: `JwtAuthGuard` + `RolesGuard` en todos los endpoints
- **Roles**: SUPERADMIN, ADMIN, USER tienen acceso
- **Filtros**: Todos los queries filtran por `companyId` del usuario

### Cumplimiento NCC Cuba

| Requisito NCC | Implementación | Estado |
|---------------|----------------|--------|
| Registro Inventario AFT | Entidad `FixedAssetInventory` | ✅ |
| Catálogo Depreciación | Entidad `DepreciationCatalog` | ✅ |
| Historial Depreciación | Entidad `DepreciationHistory` | ✅ |
| Revalorización (613/845) | Método `revalueAsset()` | ✅ |
| Transferencias | Método `transferAsset()` | ✅ |
| Reporte Depreciación Acumulada | Endpoint `/accumulated-depreciation` | ✅ |
| Comprobantes Contables | Integración `VoucherService` | ✅ |
| Auditoría Completa | Integración `AuditService` | ✅ |
| Validaciones Res. 340 | DTOs + validators personalizados | ✅ |

### Cuentas Contables Utilizadas

| Operación | Débito | Crédito |
|-----------|--------|---------|
| Adquisición (compra) | 240 | 410/110 |
| Adquisición (donación) | 240 | 620 |
| Adquisición (sobrante) | 240 | 555 |
| Depreciación Mensual | 700-0020/731/822 | 375 |
| Baja de AFT | 375, 845/332/626/335/135 | 240 |
| Revalorización (superávit) | 240 | 613 |
| Revalorización (déficit) | 613/845 | 240 |
| Transferencia Salida | 696, 375 | 240 |
| Transferencia Entrada | 240 | 375, 696 |
| Mejora capitalizable | 240 | 110/410 |

### Control de Errores

- **Transacciones**: Operaciones críticas usan transacciones implícitas
- **Reversión**: Si falla contabilización, se revierten cambios en datos
- **Logging**: Errores se registran en `Logger` con contexto
- **Excepciones**: Errores específicos (NotFoundException, BadRequestException)

