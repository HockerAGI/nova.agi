# NOVA Runtime — Codex Security Review — 2026-08-07

## Status

**Connector-assisted standard security review. No production deployment or merge is authorized.**

This review follows the installed Codex Security standard methodology. The native Codex Security worker/scan-ID runtime is not exposed in this ChatGPT environment, so source inspection used the authenticated GitHub connector. Coverage is **partial / connector-assisted**, not an exhaustive native scan claim.

Repository: `HockerAGI/nova.agi`
Version: hardening candidate branch `hardening/production-readiness-20260807`

## Threat model

### Assets
- NOVA orchestrator identity and service-role access.
- Provider API credentials and routing/budget controls.
- Memory/thread data.
- MCP tool calls and deferred mutation proposals.
- Command-signing material used by the optional legacy compatibility path.

### Trust boundaries
- Hocker ONE/orchestrator caller → NOVA HTTP API.
- NOVA → model providers.
- Model output → MCP/tool/action parser.
- NOVA → Supabase service role.
- Proposed mutation → Hocker ONE Owner Gate.

### Security invariants
- Production must require `NOVA_ORCHESTRATOR_KEY`.
- Model/user output must not directly authorize writes.
- Read-only MCP operations may execute directly; mutations must be deferred to Owner Gate.
- Write commands always require approval.
- Legacy direct command queue remains disabled unless explicitly enabled as break-glass.

## Validated controls

1. Production configuration rejects startup without `NOVA_ORCHESTRATOR_KEY`; request pre-handler verifies the bearer value with timing-safe comparison.
2. `allow_actions` request input is passed through runtime policy rather than treated as direct authority.
3. `sanitizeNovaAction` accepts only supported commands and forces approval for write commands.
4. MCP integration separates direct read-only operations from deferred mutations.
5. Legacy `commands` enqueueing is disabled by default and requires explicit `NOVA_LEGACY_COMMAND_QUEUE_ENABLED`; when enabled, write commands still become `needs_approval`.
6. Provider errors are sanitized before being exposed publicly, reducing leakage of credentials/provider details.

## Residual findings

### P1 — privileged legacy queue must remain break-glass only
NOVA holds Supabase service-role access. If `NOVA_LEGACY_COMMAND_QUEUE_ENABLED` is enabled, NOVA can materialize signed legacy command rows. The current policy forces write approval, but this path duplicates the stronger Hocker ONE AGI action queue. Keep the environment flag off in normal production and add configuration monitoring so an accidental enablement is immediately visible.

### P1 — service-role and provider credentials require coordinated rotation
NOVA references Supabase service role and multiple provider tokens. The repository does not hardcode their values in the reviewed files, but the external credentials document makes provider-side rotation a release requirement.

### Defense in depth — minimize credential aliases
Several providers accept multiple environment-variable aliases (for example GitHub/Vercel/OpenAI). This improves compatibility but increases operational ambiguity during rotation. Converging on one canonical variable per runtime secret would make revocation evidence clearer.

## Coverage

Reviewed high-risk surfaces include production auth hook, configuration validation, provider credential handling, command policy, legacy action queue and MCP/Owner-Gate behavior. This connector-assisted review does not assert complete file coverage or independent native worker execution.
