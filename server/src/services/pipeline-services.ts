import { v4 as uuidv4 } from "uuid";
import {
  IPipelineLead,
  PipelineLeadCreateData,
  PipelineLeadUpdateData,
} from "../types/pipeline-interface";
import { AppError } from "../types/global-interface";
import logger from "../utils/logger";
import { EmailService } from "./email-service";
import { NotificationService } from "./notification-service";
import { Trademark } from "../models/trademark.model";
import { User } from "../models/user.model";
import { PipelineLead } from "../models/pipeline.model";

export class PipelineService {
  private static instance: PipelineService;
  private emailService: EmailService;
  private notificationService: NotificationService;

  private constructor() {
    this.emailService = EmailService.getInstance();
    this.notificationService = NotificationService.getInstance();
  }

  public static getInstance(): PipelineService {
    if (!PipelineService.instance) {
      PipelineService.instance = new PipelineService();
    }
    return PipelineService.instance;
  }

  public async createLead(
    data: PipelineLeadCreateData
  ): Promise<IPipelineLead> {
    try {
      const leadId = uuidv4();

      // Check for duplicate (same email or phone)
      const existingLead = await PipelineLead.findOne({
        $or: [{ email: data.email }, { phone: data.phone }],
        archived: false,
      });

      if (existingLead) {
        throw new AppError(
          "A lead with this email or phone already exists in the pipeline",
          409,
          "DUPLICATE_LEAD"
        );
      }

      // Create new lead
      const lead = await PipelineLead.create({
        leadId,
        submittedBy: data.submittedBy,
        submittedByName: data.submittedByName,
        sourceJobId: data.sourceJobId,
        name: data.name,
        phone: data.phone,
        email: data.email,
        trademarkDetails: data.trademarkDetails,
        abandonedSerialNo: data.abandonedSerialNo,
        paymentPlanInterest: data.paymentPlanInterest,
        comments: data.comments,
        status: "new",
        priority: "warm",
        leadScore: 5,
        emailsSent: 0,
        phoneCallsMade: 0,
        convertedToSale: false,
        activities: [
          {
            date: new Date(),
            user: data.submittedBy,
            userName: data.submittedByName,
            action: "created",
            notes: "Lead added to pipeline",
          },
        ],
      });

      logger.info("Pipeline lead created", {
        action: "pipeline_lead_created",
        leadId,
        submittedBy: data.submittedBy,
        name: data.name,
      });

      // Send notifications in background (non-blocking)
      this.sendLeadNotifications(lead).catch((error) => {
        logger.error("Failed to send lead notifications", error as Error, {
          leadId,
        });
      });

      return lead;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error("Failed to create pipeline lead", error as Error, {
        submittedBy: data.submittedBy,
      });

      throw new AppError(
        "Failed to create pipeline lead",
        500,
        "PIPELINE_CREATE_ERROR"
      );
    }
  }

  private async sendLeadNotifications(lead: IPipelineLead): Promise<void> {
    try {
      // Get all admin users
      const admins = await User.find({ role: "admin", isActive: true });

      // Create in-app notifications for each admin
      const notificationPromises = admins.map((admin) =>
        this.notificationService
          .createNotification({
            recipientId: admin._id.toString(),
            senderId: lead.submittedBy,
            jobId: lead.sourceJobId || lead.leadId,
            type: "job_assigned", // Reusing existing type
            message: `${lead.submittedByName} added a new lead to pipeline: ${lead.name}`,
          })
          .catch((error) => {
            logger.error("Failed to create notification", error as Error, {
              adminId: admin._id.toString(),
            });
          })
      );

      await Promise.all(notificationPromises);

      // Send email notification
      await this.emailService.sendPipelineLeadNotification({
        leadId: lead.leadId,
        submittedBy: lead.submittedBy,
        userName: lead.submittedByName,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        trademarkDetails: lead.trademarkDetails,
        abandonedSerialNo: lead.abandonedSerialNo,
        paymentPlanInterest: lead.paymentPlanInterest,
        comments: lead.comments,
        sourceJobId: lead.sourceJobId,
        submittedDate: lead.submittedDate,
      });

      logger.info("Lead notifications sent successfully", {
        action: "lead_notifications_sent",
        leadId: lead.leadId,
        adminCount: admins.length,
      });
    } catch (error) {
      logger.error(
        "Error sending lead notifications",
        error as Error,
        { leadId: lead.leadId }
      );
    }
  }

