function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return character;
    }
  });
}

function layout(title: string, content: string) {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;background:#101114;color:#e8e9ec;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#101114;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#18191d;border:1px solid #2b2c32;border-radius:12px;">
          <tr><td style="padding:28px 32px 10px;"><span style="font-size:18px;font-weight:700;letter-spacing:3px;color:#f1f2f4;">NEXORA</span></td></tr>
          <tr><td style="padding:8px 32px 32px;">
            <h1 style="margin:0 0 18px;font-size:24px;line-height:1.3;color:#f1f2f4;">${escapeHtml(title)}</h1>
            ${content}
          </td></tr>
          <tr><td style="padding:18px 32px;border-top:1px solid #2b2c32;color:#9699a3;font-size:12px;">Build better. Together.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function verificationEmail(verificationUrl: string) {
  const safeUrl = escapeHtml(verificationUrl);
  return {
    subject: 'Verify your NEXORA email address',
    text: `Verify your email address to secure your NEXORA account.\n\nOpen this link to verify: ${verificationUrl}\n\nIf you did not request this email, you can ignore it.`,
    html: layout(
      'Verify your email address',
      `<p style="margin:0 0 24px;color:#b8bac2;font-size:15px;line-height:1.65;">Confirm that this email belongs to you to secure your account and accept workspace invitations.</p>
       <p style="margin:0 0 24px;"><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:7px;background:#6c69e8;color:#fff;text-decoration:none;font-size:14px;font-weight:600;">Verify email address</a></p>
       <p style="margin:0;color:#9699a3;font-size:12px;line-height:1.6;">If you did not request this email, you can ignore it.</p>`,
    ),
  };
}

export function invitationEmail(
  organizationName: string,
  inviterName: string,
  role: 'ADMIN' | 'MEMBER',
  invitationUrl: string,
) {
  const safeOrganization = escapeHtml(organizationName);
  const safeInviter = escapeHtml(inviterName);
  const roleName = role.toLowerCase();
  const safeRole = escapeHtml(roleName);
  const article = roleName === 'admin' ? 'an' : 'a';
  const safeUrl = escapeHtml(invitationUrl);
  return {
    subject: `You're invited to ${organizationName} on NEXORA`,
    text: `${inviterName} invited you to join ${organizationName} on NEXORA as ${article} ${roleName}.\n\nAccept the invitation: ${invitationUrl}\n\nThis link expires in 7 days and can only be used by a verified account with the invited email address.`,
    html: layout(
      "You've been invited to a NEXORA workspace",
      `<p style="margin:0 0 18px;color:#b8bac2;font-size:15px;line-height:1.65;"><strong style="color:#f1f2f4;">${safeInviter}</strong> invited you to join <strong style="color:#f1f2f4;">${safeOrganization}</strong> as ${article} ${safeRole}.</p>
       <p style="margin:0 0 24px;"><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:7px;background:#6c69e8;color:#fff;text-decoration:none;font-size:14px;font-weight:600;">Accept invitation</a></p>
       <p style="margin:0;color:#9699a3;font-size:12px;line-height:1.6;">This invitation expires in 7 days and can only be accepted by a verified account with the invited email address.</p>`,
    ),
  };
}
