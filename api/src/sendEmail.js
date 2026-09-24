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

export async function sendAlertEmail({ to, subject, text }) {
  const user = process.env.GMAIL_USER
  const t = getTransporter()

  await t.sendMail({
    from: `"Trading Journal" <${user}>`,
    to,
    subject,
    text,
  })
}
