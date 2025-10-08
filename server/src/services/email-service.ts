import nodemailer, { Transporter } from "nodemailer";
import config from "../config/config";
import logger from "../utils/logger";
import { AppError } from "../types/global-interface";

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  private static instance: EmailService;
  private transporter: Transporter | null = null;
  private isConfigured: boolean = false;

  private constructor() {
    this.initializeTransporter();
  }

  public static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  private initializeTransporter(): void {
    try {
      const smtpUser = config.get("smtpUser");
      const smtpPassword = config.get("smtpPassword");

      if (!smtpUser || !smtpPassword) {
        logger.warn(
          "SMTP credentials not configured. Email notifications will be disabled."
        );
        this.isConfigured = false;
        return;
      }

      this.transporter = nodemailer.createTransport({
        host: config.get("smtpHost"),
        port: config.get("smtpPort"),
        secure: config.get("smtpSecure"),
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
      });

      this.isConfigured = true;
      logger.info("Email service initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize email service", error as Error);
      this.isConfigured = false;
    }
  }

  public async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.isConfigured || !this.transporter) {
      logger.warn("Email service not configured. Skipping email send.");
      return false;
    }

    const { to, subject, html, text } = options;

    try {
      const recipients = Array.isArray(to) ? to.join(", ") : to;

      const mailOptions = {
        from: `${config.get("smtpFromName")} <${config.get("smtpFromEmail")}>`,
        to: recipients,
        subject,
        html,
        text: text || this.stripHtml(html),
      };

      const info = await this.transporter.sendMail(mailOptions);

      logger.info("Email sent successfully", {
        action: "email_sent",
        to: recipients,
        subject,
        messageId: info.messageId,
      });

      return true;
    } catch (error) {
      logger.error("Failed to send email", error as Error, {
        to: Array.isArray(to) ? to.join(", ") : to,
        subject,
      });
      return false;
    }
  }

  public async sendEmailWithRetry(
    options: EmailOptions,
    maxRetries: number = 3
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const success = await this.sendEmail(options);

      if (success) {
        return true;
      }

      if (attempt < maxRetries) {
        logger.warn(
          `Email send failed. Retrying (${attempt}/${maxRetries})...`
        );
        await this.delay(2000 * attempt); // Exponential backoff
      }
    }

    logger.error(
      "Failed to send email after all retries",
      new Error("Max retries exceeded"),
      {
        to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
        subject: options.subject,
        maxRetries,
      }
    );

    return false;
  }

  public async sendPipelineLeadNotification(leadData: {
    leadId: string;
    submittedBy: string;
    userName: string;
    name: string;
    email: string;
    phone: string;
    trademarkDetails: string;
    abandonedSerialNo?: string;
    paymentPlanInterest: boolean;
    comments: string;
    sourceJobId?: string;
    submittedDate: Date;
  }): Promise<boolean> {
    const adminEmails = config.get("adminNotificationEmails");

    if (adminEmails.length === 0) {
      logger.warn("No admin emails configured for pipeline notifications");
      return false;
    }

    const frontendUrl = config.get("frontendUrl");
    const pipelineUrl = `${frontendUrl}/dashboard/admin/pipeline`;

    const subject = `🎯 New Lead Added to Pipeline by ${leadData.userName}`;

    const html = this.generatePipelineEmailTemplate(leadData, pipelineUrl);
    const text = this.generatePipelineEmailText(leadData);

    return this.sendEmailWithRetry({
      to: adminEmails,
      subject,
      html,
      text,
    });
  }

  private generatePipelineEmailTemplate(
    leadData: {
      leadId: string;
      submittedBy: string;
      userName: string;
      name: string;
      email: string;
      phone: string;
      trademarkDetails: string;
      abandonedSerialNo?: string;
      paymentPlanInterest: boolean;
      comments: string;
      sourceJobId?: string;
      submittedDate: Date;
    },
    pipelineUrl: string
  ): string {
    const formattedDate = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(leadData.submittedDate));

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Pipeline Lead</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: bold;">
                🎯 New Lead Added to Pipeline
              </h1>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 30px;">
              
              <!-- Intro -->
              <p style="margin: 0 0 20px; font-size: 16px; color: #333333; line-height: 1.5;">
                <strong>${
                  leadData.userName
                }</strong> has added a new lead to the pipeline.
              </p>
              
              <!-- Divider -->
              <div style="border-top: 2px solid #667eea; margin: 20px 0;"></div>
              
              <!-- Lead Details -->
              <h2 style="margin: 0 0 15px; font-size: 18px; color: #667eea;">
                📋 Lead Information
              </h2>
              
              <table width="100%" cellpadding="8" cellspacing="0" style="margin-bottom: 20px;">
                <tr>
                  <td width="140" style="color: #666666; font-size: 14px; vertical-align: top;">
                    <strong>Name:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px;">
                    ${leadData.name}
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; vertical-align: top;">
                    <strong>Email:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px;">
                    <a href="mailto:${
                      leadData.email
                    }" style="color: #667eea; text-decoration: none;">
                      ${leadData.email}
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; vertical-align: top;">
                    <strong>Phone:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px;">
                    <a href="tel:${
                      leadData.phone
                    }" style="color: #667eea; text-decoration: none;">
                      ${leadData.phone}
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="color: #666666; font-size: 14px; vertical-align: top;">
                    <strong>Trademark:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px;">
                    ${leadData.trademarkDetails}
                  </td>
                </tr>
                ${
                  leadData.abandonedSerialNo
                    ? `
                <tr>
                  <td style="color: #666666; font-size: 14px; vertical-align: top;">
                    <strong>Serial Number:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; font-family: 'Courier New', monospace;">
                    ${leadData.abandonedSerialNo}
                  </td>
                </tr>
                `
                    : ""
                }
                <tr>
                  <td style="color: #666666; font-size: 14px; vertical-align: top;">
                    <strong>Payment Plan:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px;">
                    <span style="background-color: ${
                      leadData.paymentPlanInterest ? "#10b981" : "#f59e0b"
                    }; color: #ffffff; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold;">
                      ${
                        leadData.paymentPlanInterest
                          ? "INTERESTED"
                          : "NOT INTERESTED"
                      }
                    </span>
                  </td>
                </tr>
              </table>
              
              <!-- Comments Section -->
              <h2 style="margin: 20px 0 10px; font-size: 18px; color: #667eea;">
                💬 Comments
              </h2>
              <div style="background-color: #f9fafb; border-left: 4px solid #667eea; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
                <p style="margin: 0; color: #333333; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">