  public async getLeadById(leadId: string): Promise<IPipelineLead | null> {
    try {
      return await PipelineLead.findOne({ leadId });
    } catch (error) {
      logger.error("Failed to get lead by ID", error as Error, { leadId });
      return null;
    }
  }

  public async getAllLeads(options: {
    status?: IPipelineLead["status"];
    priority?: IPipelineLead["priority"];
    archived?: boolean;
    submittedBy?: string;
    limit?: number;
    skip?: number;
  } = {}): Promise<{ leads: IPipelineLead[]; total: number }> {
    try {
      const {
        status,
        priority,
        archived = false,
        submittedBy,
        limit = 100,
        skip = 0,
      } = options;

      const query: any = { archived };

      if (status) query.status = status;
      if (priority) query.priority = priority;
      if (submittedBy) query.submittedBy = submittedBy;

      const [leads, total] = await Promise.all([
        PipelineLead.find(query)
          .sort({ createdAt: -1 })
          .limit(limit)
          .skip(skip)
          .lean(),
        PipelineLead.countDocuments(query),
      ]);

      return {
        leads: leads as IPipelineLead[],
        total,
      };
    } catch (error) {
      logger.error("Failed to get leads", error as Error);
      throw new AppError(
        "Failed to retrieve leads",
        500,
        "PIPELINE_FETCH_ERROR"
      );
    }
  }

  public async updateLead(
    leadId: string,
    updates: PipelineLeadUpdateData,
    updatedBy: string,
    updatedByName: string
  ): Promise<IPipelineLead | null> {
    try {
      const lead = await PipelineLead.findOne({ leadId });

      if (!lead) {
        throw new AppError("Lead not found", 404, "LEAD_NOT_FOUND");
      }

      // Track what changed for activity log
      const changes: string[] = [];
      Object.keys(updates).forEach((key) => {
        if ((updates as any)[key] !== (lead as any)[key]) {
          changes.push(key);
        }
      });

      // Add activity log entry
      if (changes.length > 0) {
        lead.activities.push({
          date: new Date(),
          user: updatedBy,
          userName: updatedByName,
          action: "updated",
          notes: `Updated fields: ${changes.join(", ")}`,
        });
      }

      // Apply updates
      Object.assign(lead, updates);

      await lead.save();

      logger.info("Pipeline lead updated", {
        action: "pipeline_lead_updated",
        leadId,
        updatedBy,
        changes: changes.length,
      });

      return lead;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error("Failed to update lead", error as Error, { leadId });
      throw new AppError(
        "Failed to update lead",
        500,
        "PIPELINE_UPDATE_ERROR"
      );
    }
  }

  public async deleteLead(leadId: string): Promise<boolean> {
    try {
      const result = await PipelineLead.deleteOne({ leadId });

      if (result.deletedCount === 0) {
        throw new AppError("Lead not found", 404, "LEAD_NOT_FOUND");
      }

      logger.info("Pipeline lead deleted", {
        action: "pipeline_lead_deleted",
        leadId,
      });

      return true;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error("Failed to delete lead", error as Error, { leadId });
      throw new AppError(
        "Failed to delete lead",
        500,
        "PIPELINE_DELETE_ERROR"
      );
    }
  }

  public async archiveLead(leadId: string): Promise<IPipelineLead | null> {
    try {
      const lead = await PipelineLead.findOneAndUpdate(
        { leadId },
        { $set: { archived: true } },
        { new: true }
      );

      if (!lead) {
        throw new AppError("Lead not found", 404, "LEAD_NOT_FOUND");
      }

      logger.info("Pipeline lead archived", {
        action: "pipeline_lead_archived",
        leadId,
      });

      return lead;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error("Failed to archive lead", error as Error, { leadId });
      throw new AppError(
        "Failed to archive lead",
        500,
        "PIPELINE_ARCHIVE_ERROR"
      );
    }
  }

