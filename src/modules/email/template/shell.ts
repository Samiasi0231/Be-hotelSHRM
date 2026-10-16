
export function ctaButton(href: string, label: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:0 auto;">
              <tr>
                <td style="background:#1e40af;border-radius:10px;">
                  <a href="${href}"
                     style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;">
                    ${label}
                  </a>
                </td>
              </tr>
            </table>`;
}

/** `rows` is a string of `<tr>…</tr>` blocks that sit between the header and footer. */
export function simpleShell(title: string, rows: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
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

        ${rows}

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
}