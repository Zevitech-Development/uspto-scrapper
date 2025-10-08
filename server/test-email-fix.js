require('dotenv').config();
const mongoose = require('mongoose');

async function testEmailFix() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Import services after MongoDB connection
    const { EmailService } = require('./dist/services/email-service.js');
    const config = require('./dist/config/config.js').config;

    console.log('🔧 Checking configuration...');
    const adminEmails = config.get('adminNotificationEmails');
    
    console.log('Admin emails from config:', adminEmails);
    console.log('SMTP User:', config.get('smtpUser'));
    console.log('SMTP Host:', config.get('smtpHost'));

    console.log('📧 Getting email service instance...');
    const emailService = EmailService.getInstance();

    console.log('🧪 Testing pipeline lead notification...');
    const testLeadData = {
      leadId: 'test-email-fix-' + Date.now(),
      submittedBy: 'test-user-id',
      userName: 'Test User',
      name: 'Test Lead Name',
      email: 'test@example.com',
      phone: '+1234567890',
      trademarkDetails: 'Test Trademark Details',
      abandonedSerialNo: '12345678',
      paymentPlanInterest: true,
      comments: 'Test email fix verification',
      submittedDate: new Date()
    };

    console.log('📤 Sending test email...');
    const result = await emailService.sendPipelineLeadNotification(testLeadData);
    
    if (result) {
      console.log('✅ Email sent successfully!');
    } else {
      console.log('❌ Email sending failed');
    }

    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    console.log('🎉 Test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    
    try {
      await mongoose.disconnect();
    } catch (disconnectError) {
      console.error('Failed to disconnect:', disconnectError.message);
    }
    
    process.exit(1);
  }
}

testEmailFix();