// src/modules/email/templates/password-reset.template.ts
import { EmailContent } from '../email.types';
import { esc } from '../email.utils';
import { ctaButton, simpleShell } from './shell';

export function passwordResetEmail(firstName: string, resetUrl: string): EmailContent {
  const rows = `
        <tr>
          <td style="padding:36px 40px 8px;text-align:center;">
            <h1 style="margin:0;color:#0f172a;font-size:22px;font-weight:700;">Reset your password</h1>
            <p style="margin:12px 0 0;color:#475569;font-size:14px;line-height:1.6;">
              Hi ${esc(firstName)}, we received a request to reset your HotelMS password.
              Click the button below to choose a new one.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:24px 40px 8px;text-align:center;">
            ${ctaButton(resetUrl, 'Reset password →')}
          </td>
        </tr>

        <tr>
          <td style="padding:16px 40px 8px;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
              This link expires in 1 hour and can only be used once.<br/>
              If you didn't request this, ignore this email — your password won't change.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:8px 40px 32px;text-align:center;">
            <p style="margin:0;color:#cbd5e1;font-size:11px;word-break:break-all;">
              Button not working? Paste this into your browser:<br/>${resetUrl}
            </p>
          </td>
        </tr>`;

  return {
    subject: 'Reset your HotelMS password',
    html: simpleShell('Reset your password', rows),
  };
}