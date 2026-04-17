import { Resend } from "resend";
import type { EmailPort, SendEmailParams } from "../../domain/ports/email.port.js";

export class ResendEmailAdapter implements EmailPort {
  private readonly client: Resend;
  private readonly from: string;

  constructor(apiKey: string, from = "a11y DevTools <noreply@a11ydevtools.com>") {
    this.client = new Resend(apiKey);
    this.from = from;
  }

  async send(params: SendEmailParams): Promise<void> {
    await this.client.emails.send({
      from: this.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo,
    });
  }
}
