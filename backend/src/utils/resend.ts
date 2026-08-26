import { Resend } from "resend";

const emailMain = process.env.RESEND_EMAIL as string;

// Instanciación LAZY (recién adentro de sendInvitation, no acá arriba
// a nivel de módulo) — el SDK de Resend tira una excepción inmediata
// si la API key viene vacía/undefined al construir el cliente, y una
// excepción a nivel de módulo tumba el proceso ENTERO apenas algo
// importa este archivo (confirmado en la primera instalación real vía
// Docker, ver docs/diagnostico-primera-instalacion.md punto 3) — no
// solo la función de invitaciones. Con esto, un RESEND_API_KEY
// faltante recién falla cuando de verdad se intenta mandar un email
// (con un mensaje claro de por qué), no al arrancar el servidor.
let resendClient: Resend | null = null;
const getResendClient = (): Resend => {
    if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
    return resendClient;
};

export const sendInvitation = async (recipientEmail : string, inviteUrl : string, rolName : string) => {
    await getResendClient().emails.send({
        from: emailMain,
        to: recipientEmail,
        subject: "Invitación a ALL-BIM",
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #0056b3; font-size: 36px; margin: 0;">ALL-BIM</h1>
                    <p style="color: #666; font-size: 16px;">Plataforma de gestión BIM</p>
                </div>
                
                <h2 style="color: #333; text-align: center;">¡Has sido invitado!</h2>
                
                <p style="color: #555; font-size: 16px; line-height: 1.6; text-align: center;">
                    Has recibido una invitación para unirte a ALL-BIM como <strong style="color: #0056b3;">${rolName}</strong>.
                </p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${inviteUrl}" 
                        style="display: inline-block; background: #0056b3; color: white; padding: 14px 40px; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold;">
                        Aceptar invitación
                    </a>
                </div>
                
                <p style="color: #888; font-size: 14px; text-align: center;">
                    O copia este enlace en tu navegador:<br>
                    <span style="color: #0056b3; word-break: break-all; font-size: 12px;">${inviteUrl}</span>
                </p>
                
                <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;" />
                
                <p style="color: #999; font-size: 13px; text-align: center;">
                    Este enlace expirará en 24 horas.<br>
                    Si no solicitaste esta invitación, ignora este correo.
                </p>
                
                <p style="color: #aaa; font-size: 12px; text-align: center; margin-top: 10px;">
                    ALL-BIM - Plataforma de gestión BIM
                </p>
            </div>
        `,
    });
};  