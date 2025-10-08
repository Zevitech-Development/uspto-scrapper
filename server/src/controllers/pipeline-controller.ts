import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middleware/auth-middleware";
import { ApiResponse, AppError } from "../types/global-interface";
import logger from "../utils/logger";
import Joi from "joi";
import { PipelineService } from "../services/pipeline-services";

export class PipelineController {
  private pipelineService: PipelineService;

  constructor() {
    this.pipelineService = PipelineService.getInstance();
  }

  // User endpoint: Create new lead
  public createLead = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError("Authentication required", 401, "NOT_AUTHENTICATED");
      }

      // Validation schema
      const schema = Joi.object({
        name: Joi.string().trim().min(2).max(100).required(),
        phone: Joi.string().trim().min(10).max(20).required(),
        email: Joi.string().email().required(),
        trademarkDetails: Joi.string().trim().min(2).max(500).required(),
        abandonedSerialNo: Joi.string().trim().optional(),
        paymentPlanInterest: Joi.boolean().required(),
        comments: Joi.string().trim().min(10).max(2000).required(),
        sourceJobId: Joi.string().optional(),
      });

      const { error, value } = schema.validate(req.body);
      if (error) {
        throw new AppError(error.details[0].message, 400, "VALIDATION_ERROR");
      }

      const lead = await this.pipelineService.createLead({
        submittedBy: req.user.id,
        submittedByName: `${req.user.firstName} ${req.user.lastName}`,
        name: value.name,
        phone: value.phone,
        email: value.email,
        trademarkDetails: value.trademarkDetails,
        abandonedSerialNo: value.abandonedSerialNo,
        paymentPlanInterest: value.paymentPlanInterest,
        comments: value.comments,
        sourceJobId: value.sourceJobId,
      });

      logger.info("Lead created successfully", {
        action: "lead_created",
        leadId: lead.leadId,
        userId: req.user.id,
      });

      const response: ApiResponse = {
        success: true,
        data: lead,
        message: "Lead added to pipeline successfully",
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  };

  // User endpoint: Get leads submitted by user
  public getMyLeads = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError("Authentication required", 401, "NOT_AUTHENTICATED");
      }

      const { leads, total } = await this.pipelineService.getAllLeads({
        submittedBy: req.user.id,
        archived: false,
      });

      const response: ApiResponse = {
        success: true,
        data: { leads, total },
        message: "Leads retrieved successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  // User endpoint: Get user stats
  public getMyStats = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError("Authentication required", 401, "NOT_AUTHENTICATED");
      }

      const stats = await this.pipelineService.getUserLeadStats(req.user.id);

      const response: ApiResponse = {
        success: true,
        data: stats,
        message: "Stats retrieved successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  // Admin endpoint: Get all leads
  public getAllLeads = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const status = req.query.status as any;
      const priority = req.query.priority as any;
      const archived = req.query.archived === "true";

      const { leads, total } = await this.pipelineService.getAllLeads({
        status,
        priority,
        archived,
      });

      const response: ApiResponse = {
        success: true,
        data: { leads, total },
        message: "Leads retrieved successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  // Admin endpoint: Update lead
  public updateLead = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError("Authentication required", 401, "NOT_AUTHENTICATED");
      }

      const { leadId } = req.params;

      const lead = await this.pipelineService.updateLead(
        leadId,
        req.body,
        req.user.id,
        `${req.user.firstName} ${req.user.lastName}`
      );

      const response: ApiResponse = {
        success: true,
        data: lead,
        message: "Lead updated successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  // Admin endpoint: Delete lead
  public deleteLead = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { leadId } = req.params;

      await this.pipelineService.deleteLead(leadId);

      const response: ApiResponse = {
        success: true,
        message: "Lead deleted successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  // Admin endpoint: Archive lead
  public archiveLead = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { leadId } = req.params;

      const lead = await this.pipelineService.archiveLead(leadId);

      const response: ApiResponse = {
        success: true,
        data: lead,
        message: "Lead archived successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  // Endpoint: Get trademark by serial number
  public getTrademarkBySerial = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { serialNumber } = req.params;

      const trademark = await this.pipelineService.getTrademarkBySerial(
        serialNumber
      );

      if (!trademark) {
        const response: ApiResponse = {
          success: false,
          message: "Trademark not found for this serial number",
          error: "NOT_FOUND",
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: trademark,
        message: "Trademark data retrieved successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };

  // Admin endpoint: Get pipeline stats
  public getPipelineStats = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const stats = await this.pipelineService.getLeadStats();

      const response: ApiResponse = {
        success: true,
        data: stats,
        message: "Pipeline statistics retrieved successfully",
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  };
}
