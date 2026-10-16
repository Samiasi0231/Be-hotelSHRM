import { EmailContent } from '../email.types';
import { esc } from '../email.utils';
import { simpleShell } from './shell';

export function passwordChangedEmail(firstName: string, forgotPasswordUrl: string): EmailContent {
  const rows = `
        <tr>
          <td style="padding:36px 40px;text-align:center;">
            <h1 style="margin:0;color:#0f172a;font-size:22px;font-weight:700;">Your password was changed</h1>
            <p style="margin:12px 0 0;color:#475569;font-size:14px;line-height:1.6;">
              Hi ${esc(firstName)}, the password on your HotelMS account was just changed and you've been signed out on all devices.
            </p>
            <p style="margin:16px 0 0;color:#475569;font-size:14px;line-height:1.6;">
              <strong>Wasn't you?</strong> <a href="${forgotPasswordUrl}" style="color:#1e40af;">Reset your password again</a>
              and tell your hotel administrator.
            </p>
          </td>
        </tr>`;

  return {
    subject: 'Your HotelMS password was changed',
    html: simpleShell('Password changed', rows),
  };
}