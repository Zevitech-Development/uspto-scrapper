require('dotenv').config();

console.log('🔍 Environment Variables Check:');
console.log('SMTP_HOST:', process.env.SMTP_HOST);
console.log('SMTP_PORT:', process.env.SMTP_PORT);
console.log('SMTP_USER:', process.env.SMTP_USER);
console.log('SMTP_PASSWORD:', process.env.SMTP_PASSWORD ? '***HIDDEN***' : 'NOT SET');
console.log('SMTP_FROM_EMAIL:', process.env.SMTP_FROM_EMAIL);
console.log('ADMIN_NOTIFICATION_EMAILS:', process.env.ADMIN_NOTIFICATION_EMAILS);

console.log('\n🔧 Config Service Check:');
try {
  const { ConfigService } = require('./dist/config/config');
  const config = ConfigService.getInstance();
  
  console.log('Admin Notification Emails:', config.get('adminNotificationEmails'));
  console.log('SMTP Host:', config.get('smtpHost'));
  console.log('SMTP Port:', config.get('smtpPort'));
  console.log('SMTP User:', config.get('smtpUser'));
  console.log('SMTP From Email:', config.get('smtpFromEmail'));
  
} catch (error) {
  console.error('❌ Error loading config:', error.message);
}

console.log('\n📧 Testing SMTP Connection:');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

transporter.verify()
  .then(() => {
    console.log('✅ SMTP connection verified successfully');
  })
  .catch((error) => {
    console.error('❌ SMTP connection failed:', error.message);
  });