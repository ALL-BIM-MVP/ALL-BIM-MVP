import { Resend } from "resend";

const emailMain = process.env.RESEND_EMAIL as string;

export const resend = new Resend(process.env.RESEND_API_KEY);

export const sendInvitation = async (recipientEmail : string, inviteUrl : string) => {
    const result = await resend.emails.send({
        from: emailMain,
        to: recipientEmail,
        subject: "Invitación a ALL-BIM",
        html: `
            <h2>Has sido invitado a ALL-BIM</h2>
            <p>Haz clic en el siguiente enlace:</p>
            <a href="${inviteUrl}">
                Crear cuenta
            </a>
        `,
    });
    console.log(result)
};  