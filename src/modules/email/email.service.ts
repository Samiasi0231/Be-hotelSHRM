// src/modules/email/email.service.ts — FULL REPLACEMENT
// Transport + sending only. Every email's markup lives in ./templates.
// Public method names/signatures are unchanged, so no caller needs editing.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  EmailContent,
  GuestBookingConfirmationData,
  HotelNewBookingAlertData,
  InviteEmailData,
} from './email.types';
import { guestBookingConfirmationEmail } from '@/modules/email/template/guest-booking-confirmation';
import { hotelNewBookingAlertEmail } from '@/modules/email/template/hotel-new-booking-alert.template';
import { inviteEmail } from '@/modules/email/template/invite.template';
import { welcomeEmail } from '@/modules/email/template/welcome.template';
import { passwordResetEmail } from '@/modules/email/template/password-reset.template';
import { passwordChangedEmail } from '@/modules/email/template/password-changed.template';

@Injectable()
export class EmailService {
  private readonly transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);
  private readonly from: string;
  private readonly frontendUrl: string;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('MAIL_HOST'),
      port: Number(this.config.get('MAIL_PORT')),
      secure: false,
      auth: {
        user: this.config.get<string>('MAIL_USER'),
        pass: this.config.get<string>('MAIL_PASSWORD'),
      },
    });

    this.from = `${this.config.get('MAIL_FROM_NAME')} <${this.config.get('MAIL_FROM_EMAIL')}>`;
    // Links in emails open in the browser, so they point at the FRONTEND (APP_URL is the API).
    this.frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:5173');
  }

  // Never throws — a failed email must not fail the booking/auth request that triggered it.
  private async send(to: string, content: EmailContent, label: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: content.subject,
        html: content.html,
      });
      this.logger.log(`${label} sent to ${to}`);
    } catch (err) {
      this.logger.error(`Failed to send ${label}: ${err}`);
    }
  }

  // ─── Bookings ───────────────────────────────────────────────────────────────

  sendGuestBookingConfirmation(data: GuestBookingConfirmationData) {
    return this.send(
      data.guestEmail,
      guestBookingConfirmationEmail(data),
      `Guest confirmation for booking ${data.bookingRef}`,
    );
  }

  sendHotelNewBookingAlert(data: HotelNewBookingAlertData) {
    return this.send(
      data.directorEmail,
      hotelNewBookingAlertEmail(data),
      `Hotel alert for booking ${data.bookingRef}`,
    );
  }

  // ─── Staff invites ──────────────────────────────────────────────────────────

  sendInviteEmail(toEmail: string, data: InviteEmailData) {
    return this.send(toEmail, inviteEmail(data), 'Invite email');
  }

  sendWelcomeEmail(toEmail: string, firstName: string) {
    return this.send(
      toEmail,
      welcomeEmail(firstName, `${this.frontendUrl}/login`),
      'Welcome email',
    );
  }

  // ─── Password reset ─────────────────────────────────────────────────────────

  sendPasswordResetEmail(toEmail: string, firstName: string, resetUrl: string) {
    return this.send(toEmail, passwordResetEmail(firstName, resetUrl), 'Password reset email');
  }

  sendPasswordChangedEmail(toEmail: string, firstName: string) {
    return this.send(
      toEmail,
      passwordChangedEmail(firstName, `${this.frontendUrl}/forgot-password`),
      'Password-changed email',
    );
  }
}