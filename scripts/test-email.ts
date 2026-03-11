import "dotenv/config";
import { sendEmail } from "../lib/email";

async function run() {
  try {
    console.log("RESEND_API_KEY cargada:", !!process.env.RESEND_API_KEY);

    const result = await sendEmail({
      to: "jee.u21@gmail.com",
      subject: "Test Amiconsorcio",
      html: "<h1>Email funcionando &#128640;</h1><p>El sistema de emails est&aacute; operativo.</p>",
    });

    console.log("Email enviado:", result);
  } catch (error) {
    console.error("Error enviando email:", error);
  }
}

run();