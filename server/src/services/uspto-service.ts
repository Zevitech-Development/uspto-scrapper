import axios, { AxiosInstance, AxiosResponse } from "axios";
import { XMLParser } from "./xml-parser";
import config from "../config/config";
import logger from "../utils/logger";
import { TrademarkData } from "../types/global-interface";

export class USPTOService {
  private axiosInstance: AxiosInstance;
  private xmlParser: XMLParser;
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = config.get("usptoApiBaseUrl");
    this.apiKey = config.get("usptoApiKey");
    this.xmlParser = new XMLParser();

    this.axiosInstance = this.createAxiosInstance();
  }

  private createAxiosInstance(): AxiosInstance {
    const instance = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000, // 30 second timeout
      headers: {
        "USPTO-API-KEY": this.apiKey,
        "Content-Type": "application/xml",
        Accept: "application/xml",
        "User-Agent": "USPTO-TSDR-Client/1.0",
      },
    });

    // Request interceptor for logging
    instance.interceptors.request.use(
      (config) => {
        logger.debug("Making USPTO API request", {
          action: "uspto_api_request",
          url: config.url,
          method: config.method,
        });
        return config;
      },
      (error) => {
        logger.error("USPTO API request error", error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging and error handling
    instance.interceptors.response.use(
      (response) => {
        logger.debug("USPTO API response received", {
          action: "uspto_api_response",
          status: response.status,
          dataLength: response.data?.length,
        });
        return response;
      },
      (error) => {
        if (error.response) {
          logger.error("USPTO API error response", error, {
            status: error.response.status,
            statusText: error.response.statusText,
            url: error.config?.url,
          });
        } else if (error.request) {
          logger.error("USPTO API network error", error, {
            url: error.config?.url,
          });
        } else {
          logger.error("USPTO API request setup error", error);
        }
        return Promise.reject(error);
      }
    );

    return instance;
  }

  public async fetchTrademarkData(
    serialNumber: string
  ): Promise<TrademarkData> {
    const startTime = Date.now();

    try {
      // Validate serial number format
      if (!this.isValidSerialNumber(serialNumber)) {
        return this.xmlParser.createNotFoundResult(serialNumber);
      }

      const url = `/casestatus/sn${serialNumber}/info.xml`;

      logger.info("Fetching trademark data", {
        action: "fetch_trademark",
        serialNumber,
        url: `${this.baseUrl}${url}`,
      });

      const response: AxiosResponse<string> = await this.axiosInstance.get(url);
      const responseTime = Date.now() - startTime;

      // Log successful API call
      logger.usptoApiCall(serialNumber, true, responseTime);

      // Parse the XML response
      const trademarkData = await this.xmlParser.parseTrademarkXML(
        response.data,
        serialNumber
      );

      return trademarkData;
    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      // Log failed API call
      logger.usptoApiCall(serialNumber, false, responseTime);

      return this.handleApiError(error, serialNumber);
    }
  }

  private handleApiError(error: any, serialNumber: string): TrademarkData {
    if (error.response) {
      const status = error.response.status;
      const statusText = error.response.statusText;

      switch (status) {
        case 404:
          logger.debug("Trademark not found", { serialNumber, status });
          return this.xmlParser.createNotFoundResult(serialNumber);

        case 429:
          logger.warn("Rate limit exceeded", { serialNumber, status });
          return {
            serialNumber,
            ownerName: null,
            markText: null,
            ownerPhone: null,
            ownerEmail: null,
            attorneyName: null,
            abandonDate: null,
            abandonReason: null,
            filingDate: null,
            status: "error",
            errorMessage: "Rate limit exceeded. Please try again later.",
          };

        case 401:
          logger.error("API authentication failed", error, { serialNumber });
          return {
            serialNumber,
            ownerName: null,
            markText: null,
            ownerPhone: null,
            ownerEmail: null,
            attorneyName: null,
            abandonDate: null,
            abandonReason: null,
            filingDate: null,
            status: "error",
            errorMessage: "API authentication failed",
          };

        case 500:
        case 502:
        case 503:
          logger.error("USPTO server error", error, { serialNumber, status });
          return {
            serialNumber,
            ownerName: null,
            markText: null,
            ownerPhone: null,
            ownerEmail: null,
            attorneyName: null,
            abandonDate: null,
            abandonReason: null,
            filingDate: null,
            status: "error",
            errorMessage: `USPTO server error (${status}). Please try again later.`,
          };

        default:
          logger.error("Unexpected API error", error, {
            serialNumber,
            status,
            statusText,
          });
          return {
            serialNumber,
            ownerName: null,
            markText: null,
            ownerPhone: null,
            ownerEmail: null,
            attorneyName: null,
            abandonDate: null,
            abandonReason: null,
            filingDate: null,
            status: "error",
            errorMessage: `API error: ${status} ${statusText}`,
          };
      }
    } else if (error.code === "ECONNABORTED") {
      logger.warn("API request timeout", { serialNumber, timeout: 30000 });
      return {
        serialNumber,
        ownerName: null,
        markText: null,
        ownerPhone: null,
        ownerEmail: null,
        attorneyName: null,
        abandonDate: null,
        abandonReason: null,
        filingDate: null,
        status: "error",
        errorMessage: "Request timeout. Please try again.",
      };
    } else {
      logger.error("Network or unknown error", error, { serialNumber });
      return {
        serialNumber,
        ownerName: null,
        markText: null,
        ownerPhone: null,
        ownerEmail: null,
        attorneyName: null,
        abandonDate: null,
        abandonReason: null,
        filingDate: null,
        status: "error",
        errorMessage:
          "Network error. Please check your connection and try again.",
      };
    }
  }

  private isValidSerialNumber(serialNumber: string): boolean {
    // Remove any whitespace
    const cleaned = serialNumber.trim();

    // USPTO serial numbers are typically 8 digits, but can vary
    // Allow 6-10 digits for flexibility
    const serialNumberRegex = /^\d{6,10}$/;

    return serialNumberRegex.test(cleaned);
  }

  public async fetchMultipleTrademarkData(
    serialNumbers: string[],
    onProgress?: (processed: number, total: number) => void
  ): Promise<{
    results: TrademarkData[];
    stats: {
      totalFetched: number;
      selfFiled: number;
      hadAttorney: number;
    };
  }> {
    const results: TrademarkData[] = [];
    const total = serialNumbers.length;

    logger.info("Starting batch trademark fetch", {
      action: "batch_fetch_start",
      totalRecords: total,
    });

    for (let i = 0; i < serialNumbers.length; i++) {
      const serialNumber = serialNumbers[i];

      try {
        const result = await this.fetchTrademarkData(serialNumber);
        results.push(result);

        if (onProgress) {
          onProgress(i + 1, total);
        }

        if (i < serialNumbers.length - 1) {
          await this.waitForRateLimit();
        }
      } catch (error) {
        logger.error("Error in batch fetch", error as Error, {
          serialNumber,
          position: i + 1,
          total,
        });

        results.push({
          serialNumber,
          ownerName: null,
          markText: null,
          ownerPhone: null,
          ownerEmail: null,
          attorneyName: null,
          abandonDate: null,
          abandonReason: null,
          filingDate: null,
          status: "error",
          errorMessage: "Unexpected error during processing",
        });
      }
    }

    // ✅ Calculate statistics BEFORE filtering
    const totalFetched = results.length;
    const hadAttorney = results.filter(
      (r) => r.status === "has_attorney"
    ).length;
    const selfFiledResults = results.filter((r) => r.status !== "has_attorney");

    const successCount = selfFiledResults.filter(
      (r) => r.status === "success"
    ).length;
    const errorCount = selfFiledResults.filter(
      (r) => r.status === "error"
    ).length;
    const notFoundCount = selfFiledResults.filter(
      (r) => r.status === "not_found"
    ).length;

    logger.info("Completed batch trademark fetch", {
      action: "batch_fetch_complete",
      totalRecords: total,
      totalFetched,
      selfFiled: selfFiledResults.length,
      hadAttorney,
      successCount,
      errorCount,
      notFoundCount,
    });

    // ✅ Return filtered results WITH stats
    return {
      results: selfFiledResults,
      stats: {
        totalFetched,
        selfFiled: selfFiledResults.length,
        hadAttorney,
      },
    };
  }

  private async waitForRateLimit(): Promise<void> {
    const rateLimitPerMinute = config.get("usptoRateLimitPerMinute");
    const delayMs = Math.ceil(60000 / rateLimitPerMinute); // Convert to milliseconds per request

    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  public async healthCheck(): Promise<{
    status: "ok" | "error";
    message: string;
  }> {
    try {
      // Use a known test serial number or make a simple request
      const testSerialNumber = "88000001"; // Example test number
      const url = `/casestatus/sn${testSerialNumber}/info.xml`;

      await this.axiosInstance.get(url);

      return { status: "ok", message: "USPTO API is accessible" };
    } catch (error: any) {
      if (error.response?.status === 404) {
        // 404 is expected for test number, means API is working
        return { status: "ok", message: "USPTO API is accessible" };
      } else if (error.response?.status === 401) {
        return {
          status: "error",
          message: "API authentication failed - check API key",
        };
      } else {
        return {
          status: "error",
          message: `USPTO API error: ${error.message}`,
        };
      }
    }
  }

  public getRateLimitInfo(): {
    requestsPerMinute: number;
    delayBetweenRequests: number;
    estimatedTimeFor100Records: number;
  } {
    const rateLimitPerMinute = config.get("usptoRateLimitPerMinute");
    const delayBetweenRequests = Math.ceil(60000 / rateLimitPerMinute);
    const estimatedTimeFor100Records = Math.ceil(
      (100 * delayBetweenRequests) / 1000
    );

    return {
      requestsPerMinute: rateLimitPerMinute,
      delayBetweenRequests,
      estimatedTimeFor100Records,
    };
  }
}
