#!/usr/bin/env bash
# Servidor para las pruebas en navegador (npx playwright test): base nueva en
# .data/e2e con los datos de demostración y ARCA simulado. Nada sale a internet.
set -euo pipefail
export DATA_DIR=.data/e2e
rm -rf "$DATA_DIR"
export ERP_CLAVE_MAESTRA="${ERP_CLAVE_MAESTRA:-clave-maestra-solo-para-pruebas-e2e-0000000000}"
export SEMILLA_CLAVE="${SEMILLA_CLAVE:-Prueba-E2E-2026}"
npx tsx scripts/semilla.ts
export ARCA_SIMULADO=1
export APP_URL="http://localhost:${E2E_PUERTO:-3200}"
exec npx next dev -p "${E2E_PUERTO:-3200}"
