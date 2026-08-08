# Security Policy

## Supported version

Security fixes target the current `main` release line and are validated on an isolated hardening branch before promotion.

## Reporting a vulnerability

Do not open a public issue for suspected authorization bypasses, exposed credentials, cross-project data access, unsafe agent execution, prompt/tool escalation, personal-data exposure, or infrastructure weaknesses.

Report privately to **contacto.hocker@gmail.com**. Include the affected component, safe reproduction steps, impact, required privileges, and minimal redacted evidence.

Never include live credentials, personal data, destructive payloads, or sensitive production records in a public report.

Critical authorization, secrets, agent-execution, destructive-action, and cross-tenant findings block release until remediated and regression-tested. Fixes must preserve Owner Gate policy, audit evidence, and rollback capability.
