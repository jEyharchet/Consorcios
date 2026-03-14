import "dotenv/config";
import { Resend, type Attachment } from "resend";

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY");
  }

  return new Resend(apiKey);
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  attachments,
}: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Attachment[];
}) {
  const resend = getResendClient();
  const { data, error } = await resend.emails.send({
    from: "Amiconsorcio <notificaciones@amiconsorcio.com.ar>",
    to,
    subject,
    html,
    text,
    attachments,
  });

  if (error) {
    console.error("Email error:", error);
    throw error;
  }

  return data;
}
