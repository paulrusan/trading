import nodemailer from 'nodemailer'

let transporter = null

function getTransporter() {
  if (transporter) return transporter

  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) {
    throw new Error('Gmail is not configured on the server.')
  }

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  })
  return transporter
}

const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = [1000, 3000]

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// A crossing only ever produces one edge (see evaluateAlert.js) - if the send fails and
// nothing retries, the alert is gone for good, silently, with no second chance next hour.
// A transient Gmail/SMTP hiccup at exactly the wrong moment is the leading suspect for
// alerts that reconstruct as "should have fired" but never emailed (see CLAUDE.md's
// "Alerts" section), so this retries a few times before actually giving up.
export async function sendAlertEmail({ to, subject, text, html, attachments }) {
  const user = process.env.GMAIL_USER
  const t = getTransporter()

  let lastErr
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      await t.sendMail({
        from: `"Trading Journal" <${user}>`,
        to,
        subject,
        text,
        html,
        attachments,
      })
      return
    } catch (err) {
      lastErr = err
      if (attempt < MAX_ATTEMPTS - 1) await sleep(RETRY_DELAY_MS[attempt])
    }
  }
  throw lastErr
}
