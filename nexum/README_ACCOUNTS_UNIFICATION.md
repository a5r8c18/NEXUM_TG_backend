# Unificación de Tablas Account y Subaccount

## 📋 Resumen de Cambios Realizados

### ✅ **Backend Changes**

1. **Script de Migración SQL**
   - 📄 `src/migrations/unify_accounts_subaccounts.sql`
   - Mueve todos los registros de `subaccounts` a `accounts` con `level = 4`
   - Establece `parentCode` con el código de la cuenta padre
   - Incluye verificación y backup de datos

2. **Entidad Account Actualizada**
   - ✨ Agregados `parentCode` y `parentAccountId` con relaciones proper
   - 🏷️ Nombres de columnas consistentes con DB (`parent_code`, `parent_account_id`)
   - 🔗 Relación self-referencial para cuentas padre/hijo

3. **Entidad Subaccount Eliminada**
   - 🗑️ `src/entities/subaccount.entity.ts` removido
   - 📦 Export removido de `src/entities/index.ts`

4. **AccountingService Actualizado**
   - 🔄 `createVoucher()` - lookup de subcuentas usa tabla `accounts`
   - 🔄 `findAccountsByParentCode()` - busca `level = 4` y `parentCode`
   - 🔄 `getSubaccountsByAccount()` - usa `accounts` con `parentCode`
   - 🔄 `createSubaccount()` - crea registros en `accounts` con `level = 4`
   - 🗑️ Repositorio `subaccountRepo` eliminado

5. **AccountingController Actualizado**
   - ✅ Endpoints existentes mantenidos para compatibilidad
   - 🆕 Nuevo endpoint `GET /accounts/children/:parentCode`
   - 📡 `createSubaccount()` redirige a nueva lógica

### ✅ **Frontend Verification**

- 📱 `AccountsComponent` ya trata las subcuentas como cuentas normales
- 🔄 Usa `getAccountsByParentCode()` que ahora devuelve cuentas `level = 4`
- 🌳 Vista de árbol mostrará subcuentas migradas correctamente
- 🚫 No se requieren cambios significativos en frontend

## 🚀 **Instrucciones de Ejecución**

### 1. **Backup de Base de Datos**
```bash
pg_dump nexum_db > backup_before_unification.sql
```

### 2. **Ejecutar Script de Migración**
```bash
psql -d nexum_db -f src/migrations/unify_accounts_subaccounts.sql
```

### 3. **Verificar Migración**
```sql
-- Verificar cuentas migradas
SELECT COUNT(*) as migrated_subaccounts FROM accounts WHERE level = 4;

-- Verificar relaciones padre-hijo
SELECT a.code, a.parent_code, a.level FROM accounts a WHERE a.parent_code IS NOT NULL LIMIT 10;

-- Verificar duplicados
SELECT code, COUNT(*) FROM accounts GROUP BY code HAVING COUNT(*) > 1;
```

### 4. **Probar Funcionalidad**
- 🧪 Crear nuevas subcuentas via frontend
- 🧪 Ver vista de árbol en `AccountsComponent`
- 🧪 Crear vouchers con subcuentas
- 🧪 Generar reportes que usen subcuentas

### 5. **Limpieza Opcional** (solo después de verificación completa)
```sql
-- Descomentar solo después de verificar que todo funciona
-- DROP TABLE IF EXISTS subaccounts CASCADE;
-- DROP TABLE IF EXISTS accounts_backup;
-- DROP TABLE IF EXISTS subaccounts_backup;
```

## 📊 **Impacto en Datos**

### ✅ **Datos Preservados**
- Todas las subcuentas existentes migradas a `accounts.level = 4`
- Relaciones con cuentas padre mantenidas via `parentCode`
- IDs originales preservados
- Fechas de creación/actualización mantenidas

### ✅ **Funcionalidad Mantenida**
- Creación de subcuentas (ahora como cuentas level 4)
- Búsqueda de subcuentas por cuenta padre
- Jerarquía de 4 niveles intacta
- Compatibilidad con frontend existente

## ⚠️ **Consideraciones Importantes**

1. **Testing**: Ejecutar en entorno de pruebas primero
2. **Performance**: Índice agregado en `parentCode` para búsquedas rápidas
3. **Backward Compatibility**: Endpoints antiguos mantenidos
4. **Data Integrity**: Script incluye validaciones y rollback options

## 🔍 **Verificación Post-Migración**

### Backend Tests
```bash
# Test crear subcuenta
curl -X POST http://localhost:3001/accounting/subaccounts \
  -H "Content-Type: application/json" \
  -d '{"accountId": "parent-id", "subaccountCode": "10101", "subaccountName": "Test Subaccount"}'

# Test obtener subcuentas
curl http://localhost:3001/accounting/subaccounts/parent-id

# Test obtener cuentas hijas
curl http://localhost:3001/accounting/accounts/children/101
```

### Frontend Tests
- Acceder a `/accounting/accounts`
- Expandir cuentas en vista de árbol
- Crear nueva subcuenta
- Verificar que aparezca en lista

## 📞 **Soporte**

Si hay problemas durante la migración:
1. Restaurar desde backup: `psql -d nexum_db < backup_before_unification.sql`
2. Revisar logs del script de migración
3. Verificar que no haya datos corruptos en tablas backup

---

**Estado**: ✅ Completo - Listo para ejecución en entorno de pruebas
