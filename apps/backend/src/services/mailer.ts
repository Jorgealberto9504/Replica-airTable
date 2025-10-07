// apps/backend/src/services/mailer.ts
import nodemailer from 'nodemailer';

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_SECURE,
  MAIL_FROM,
  MAIL_FROM_NAME,
} = process.env;

// Logs de ayuda si algo falta
if (!SMTP_HOST || !SMTP_PORT) {
  console.warn('[mailer] Falta SMTP_HOST o SMTP_PORT en .env');
}
if (!SMTP_USER || !SMTP_PASS) {
  console.warn('[mailer] Falta SMTP_USER/SMTP_PASS en .env (no se podrá autenticar)');
}

const port = Number(SMTP_PORT ?? 587);
// secure: true para 465 (SSL) o si SMTP_SECURE==='true'
const secure =
  String(SMTP_SECURE ?? '').toLowerCase() === 'true' || port === 465;

// Transporter reutilizable
export const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port,
  secure,
  auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  // endurecemos TLS (muchos cPanel funcionan bien con esto)
  tls: { minVersion: 'TLSv1.2' },
});

// Remitente por defecto: "Nombre <correo>"
const defaultFrom =
  MAIL_FROM ??
  `${MAIL_FROM_NAME ?? 'MBQ Soporte'} <${SMTP_USER ?? 'no-reply@localhost'}>`;

/** Envía un correo genérico. */
export async function sendMail(opts: {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}) {
  if (!SMTP_HOST || !SMTP_PORT) {
    throw new Error('Mailer no configurado: faltan SMTP_HOST/SMTP_PORT');
  }
  return transporter.sendMail({
    from: opts.from ?? defaultFrom,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}

/** Email específico para “restablecer contraseña”. */
export async function sendPasswordResetEmail(to: string, link: string) {
  const subject = 'Restablecer contraseña · MBQ';
  const text = `Hola,
Solicitaste restablecer tu contraseña.
Abre este enlace para continuar: ${link}

Si no fuiste tú, ignora este mensaje.`;
  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
    <p>Hola,</p>
    <p>Solicitaste restablecer tu contraseña, haz click en el siguiente enlace para asignarte la contraseña generica <Strong>"Aa12345!"</Strong> debes cambiar esta en tu siguiente inicio de sesion.</p>
    <p style="margin:16px 0">
      <a href="${link}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#0f172a;color:#fff;text-decoration:none">
        Restablecer contraseña
      </a>
    </p>
    <p style="color:#475569;font-size:14px">Si no fuiste tú, ignora este mensaje.</p>
  </div>`;

  await sendMail({ to, subject, text, html });
}

/** Llamar una vez al iniciar el servidor para verificar credenciales SMTP. */
export async function verifyMailer() {
  try {
    await transporter.verify();
    console.log(`[mailer] SMTP OK como ${SMTP_USER} (${SMTP_HOST}:${port}, secure=${secure})`);
  } catch (e) {
    console.error('[mailer] Error de conexión SMTP:', e);
  }
}