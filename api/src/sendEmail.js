// SendGrid's v3 Mail Send API over plain fetch — no SDK dependency, consistent with how
// the rest of this API talks to external services (Twelve Data, Anthropic). Replaces an
// earlier Gmail SMTP (nodemailer) implementation, which broke once the sending mailbox
// turned out to be a Google Workspace account with SMTP AUTH/App Passwords blocked by
// org policy — no amount of regenerating the App Password could fix that, since the
// block is server-side. SendGrid sends over HTTPS with an API key, so it isn't subject
// to that restriction.
export async function sendAlertEmail({ to, subject, text }) {
  const apiKey = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL
  if (!apiKey || !fromEmail) {
    throw new Error('SendGrid is not configured on the server.')
  }

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: 'Trading Journal' },
      subject,
      content: [{ type: 'text/plain', value: text }],
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`SendGrid request failed (${res.status}): ${body || res.statusText}`)
  }
}
