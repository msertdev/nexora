import { Injectable, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class EmailDeliveryService {
  async sendVerificationLink(
    _email: string,
    _verificationUrl: string,
  ): Promise<void> {
    throw new ServiceUnavailableException(
      'Email verification delivery is not configured',
    );
  }
}
