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

### Cumplimiento NCC Cuba

- **Registro Inventario AFT**: Modelo oficial cubano (entidad `FixedAssetInventory`)
- **Reporte Depreciación Acumulada**: Modelo oficial con agrupación por grupos
- **Revalorización**: Superávit (cuenta 846) y Déficit (cuenta 845)
- **Transferencias**: Comprobantes de salida y entrada entre entidades
- **Catálogo Depreciación**: Tasas oficiales por grupo y subgrupo (entidad `DepreciationCatalog`)

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
- `status`: Estado (active, disposed, fully_depreciated)
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
POST   /fixed-assets/:id/dispose         # Baja de activo
POST   /fixed-assets/:id/revalue        # Revalorización
POST   /fixed-assets/:id/transfer       # Transferencia entre entidades
POST   /fixed-assets/depreciation/process # Procesar depreciación mensual
```

### Catálogo y Reportes

```
GET    /fixed-assets/depreciation-catalog
GET    /fixed-assets/statistics
GET    /fixed-assets/accumulated-depreciation?year=&month=
GET    /fixed-assets/export/excel
GET    /fixed-assets/export/pdf
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
  location?: string;
  responsiblePerson?: string;
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
  disposalType: 'deterioro' | 'obsolescencia' | 'rotura' | 'faltante' | 'venta' | 'donacion';
  disposalDate?: string;
}
```

## Contabilización Automática

### Adquisición de AFT
- **Débito**: Cuenta 240 (Activos Fijos Tangibles)
- **Crédito**: Cuenta 460 (Cuentas por Pagar) o 104 (Caja)

### Depreciación Mensual
- **Débito**: Cuenta 842 (Gastos de Depreciación)
- **Crédito**: Cuenta 241 (Depreciación Acumulada)

### Baja de AFT
- **Débito**: Cuenta 241 (Depreciación Acumulada)
- **Débito**: Cuenta 845 (Faltantes y Pérdidas) - pérdida residual
- **Crédito**: Cuenta 240 (Activos Fijos Tangibles)

### Revalorización (Superávit)
- **Débito**: Cuenta 240 (Activos Fijos Tangibles)
- **Crédito**: Cuenta 846 (Superávit de Revalorización)

### Revalorización (Déficit)
- **Débito**: Cuenta 845 (Faltantes y Pérdidas)
- **Crédito**: Cuenta 240 (Activos Fijos Tangibles)

### Transferencia (Salida - Entidad Origen)
- **Crédito**: Cuenta 240 (Activos Fijos Tangibles)

### Transferencia (Entrada - Entidad Destino)
- **Débito**: Cuenta 240 (Activos Fijos Tangibles)

## Validaciones (Resolución 340)

- Tasa de depreciación ≤ 100%
- Fecha de adquisición no futura
- Valores monetarios máximos: 999,999,999.99 CUP
- Código de activo único por entidad
- No se pueden transferir activos dados de baja
- No se pueden revalorizar activos dados de baja

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
- totalAssets
- activeCount
- disposedCount
- totalAcquisitionValue
- totalCurrentValue
- totalDepreciation

### Depreciación Acumulada
```
GET /fixed-assets/accumulated-depreciation?year=2026&month=5
```
Retorna reporte detallado con:
- Detalle por activo
- Resumen por grupo
- Totales generales

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
│   └── fixed-asset.dto.ts
├── fixed-assets.controller.ts
├── fixed-assets.module.ts
├── fixed-assets.service.ts
└── README.md
```

## Notas de Implementación

- El módulo usa `synchronize: true` para crear automáticamente las tablas
- Todos las entidades incluyen `companyId` para aislamiento multi-tenant
- La depreciación se calcula automáticamente usando el método lineal
- Los comprobantes contables se generan vía `VoucherService.createVoucherFromModule()`
- La auditoría se registra vía `AuditService.log()`

## Próximas Mejoras (FASE 7-8)

- Soporte para múltiples métodos de depreciación (suma de dígitos, doble saldo decreciente)
- Conciliación automática con catálogo contable
- Documentación para certificación MFP
- Pruebas integrales de cumplimiento NCC

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
| Revalorización (846/845) | Método `revalueAsset()` | ✅ |
| Transferencias | Método `transferAsset()` | ✅ |
| Reporte Depreciación Acumulada | Endpoint `/accumulated-depreciation` | ✅ |
| Comprobantes Contables | Integración `VoucherService` | ✅ |
| Auditoría Completa | Integración `AuditService` | ✅ |
| Validaciones Res. 340 | DTOs + validators personalizados | ✅ |

### Cuentas Contables Utilizadas

| Operación | Débito | Crédito |
|-----------|--------|---------|
| Adquisición AFT | 240 | 460/104 |
| Depreciación Mensual | 842 | 241 |
| Baja de AFT | 241, 845 | 240 |
| Revalorización (Superávit) | 240 | 846 |
| Revalorización (Déficit) | 845 | 240 |
| Transferencia Salida | - | 240 |
| Transferencia Entrada | 240 | - |

### Control de Errores

- **Transacciones**: Operaciones críticas usan transacciones implícitas
- **Reversión**: Si falla contabilización, se revierten cambios en datos
- **Logging**: Errores se registran en `Logger` con contexto
- **Excepciones**: Errores específicos (NotFoundException, BadRequestException)

