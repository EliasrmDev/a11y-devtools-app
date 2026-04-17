export interface EmailPort {
  send(params: SendEmailParams): Promise<void>;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}
