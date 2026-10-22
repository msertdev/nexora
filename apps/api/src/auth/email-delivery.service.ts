import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { invitationEmail, verificationEmail } from './email-templates.js';

type SmtpSettings = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
};

@Injectable()
export class EmailDeliveryService {
  private transporter: Transporter | null = null;
  private settings: SmtpSettings | null = null;

  constructor(private readonly config: ConfigService) {}

  async sendVerificationLink(email: string, verificationUrl: string) {
    const message = verificationEmail(verificationUrl);
    await this.send(email, message.subject, message.text, message.html);
  }

  async sendInvitation(
    email: string,
    organizationName: string,
    inviterName: string,
    role: 'ADMIN' | 'MEMBER',
    invitationUrl: string,
  ) {
    const message = invitationEmail(
      organizationName,
      inviterName,
      role,
      invitationUrl,
    );
    await this.send(email, message.subject, message.text, message.html);
  }

  private async send(
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<void> {
    try {
      const { transporter, settings } = this.getTransport();
      await transporter.sendMail({
        from: settings.from,
        to,
        subject,
        text,
        html,
      });
    } catch {
      throw new ServiceUnavailableException('Email delivery unavailable');
    }
  }

  private getTransport() {
    if (this.transporter && this.settings) {
      return { transporter: this.transporter, settings: this.settings };
    }

    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const from = this.config.get<string>('SMTP_FROM')?.trim();
    const portValue = this.config.get<string>('SMTP_PORT');
    const secureValue = this.config.get<string>('SMTP_SECURE');
    const user = this.config.get<string>('SMTP_USER')?.trim() || undefined;
    const password = this.config.get<string>('SMTP_PASSWORD') || undefined;

    if (!host || !from || !portValue || secureValue === undefined) {
      throw new Error('SMTP configuration is incomplete');
    }
    if (Boolean(user) !== Boolean(password)) {
      throw new Error('SMTP authentication configuration is incomplete');
    }
    const port = Number(portValue);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('SMTP port is invalid');
    }

    const secure = secureValue === 'true';
    const settings: SmtpSettings = {
      host,
      port,
      secure,
      ...(user ? { user, password } : {}),
      from,
    };
    const normalizedHost = host.toLowerCase().replace(/\.$/, '');
    const isLocalMailpit =
      !secure &&
      port === 1025 &&
      ['localhost', '127.0.0.1', 'mailpit'].includes(normalizedHost);
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      ...(settings.user && settings.password
        ? { auth: { user: settings.user, pass: settings.password } }
        : {}),
      ...(secure || isLocalMailpit ? {} : { requireTLS: true }),
      tls: {
        rejectUnauthorized: true,
      },
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    this.settings = settings;
    this.transporter = transporter;
    return { transporter, settings };
  }
}
