import { EmailContent, GuestBookingConfirmationData } from '../email.types';
import { esc, formatDateGB, formatNaira, pluralize } from '../email.utils';

export function guestBookingConfirmationEmail(data: GuestBookingConfirmationData): EmailContent {
  const checkInStr = formatDateGB(data.checkIn, 'long');
  const checkOutStr = formatDateGB(data.checkOut, 'long');
  const total = formatNaira(data.totalAmount);

  const stayLine =
    `${pluralize(data.nights, 'night')} · ${pluralize(data.adults, 'adult')}` +
    (data.children > 0 ? ` · ${pluralize(data.children, 'child', 'children')}` : '');

  const specialRequestsRow = data.specialRequests
    ? `
              <tr>
                <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;">
                  <span style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Special Requests</span><br/>
                  <span style="color:#475569;font-size:13px;margin-top:4px;display:block;font-style:italic;">${esc(data.specialRequests)}</span>
                </td>
              </tr>`
    : '';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Booking Confirmed — ${esc(data.bookingRef)}</title>
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
            <p style="margin:0;color:#1e293b;font-size:16px;">Hi <strong>${esc(data.guestName)}</strong>,</p>
            <p style="margin:12px 0 0;color:#475569;font-size:14px;line-height:1.6;">
              Thank you for your booking at <strong>${esc(data.hotelName)}</strong>.
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
              <p style="margin:8px 0 0;color:#1e40af;font-size:28px;font-weight:700;letter-spacing:3px;font-family:monospace;">${esc(data.bookingRef)}</p>
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
                  <span style="color:#0f172a;font-size:15px;font-weight:600;margin-top:4px;display:block;">${esc(data.hotelName)}</span>
                  <span style="color:#64748b;font-size:13px;">${esc(data.hotelAddress)}, ${esc(data.hotelCity)}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0;">
                  <span style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Room</span><br/>
                  <span style="color:#0f172a;font-size:15px;font-weight:600;margin-top:4px;display:block;">${esc(data.roomType)} — Room ${esc(data.roomNumber)}</span>
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
                      <td><span style="color:#64748b;font-size:13px;">${stayLine}</span></td>
                    </tr>
                  </table>
                </td>
              </tr>${specialRequestsRow}
              <tr style="background:#0f172a;">
                <td style="padding:16px 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td><span style="color:#94a3b8;font-size:14px;">Total Amount Paid</span></td>
                      <td align="right"><span style="color:#ffffff;font-size:20px;font-weight:700;">${total}</span></td>
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
                  <span style="color:#0f172a;font-size:14px;font-weight:500;margin-left:10px;">${esc(data.hotelPhone)}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:14px 20px;">
                  <span style="font-size:20px;">✉️</span>
                  <span style="color:#1e40af;font-size:14px;font-weight:500;margin-left:10px;">${esc(data.hotelEmail)}</span>
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
                Your booking is awaiting confirmation from ${esc(data.hotelName)}.
                Payment has been processed successfully. The hotel will contact you
                at <strong>${esc(data.guestEmail)}</strong> within 24 hours.
              </p>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 40px;text-align:center;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">
              This booking was made via <strong style="color:#475569;">HotelMS</strong> ·
              If you did not make this booking, please contact ${esc(data.hotelEmail)}
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return {
    subject: `✅ Booking Confirmed — ${data.bookingRef} | ${data.hotelName}`,
    html,
  };
}