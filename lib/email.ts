import "dotenv/config";
import { Resend } from "resend";

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
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const resend = getResendClient();
  const { data, error } = await resend.emails.send({
    from: "Amiconsorcio <notificaciones@amiconsorcio.com.ar>",
    to,
    subject,
    html,
  });

  if (error) {
    console.error("Email error:", error);
    throw error;
  }

  return data;
}