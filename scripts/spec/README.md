# `scripts/spec/` — OpenCRM Rebuild Guardrails

Helper scripts yang dipakai oleh spec `~/.kiro/specs/opencrm-app/`. Tujuannya: enforce dua property paling kritis di gate awal sebelum ada kode build.

| Script | Property | Requirement | Exit 0 | Exit 1 |
|---|---|---|---|---|
| `check-write-path.sh <path>...` | P1 Workspace separation | 1.2, 1.3 | semua path di bawah `$OPENCRM_APP` | ada path di luar `$OPENCRM_APP` |
| `check-forbidden.sh <command...>` | P2 Forbidden command guardrail | 6.1, 6.2, 6.3 | command aman atau `OPENCRM_GATE_PASSED >= 4` | command lint/build/test/dev/start/smoke + gate < 4 |

## `check-write-path.sh`

```bash
# Allowed: paths inside the app workspace
scripts/spec/check-write-path.sh apps/backend/src/index.ts

# Rejected: paths outside (e.g., builder class)
scripts/spec/check-write-path.sh "$OPENCRM_BUILDER_CLASS/OPENCLAW.md"
```

Memakai `realpath -m` sehingga path yang belum ada di disk tetap bisa divalidasi (use case: file akan dibuat).

Variable lingkungan:
- `OPENCRM_APP` (default `/home/ubuntu/.openclaw/workspace/opencrm-app`)
- `OPENCRM_BUILDER_CLASS` (opsional; kalau diset, pesan error menyebut explicit ketika violator path masuk builder class)

## `check-forbidden.sh`

```bash
# Allowed before gate 4
scripts/spec/check-forbidden.sh bun install
scripts/spec/check-forbidden.sh bun run db:generate

# Forbidden before gate 4 (exit 1)
scripts/spec/check-forbidden.sh bun run lint
scripts/spec/check-forbidden.sh bun run build:backend
scripts/spec/check-forbidden.sh ./run-backend.sh

# Unblocked once gate 4 has been recorded
OPENCRM_GATE_PASSED=4 scripts/spec/check-forbidden.sh bun run lint
```

Pola forbidden mengikuti requirements.md Requirement 6.1 dan design.md section 9. Setelah gate 4 selesai, ekspor `OPENCRM_GATE_PASSED=4` (atau lebih tinggi) di shell yang menjalankan command-command tersebut.

Script ini **tidak** menjalankan command — hanya melakukan inspect. Caller bertanggung jawab eksekusi setelah cek lulus.
