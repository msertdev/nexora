import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { EmailDeliveryService } from './email-delivery.service.js';

vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn() },
}));

describe('EmailDeliveryService (mocked SMTP)', () => {
  const configValues: Record<string, string | undefined> = {};
  const config = {
    get: (key: string) => configValues[key],
  } as ConfigService;
  const sendMail = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(configValues, {
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1025',
      SMTP_SECURE: 'false',
      SMTP_FROM: 'NEXORA <noreply@nexora.local>',
    });
    delete configValues.SMTP_USER;
    delete configValues.SMTP_PASSWORD;
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
    } as unknown as ReturnType<typeof nodemailer.createTransport>);
    sendMail.mockResolvedValue({ messageId: 'mock-message' });
  });

  it('creates an unauthenticated Mailpit transport with local non-TLS settings', async () => {
    const service = new EmailDeliveryService(config);
    await service.sendVerificationLink(
      'person@example.com',
      'http://localhost:3000/verify-email#token=secret-token',
    );

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '127.0.0.1',
        port: 1025,
        secure: false,
        tls: { rejectUnauthorized: true },
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'NEXORA <noreply@nexora.local>',
        to: 'person@example.com',
        subject: 'Verify your NEXORA email address',
        text: expect.stringContaining('secret-token'),
        html: expect.stringContaining('secret-token'),
      }),
    );
  });

  it('supports authenticated SMTP', async () => {
    configValues.SMTP_HOST = 'smtp.example.test';
    configValues.SMTP_PORT = '587';
    configValues.SMTP_USER = 'smtp-user';
    configValues.SMTP_PASSWORD = 'smtp-password';
    const service = new EmailDeliveryService(config);

    await service.sendInvitation(
      'invitee@example.com',
      '<Workspace>',
      'A&B',
      'MEMBER',
      'https://nexora.example/invitations/accept#token=private',
    );

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.test',
        port: 587,
        secure: false,
        auth: { user: 'smtp-user', pass: 'smtp-password' },
        requireTLS: true,
        tls: { rejectUnauthorized: true },
      }),
    );
    const message = sendMail.mock.calls[0]?.[0];
    expect(message.to).toBe('invitee@example.com');
    expect(message.html).toContain('&lt;Workspace&gt;');
    expect(message.html).toContain('A&amp;B');
    expect(message.html).not.toContain('<Workspace>');
    expect(message.text).toContain('<Workspace>');
    expect(message.html).toContain(
      'https://nexora.example/invitations/accept#token=private',
    );
  });

  it('uses implicit TLS when SMTP_SECURE is enabled', async () => {
    configValues.SMTP_HOST = 'smtp.example.test';
    configValues.SMTP_PORT = '465';
    configValues.SMTP_SECURE = 'true';
    const service = new EmailDeliveryService(config);

    await service.sendVerificationLink(
      'person@example.com',
      'https://nexora.example/verify-email#token=value',
    );

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.test',
        port: 465,
        secure: true,
        tls: { rejectUnauthorized: true },
      }),
    );
    expect(nodemailer.createTransport).not.toHaveBeenCalledWith(
      expect.objectContaining({ requireTLS: true }),
    );
  });

  it('fails closed when SMTP configuration is missing', async () => {
    configValues.SMTP_HOST = undefined;
    const service = new EmailDeliveryService(config);

    await expect(
      service.sendVerificationLink(
        'person@example.com',
        'https://app.test/link',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('does not expose SMTP errors or credential details', async () => {
    sendMail.mockRejectedValueOnce(
      new Error('auth rejected for smtp-password-value'),
    );
    const service = new EmailDeliveryService(config);

    const delivery = service.sendVerificationLink(
      'person@example.com',
      'https://app.test/link',
    );
    await expect(delivery).rejects.toThrow('Email delivery unavailable');
    await expect(delivery).rejects.not.toThrow('smtp-password-value');
  });
});