  public async getTrademarkBySerial(
    serialNumber: string
  ): Promise<any | null> {
    try {
      // Try to find in Trademark collection
      const trademark = await Trademark.findOne({ serialNumber });

      if (trademark) {
        return {
          serialNumber: trademark.serialNumber,
          name: trademark.ownerName,
          email: trademark.ownerEmail,
          phone: trademark.ownerPhone,
          trademarkDetails: trademark.markText,
          filingDate: trademark.filingDate,
          abandonDate: trademark.abandonDate,
          abandonReason: trademark.abandonReason,
        };
      }

      return null;
    } catch (error) {
      logger.error("Failed to get trademark by serial", error as Error, {
        serialNumber,
      });
      return null;
    }
  }

  public async getLeadStats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    conversionRate: number;
    totalRevenue: number;
  }> {
    try {
      const [
        total,
        statusCounts,
        priorityCounts,
        conversionStats,
      ] = await Promise.all([
        PipelineLead.countDocuments({ archived: false }),
        PipelineLead.aggregate([
          { $match: { archived: false } },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
        PipelineLead.aggregate([
          { $match: { archived: false } },
          { $group: { _id: "$priority", count: { $sum: 1 } } },
        ]),
        PipelineLead.aggregate([
          { $match: { archived: false } },
          {
            $group: {
              _id: null,
              totalLeads: { $sum: 1 },
              convertedLeads: {
                $sum: { $cond: ["$convertedToSale", 1, 0] },
              },
              totalRevenue: { $sum: "$saleAmount" },
            },
          },
        ]),
      ]);

      const byStatus: Record<string, number> = {};
      statusCounts.forEach((item: any) => {
        byStatus[item._id] = item.count;
      });

      const byPriority: Record<string, number> = {};
      priorityCounts.forEach((item: any) => {
        byPriority[item._id] = item.count;
      });

      const stats = conversionStats[0] || {
        totalLeads: 0,
        convertedLeads: 0,
        totalRevenue: 0,
      };

      const conversionRate =
        stats.totalLeads > 0
          ? (stats.convertedLeads / stats.totalLeads) * 100
          : 0;

      return {
        total,
        byStatus,
        byPriority,
        conversionRate,
        totalRevenue: stats.totalRevenue || 0,
      };
    } catch (error) {
      logger.error("Failed to get lead stats", error as Error);
      throw new AppError(
        "Failed to retrieve lead statistics",
        500,
        "PIPELINE_STATS_ERROR"
      );
    }
  }

  public async getUserLeadStats(userId: string): Promise<{
    totalSubmitted: number;
    converted: number;
    conversionRate: number;
    totalRevenue: number;
  }> {
    try {
      const stats = await PipelineLead.aggregate([
        { $match: { submittedBy: userId, archived: false } },
        {
          $group: {
            _id: null,
            totalSubmitted: { $sum: 1 },
            converted: { $sum: { $cond: ["$convertedToSale", 1, 0] } },
            totalRevenue: { $sum: "$saleAmount" },
          },
        },
      ]);

      const result = stats[0] || {
        totalSubmitted: 0,
        converted: 0,
        totalRevenue: 0,
      };

      const conversionRate =
        result.totalSubmitted > 0
          ? (result.converted / result.totalSubmitted) * 100
          : 0;

      return {
        totalSubmitted: result.totalSubmitted,
        converted: result.converted,
        conversionRate,
        totalRevenue: result.totalRevenue || 0,
      };
    } catch (error) {
      logger.error("Failed to get user lead stats", error as Error, {
        userId,
      });
      throw new AppError(
        "Failed to retrieve user statistics",
        500,
        "PIPELINE_USER_STATS_ERROR"
      );
    }
  }
}