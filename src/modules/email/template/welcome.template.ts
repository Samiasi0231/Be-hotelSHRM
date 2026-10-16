import { EmailContent } from '../email.types';
import { esc } from '../email.utils';
import { ctaButton, simpleShell } from './shell';

export function welcomeEmail(firstName: string, loginUrl: string): EmailContent {
  const rows = `
        <tr>
          <td style="padding:36px 40px;text-align:center;">
            <div style="width:56px;height:56px;background:#dcfce7;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
              <span style="font-size:28px;">✅</span>
            </div>
            <h1 style="margin:0;color:#0f172a;font-size:22px;font-weight:700;">Welcome, ${esc(firstName)}!</h1>
            <p style="margin:12px 0 0;color:#475569;font-size:14px;line-height:1.6;">
              Your account is now active. You can sign in with the password you just set.
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:0 40px 36px;text-align:center;">
            ${ctaButton(loginUrl, 'Sign in →')}
          </td>
        </tr>`;

  return {
    subject: `Welcome to HotelMS, ${firstName}!`,
    html: simpleShell('Welcome to HotelMS', rows),
  };
}