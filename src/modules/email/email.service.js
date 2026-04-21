import nodemailer from 'nodemailer';
import 'dotenv/config';

// Create reusable transporter
const createTransporter = () => {
  // Check if email is configured
  const isConfigured = 
    process.env.EMAIL_USER && 
    process.env.EMAIL_PASS && 
    process.env.EMAIL_USER !== 'your-email@gmail.com' &&
    process.env.EMAIL_PASS !== 'your-app-password';

  if (!isConfigured) {
    console.warn('⚠️  Email not configured. OTPs will be shown in console and API response.');
    return null;
  }

  // For development, you can use Gmail or other SMTP service
  // For Gmail: Enable 2FA and create an App Password
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

// Send email verification OTP
export const sendVerificationEmail = async (email, otp, userName = 'User') => {
  const transporter = createTransporter();

  // If email not configured, log to console and return success with OTP
  if (!transporter) {
    console.log('\n📧 ============================================');
    console.log('📧 VERIFICATION EMAIL (Console Mode)');
    console.log('📧 ============================================');
    console.log(`📧 To: ${email}`);
    console.log(`📧 User: ${userName}`);
    console.log(`📧 OTP Code: ${otp}`);
    console.log('📧 Expires: 10 minutes');
    console.log('📧 ============================================\n');
    return { success: true, messageId: 'console-mode' }; // console/dev mode
  }

  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"EduKid" <noreply@edukid.com>',
      to: email,
      subject: 'Verify Your Email - EduKid',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .otp-box { background: white; border: 2px solid #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
            .otp-code { font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #667eea; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🦉 EduKid</h1>
              <p>Email Verification</p>
            </div>
            <div class="content">
              <h2>Hello ${userName}!</h2>
              <p>Thank you for signing up with EduKid. To complete your registration, please verify your email address using the code below:</p>
              
              <div class="otp-box">
                <p style="margin: 0; color: #666; font-size: 14px;">Your Verification Code</p>
                <p class="otp-code">${otp}</p>
              </div>
              
              <p><strong>This code will expire in 10 minutes.</strong></p>
              <p>If you didn't request this code, please ignore this email.</p>
              
              <div class="footer">
                <p>© ${new Date().getFullYear()} EduKid. All rights reserved.</p>
                <p>This is an automated email, please do not reply.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hello ${userName}!\n\nThank you for signing up with EduKid. Your verification code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, please ignore this email.`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Verification email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending verification email:', error);
    throw new Error('Failed to send verification email');
  }
};

// Send password reset OTP
export const sendPasswordResetEmail = async (email, otp, userName = 'User') => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || '"EduKid" <noreply@edukid.com>',
      to: email,
      subject: 'Password Reset Code - EduKid',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .otp-box { background: white; border: 2px solid #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
            .otp-code { font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #667eea; }
            .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🦉 EduKid</h1>
              <p>Password Reset Request</p>
            </div>
            <div class="content">
              <h2>Hello ${userName}!</h2>
              <p>We received a request to reset your password. Use the code below to proceed:</p>
              
              <div class="otp-box">
                <p style="margin: 0; color: #666; font-size: 14px;">Your Reset Code</p>
                <p class="otp-code">${otp}</p>
              </div>
              
              <div class="warning">
                <strong>⚠️ Security Notice:</strong> This code will expire in 10 minutes. If you didn't request a password reset, please ignore this email and ensure your account is secure.
              </div>
              
              <div class="footer">
                <p>© ${new Date().getFullYear()} EduKid. All rights reserved.</p>
                <p>This is an automated email, please do not reply.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hello ${userName}!\n\nWe received a request to reset your password. Your reset code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request a password reset, please ignore this email.`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw new Error('Failed to send password reset email');
  }
};

// Test email configuration
export const testEmailConfig = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('Email server is ready to send messages');
    return true;
  } catch (error) {
    console.error('Email configuration error:', error);
    return false;
  }
};



