// apps/backend/src/controllers/util.allowed-domains.ts
/** Helper reutilizable para leer dominios permitidos (compat). */
export function getAllowedDomains(): string[] {
  const raw = process.env.ALLOWED_EMAIL_DOMAINS ?? process.env.ALLOWED_EMAIL_DOMAIN ?? '';
  return raw
    .split(/[,\s]+/)
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}