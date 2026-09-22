// src/modules/email/email.service.ts — FULL REPLACEMENT
// sendInviteEmail and sendWelcomeEmail added for the LabOS-style invite flow.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Role } from '@prisma/client';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);
  private readonly from: string;
  private readonly appUrl: string;

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
    this.appUrl = this.config.get('APP_URL', 'http://localhost:3000');
  }

  // ─── Guest Booking Confirmation ───────────────────────────────────────────

  async sendGuestBookingConfirmation(data: {
    guestName: string;
    guestEmail: string;
    bookingRef: string;
    hotelName: string;
    hotelPhone: string;
    hotelEmail: string;
    hotelAddress: string;
    hotelCity: string;
    roomType: string;
    roomNumber: string;
    checkIn: Date;
    checkOut: Date;
    nights: number;
    adults: number;
    children: number;
    totalAmount: number;
    specialRequests?: string;
  }) {
    const checkInStr = new Date(data.checkIn).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    const checkOutStr = new Date(data.checkOut).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    const totalFormatted = `₦${Number(data.totalAmount).toLocaleString('en-NG')}`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Booking Confirmed — ${data.bookingRef}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:580px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e40af 0%,#1d4ed8 100%);padding:32px 40px;text-align:center;">
            <div style="display:inline-flex;align-items:center;gap:10px;margin-bottom:16px;">
              <div style="width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:10px;display:inline-flex;align-items:center;justify-content:center;">
                <span style="color:white;font-size:18px;">🏨</span>
              </div>
              <span style="color:white;font-weight:700;font-size:18px;">HotelMS</span>
            </div>
            <div style="width:64px;height:64px;background:rgba(255,255,255,0.15);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
              <span style="font-size:32px;">✅</span>
            </div>
            <h1 style="color:white;margin:0;font-size:26px;font-weight:700;">Booking Confirmed!</h1>
            <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:15px;">Your reservation is pending hotel confirmation</p>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:32px 40px 0;">
            <p style="margin:0;color:#1e293b;font-size:16px;">Hi <strong>${data.guestName}</strong>,</p>
            <p style="margin:12px 0 0;color:#475569;font-size:14px;line-height:1.6;">
              Thank you for your booking at <strong>${data.hotelName}</strong>. 
              Your reservation has been received and is pending confirmation. 
              The hotel team will be in touch shortly.
            </p>
          </td>
        </tr>

        <!-- Booking Reference Banner -->
        <tr>
          <td style="padding:24px 40px;">
            <div style="background:#f8fafc;border:2px dashed #cbd5e1;border-radius:12px;padding:20px;text-align:center;">
              <p style="margin:0;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;">Booking Reference</p>
              <p style="margin:8px 0 0;color:#1e40af;font-size:28px;font-weight:700;letter-spacing:3px;font-family:monospace;">${data.bookingRef}</p>
              <p style="margin:6px 0 0;color:#94a3b8;font-size:12px;">Keep this safe — you'll need it for check-in</p>
            </div>
          </td>
        </tr>

        <!-- Stay Details -->
        <tr>
          <td style="padding:0 40px 24px;">
            <h2 style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:700;">Stay Details</h2>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
              <tr style="background:#f8fafc;">
                <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;">
                  <span style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Hotel</span><br/>
                  <span style="color:#0f172a;font-size:15px;font-weight:600;margin-top:4px;display:block;">${data.hotelName}</span>
                  <span style="color:#64748b;font-size:13px;">${data.hotelAddress}, ${data.hotelCity}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;">
                  <span style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Room</span><br/>
                  <span style="color:#0f172a;font-size:15px;font-weight:600;margin-top:4px;display:block;">${data.roomType} — Room ${data.roomNumber}</span>
                </td>
              </tr>
              <tr style="background:#f0f9ff;">
                <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="50%">
                        <span style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Check-in</span><br/>
                        <span style="color:#1e40af;font-size:15px;font-weight:700;margin-top:4px;display:block;">${checkInStr}</span>
                      </td>
                      <td width="50%">
                        <span style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Check-out</span><br/>
                        <span style="color:#1e40af;font-size:15px;font-weight:700;margin-top:4px;display:block;">${checkOutStr}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td><span style="color:#64748b;font-size:13px;">${data.nights} night${data.nights !== 1 ? 's' : ''} · ${data.adults} adult${data.adults !== 1 ? 's' : ''}${data.children > 0 ? ` · ${data.children} child${data.children !== 1 ? 'ren' : ''}` : ''}</span></td>
                    </tr>
                  </table>
                </td>
              </tr>
              ${data.specialRequests ? `
              <tr>
                <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;">
                  <span style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Special Requests</span><br/>
                  <span style="color:#475569;font-size:13px;margin-top:4px;display:block;font-style:italic;">${data.specialRequests}</span>
                </td>
              </tr>
              ` : ''}
              <tr style="background:#0f172a;">
                <td style="padding:16px 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td><span style="color:#94a3b8;font-size:14px;">Total Amount Paid</span></td>
                      <td align="right"><span style="color:#ffffff;font-size:20px;font-weight:700;">${totalFormatted}</span></td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Hotel Contact -->
        <tr>
          <td style="padding:0 40px 24px;">
            <h2 style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:700;">Hotel Contact</h2>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
              <tr>
                <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;">
                  <span style="font-size:20px;">📞</span>
                  <span style="color:#0f172a;font-size:14px;font-weight:500;margin-left:10px;">${data.hotelPhone}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 20px;">
                  <span style="font-size:20px;">✉️</span>
                  <span style="color:#1e40af;font-size:14px;font-weight:500;margin-left:10px;">${data.hotelEmail}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Status info -->
        <tr>
          <td style="padding:0 40px 32px;">
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px 20px;">
              <p style="margin:0;color:#92400e;font-size:13px;line-height:1.6;">
                ⏳ <strong>Status: Pending Confirmation</strong><br/>
                Your booking is awaiting confirmation from ${data.hotelName}. 
                Payment has been processed successfully. The hotel will contact you 
                at <strong>${data.guestEmail}</strong> within 24 hours.
              </p>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 40px;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">
              This booking was made via <strong style="color:#475569;">HotelMS</strong> · 
              If you did not make this booking, please contact ${data.hotelEmail}
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: data.guestEmail,
        subject: `✅ Booking Confirmed — ${data.bookingRef} | ${data.hotelName}`,
        html,
      });
      this.logger.log(`Guest confirmation sent to ${data.guestEmail} for booking ${data.bookingRef}`);
    } catch (err) {
      this.logger.error(`Failed to send guest confirmation: ${err}`);
    }
  }

  // ─── Hotel Director New Booking Alert ────────────────────────────────────

  async sendHotelNewBookingAlert(data: {
    directorEmail: string;
    hotelName: string;
    bookingRef: string;
    guestName: string;
    guestEmail: string;
    guestPhone: string;
    roomType: string;
    roomNumber: string;
    checkIn: Date;
    checkOut: Date;
    nights: number;
    adults: number;
    children: number;
    totalAmount: number;
    specialRequests?: string;
    dashboardUrl: string;
  }) {
    const checkInStr = new Date(data.checkIn).toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
    });
    const checkOutStr = new Date(data.checkOut).toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
    });
    const totalFormatted = `₦${Number(data.totalAmount).toLocaleString('en-NG')}`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Booking — ${data.bookingRef}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:580px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:28px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="display:inline-flex;align-items:center;gap:8px;">
                    <span style="color:white;font-weight:700;font-size:16px;">🏨 HotelMS</span>
                  </div>
                  <p style="color:#94a3b8;font-size:13px;margin:4px 0 0;">Hotel Management Platform</p>
                </td>
                <td align="right">
                  <div style="background:#22c55e;color:white;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:700;">🔔 NEW BOOKING</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Alert banner -->
        <tr>
          <td style="background:#dcfce7;padding:16px 40px;border-bottom:2px solid #86efac;">
            <p style="margin:0;color:#15803d;font-size:15px;font-weight:600;">
              💰 New booking received for <strong>${data.hotelName}</strong>
            </p>
            <p style="margin:4px 0 0;color:#166534;font-size:13px;">
              Reference: <strong style="font-family:monospace;letter-spacing:1px;">${data.bookingRef}</strong> · 
              Total: <strong>${totalFormatted}</strong>
            </p>
          </td>
        </tr>

        <!-- Guest Info -->
        <tr>
          <td style="padding:28px 40px 0;">
            <h2 style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:700;">👤 Guest Information</h2>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
              ${[
                ['Name', data.guestName],
                ['Email', data.guestEmail],
                ['Phone', data.guestPhone],
              ].map(([label, value], i, arr) => `
              <tr style="${i % 2 === 0 ? 'background:#f8fafc;' : ''}">
                <td style="padding:12px 20px;border-bottom:${i < arr.length - 1 ? '1px solid #e2e8f0' : 'none'};width:120px;">
                  <span style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${label}</span>
                </td>
                <td style="padding:12px 20px;border-bottom:${i < arr.length - 1 ? '1px solid #e2e8f0' : 'none'};">
                  <span style="color:#0f172a;font-size:14px;font-weight:500;">${value}</span>
                </td>
              </tr>`).join('')}
            </table>
          </td>
        </tr>

        <!-- Booking Details -->
        <tr>
          <td style="padding:24px 40px 0;">
            <h2 style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:700;">📋 Booking Details</h2>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
              ${[
                ['Room', `${data.roomType} — Room ${data.roomNumber}`],
                ['Check-in', checkInStr],
                ['Check-out', checkOutStr],
                ['Duration', `${data.nights} night${data.nights !== 1 ? 's' : ''}`],
                ['Guests', `${data.adults} adult${data.adults !== 1 ? 's' : ''}${data.children > 0 ? ` + ${data.children} child${data.children !== 1 ? 'ren' : ''}` : ''}`],
              ].map(([label, value], i, arr) => `
              <tr style="${i % 2 === 0 ? 'background:#f8fafc;' : ''}">
                <td style="padding:12px 20px;border-bottom:${i < arr.length - 1 ? '1px solid #e2e8f0' : 'none'};width:120px;">
                  <span style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${label}</span>
                </td>
                <td style="padding:12px 20px;border-bottom:${i < arr.length - 1 ? '1px solid #e2e8f0' : 'none'};">
                  <span style="color:#0f172a;font-size:14px;font-weight:500;">${value}</span>
                </td>
              </tr>`).join('')}
              <tr style="background:#0f172a;">
                <td style="padding:14px 20px;"><span style="color:#94a3b8;font-size:13px;font-weight:600;">TOTAL PAID</span></td>
                <td style="padding:14px 20px;"><span style="color:#ffffff;font-size:18px;font-weight:700;">${totalFormatted}</span></td>
              </tr>
            </table>
          </td>
        </tr>

        ${data.specialRequests ? `
        <!-- Special Requests -->
        <tr>
          <td style="padding:20px 40px 0;">
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px 20px;">
              <p style="margin:0 0 6px;color:#92400e;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">⚠️ Special Requests</p>
              <p style="margin:0;color:#78350f;font-size:14px;line-height:1.5;font-style:italic;">${data.specialRequests}</p>
            </div>
          </td>
        </tr>
        ` : ''}

        <!-- CTA -->
        <tr>
          <td style="padding:28px 40px;">
            <p style="margin:0 0 16px;color:#475569;font-size:14px;">
              Please review and confirm this booking in your dashboard. 
              The guest is waiting for your confirmation.
            </p>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#1e40af;border-radius:10px;padding:0;">
                  <a href="${data.dashboardUrl}/bookings" 
                     style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;">
                    View Booking in Dashboard →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">
              <strong style="color:#475569;">HotelMS</strong> · Hotel Management Platform<br/>
              This is an automated notification for ${data.hotelName}
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: data.directorEmail,
        subject: `🔔 New Booking ${data.bookingRef} — ${data.guestName} · ${totalFormatted}`,
        html,
      });
      this.logger.log(`Hotel alert sent to ${data.directorEmail} for booking ${data.bookingRef}`);
    } catch (err) {
      this.logger.error(`Failed to send hotel alert: ${err}`);
    }
  }

  // ─── Invite — Staff/Admin Account Activation ──────────────────────────────
  // NEW — clean/minimal style, deliberately simpler than the booking emails
  // above. Say the word if you'd rather match the heavier template instead.

  async sendInviteEmail(
    toEmail: string,
    data: { token: string; role: Role; inviteUrl: string; hotelName?: string },
  ) {
    const roleLabel = data.role.replace('_', ' ').toLowerCase();

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You've been invited to HotelMS</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <tr>
          <td style="background:linear-gradient(135deg,#1e40af 0%,#1d4ed8 100%);padding:28px 40px;text-align:center;">
            <span style="color:white;font-weight:700;font-size:18px;">🏨 HotelMS</span>
          </td>
        </tr>

        <tr>
          <td style="padding:36px 40px 8px;text-align:center;">
            <h1 style="margin:0;color:#0f172a;font-size:22px;font-weight:700;">You've been invited</h1>
            <p style="margin:12px 0 0;color:#475569;font-size:14px;line-height:1.6;">
              You've been invited to join${data.hotelName ? ` <strong>${data.hotelName}</strong>` : ''} 
              on HotelMS as <strong>${roleLabel}</strong>.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 40px 8px;text-align:center;">
            <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
              <tr>
                <td style="background:#1e40af;border-radius:10px;">
                  <a href="${data.inviteUrl}"
                     style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;">
                    Activate your account →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:16px 40px 32px;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">
              This link expires in 7 days. If you weren't expecting this invite, you can ignore this email.
            </p>
          </td>
        </tr>

        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">
              <strong style="color:#475569;">HotelMS</strong> · Hotel Management Platform
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: toEmail,
        subject: `You've been invited to HotelMS${data.hotelName ? ` — ${data.hotelName}` : ''}`,
        html,
      });
      this.logger.log(`Invite email sent to ${toEmail}`);
    } catch (err) {
      this.logger.error(`Failed to send invite email: ${err}`);
    }
  }

  // ─── Welcome — Invite Accepted ─────────────────────────────────────────────
  // NEW — fires once an invite is accepted and the account is activated.

  async sendWelcomeEmail(toEmail: string, firstName: string) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to HotelMS</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <tr>
          <td style="background:linear-gradient(135deg,#1e40af 0%,#1d4ed8 100%);padding:28px 40px;text-align:center;">
            <span style="color:white;font-weight:700;font-size:18px;">🏨 HotelMS</span>
          </td>
        </tr>

        <tr>
          <td style="padding:36px 40px;text-align:center;">
            <div style="width:56px;height:56px;background:#dcfce7;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
              <span style="font-size:28px;">✅</span>
            </div>
            <h1 style="margin:0;color:#0f172a;font-size:22px;font-weight:700;">Welcome, ${firstName}!</h1>
            <p style="margin:12px 0 0;color:#475569;font-size:14px;line-height:1.6;">
              Your account is now active. You can sign in with the password you just set.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:0 40px 36px;text-align:center;">
            <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
              <tr>
                <td style="background:#1e40af;border-radius:10px;">
                  <a href="${this.appUrl}/login"
                     style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;">
                    Sign in →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">
              <strong style="color:#475569;">HotelMS</strong> · Hotel Management Platform
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: toEmail,
        subject: `Welcome to HotelMS, ${firstName}!`,
        html,
      });
      this.logger.log(`Welcome email sent to ${toEmail}`);
    } catch (err) {
      this.logger.error(`Failed to send welcome email: ${err}`);
    }
  }
}