${leadData.comments}
                </p>
              </div>
              
              <!-- Source Information -->
              <h2 style="margin: 20px 0 10px; font-size: 18px; color: #667eea;">
                📊 Source Information
              </h2>
              <table width="100%" cellpadding="8" cellspacing="0" style="margin-bottom: 30px;">
                <tr>
                  <td width="140" style="color: #666666; font-size: 14px;">
                    <strong>Submitted By:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px;">
                    ${leadData.userName}
                  </td>
                </tr>
                ${
                  leadData.sourceJobId
                    ? `
                <tr>
                  <td style="color: #666666; font-size: 14px;">
                    <strong>From Job:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px; font-family: 'Courier New', monospace;">
                    #${leadData.sourceJobId.slice(0, 8)}
                  </td>
                </tr>
                `
                    : ""
                }
                <tr>
                  <td style="color: #666666; font-size: 14px;">
                    <strong>Submitted:</strong>
                  </td>
                  <td style="color: #333333; font-size: 14px;">
                    ${formattedDate}
                  </td>
                </tr>
              </table>
              
              <!-- Action Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${pipelineUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 14px 30px; border-radius: 6px; font-size: 16px; font-weight: bold; display: inline-block;">
                      View Lead in Pipeline
                    </a>
                  </td>
                </tr>
              </table>
              
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #666666; font-size: 12px;">
                This is an automated notification from USPTO Pipeline System.
              </p>
              <p style="margin: 5px 0 0; color: #666666; font-size: 12px;">
                Lead ID: <span style="font-family: 'Courier New', monospace;">${leadData.leadId.slice(
                  0,
                  8
                )}</span>
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }

  private generatePipelineEmailText(leadData: {
    userName: string;
    name: string;
    email: string;
    phone: string;
    trademarkDetails: string;
    abandonedSerialNo?: string;
    paymentPlanInterest: boolean;
    comments: string;
    sourceJobId?: string;
    submittedDate: Date;
  }): string {
    const formattedDate = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(leadData.submittedDate));

    return `
NEW LEAD ADDED TO PIPELINE
===========================

${leadData.userName} has added a new lead to the pipeline.

LEAD INFORMATION
----------------
Name: ${leadData.name}
Email: ${leadData.email}
Phone: ${leadData.phone}
Trademark: ${leadData.trademarkDetails}
${
  leadData.abandonedSerialNo
    ? `Serial Number: ${leadData.abandonedSerialNo}`
    : ""
}
Payment Plan Interest: ${leadData.paymentPlanInterest ? "YES" : "NO"}

COMMENTS
--------
${leadData.comments}

SOURCE INFORMATION
------------------
Submitted By: ${leadData.userName}
${leadData.sourceJobId ? `From Job: #${leadData.sourceJobId.slice(0, 8)}` : ""}
Submitted: ${formattedDate}

View this lead in your pipeline dashboard:
${config.get("frontendUrl")}/dashboard/admin/pipeline
    `;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public async verifyConnection(): Promise<boolean> {
    if (!this.isConfigured || !this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      logger.info("SMTP connection verified successfully");
      return true;
    } catch (error) {
      logger.error("SMTP connection verification failed", error as Error);
      return false;
    }
  }
}
