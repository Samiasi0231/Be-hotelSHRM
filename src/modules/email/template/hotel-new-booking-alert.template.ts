import { EmailContent, HotelNewBookingAlertData } from '../email.types';
import { esc, formatDateGB, formatNaira, pluralize } from '../email.utils';
function detailRows(rows: [string, string][]): string {
  return rows
    .map(([label, value], i, arr) => {
      const border = i < arr.length - 1 ? '1px solid #e2e8f0' : 'none';
      return `
              <tr style="${i % 2 === 0 ? 'background:#f8fafc;' : ''}">
                <td style="padding:12px 20px;border-bottom:${border};width:120px;">
                  <span style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${label}</span>
                </td>
                <td style="padding:12px 20px;border-bottom:${border};">
                  <span style="color:#0f172a;font-size:14px;font-weight:500;">${esc(value)}</span>
                </td>
              </tr>`;
    })
    .join('');
}

export function hotelNewBookingAlertEmail(data: HotelNewBookingAlertData): EmailContent {
  const checkInStr = formatDateGB(data.checkIn, 'short');
  const checkOutStr = formatDateGB(data.checkOut, 'short');
  const total = formatNaira(data.totalAmount);

  const guests =
    pluralize(data.adults, 'adult') +
    (data.children > 0 ? ` + ${pluralize(data.children, 'child', 'children')}` : '');

  const specialRequestsBlock = data.specialRequests
    ? `
        <!-- Special Requests -->
        <tr>
          <td style="padding:20px 40px 0;">
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px 20px;">
              <p style="margin:0 0 6px;color:#92400e;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">⚠️ Special Requests</p>
              <p style="margin:0;color:#78350f;font-size:14px;line-height:1.5;font-style:italic;">${esc(data.specialRequests)}</p>
            </div>
          </td>
        </tr>`
    : '';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Booking — ${esc(data.bookingRef)}</title>
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
              💰 New booking received for <strong>${esc(data.hotelName)}</strong>
            </p>
            <p style="margin:4px 0 0;color:#166534;font-size:13px;">
              Reference: <strong style="font-family:monospace;letter-spacing:1px;">${esc(data.bookingRef)}</strong> ·
              Total: <strong>${total}</strong>
            </p>
          </td>
        </tr>

        <!-- Guest Info -->
        <tr>
          <td style="padding:28px 40px 0;">
            <h2 style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:700;">👤 Guest Information</h2>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
              ${detailRows([
                ['Name', data.guestName],
                ['Email', data.guestEmail],
                ['Phone', data.guestPhone],
              ])}
            </table>
          </td>
        </tr>

        <!-- Booking Details -->
        <tr>
          <td style="padding:24px 40px 0;">
            <h2 style="margin:0 0 16px;color:#0f172a;font-size:16px;font-weight:700;">📋 Booking Details</h2>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
              ${detailRows([
                ['Room', `${data.roomType} — Room ${data.roomNumber}`],
                ['Check-in', checkInStr],
                ['Check-out', checkOutStr],
                ['Duration', pluralize(data.nights, 'night')],
                ['Guests', guests],
              ])}
              <tr style="background:#0f172a;">
                <td style="padding:14px 20px;"><span style="color:#94a3b8;font-size:13px;font-weight:600;">TOTAL PAID</span></td>
                <td style="padding:14px 20px;"><span style="color:#ffffff;font-size:18px;font-weight:700;">${total}</span></td>
              </tr>
            </table>
          </td>
        </tr>
${specialRequestsBlock}
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
              This is an automated notification for ${esc(data.hotelName)}
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return {
    subject: `🔔 New Booking ${data.bookingRef} — ${data.guestName} · ${total}`,
    html,
  };
}