import { EmailContent, InviteEmailData } from '../email.types';
import { esc } from '../email.utils';
import { ctaButton, simpleShell } from './shell';

export function inviteEmail(data: InviteEmailData): EmailContent {
  const roleLabel = data.role.replace(/_/g, ' ').toLowerCase();
  const hotel = data.hotelName ? esc(data.hotelName) : '';

  const rows = `
        <tr>
          <td style="padding:36px 40px 8px;text-align:center;">
            <h1 style="margin:0;color:#0f172a;font-size:22px;font-weight:700;">You've been invited</h1>
            <p style="margin:12px 0 0;color:#475569;font-size:14px;line-height:1.6;">
              You've been invited to join${hotel ? ` <strong>${hotel}</strong>` : ''}
              on HotelMS as <strong>${roleLabel}</strong>.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 40px 8px;text-align:center;">
            ${ctaButton(data.inviteUrl, 'Activate your account →')}
          </td>
        </tr>

        <tr>
          <td style="padding:16px 40px 32px;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">
              This link expires in 7 days. If you weren't expecting this invite, you can ignore this email.
            </p>
          </td>
        </tr>`;

  return {
    subject: `You've been invited to HotelMS${data.hotelName ? ` — ${data.hotelName}` : ''}`,
    html: simpleShell("You've been invited to HotelMS", rows),
  };
}