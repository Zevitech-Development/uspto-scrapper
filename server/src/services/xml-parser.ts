import {
  ParsedTrademarkXML,
  TrademarkData,
  TrademarkInfo,
} from "../types/global-interface";
import logger from "../utils/logger";
import xml2js from "xml2js";

export class XMLParser {
  private parser: xml2js.Parser;

  constructor() {
    this.parser = new xml2js.Parser({
      explicitArray: true,
      mergeAttrs: false,
      ignoreAttrs: false,
      trim: true,
      explicitRoot: true,
    });
  }

  public async parseTrademarkXML(
    xmlString: string,
    serialNumber: string
  ): Promise<TrademarkData> {
    try {
      const parsed: ParsedTrademarkXML = await this.parser.parseStringPromise(
        xmlString
      );
      // console.log("🔍 Parsed XML keys:", Object.keys(parsed));
      // console.log("🔍 Full parsed structure:", JSON.stringify(parsed, null, 2));

      return this.extractTrademarkData(parsed, serialNumber);
    } catch (error) {
      logger.error("Failed to parse XML", error as Error, { serialNumber });
      return this.createErrorResult(
        serialNumber,
        "Failed to parse XML response"
      );
    }
  }

  private extractTrademarkData(
    parsed: ParsedTrademarkXML,
    serialNumber: string
  ): TrademarkData {
    try {
      const trademark = this.getTrademarkInfo(parsed);

      if (!trademark) {
        return this.createErrorResult(
          serialNumber,
          "No trademark data found in response"
        );
      }

      // ✅ ADD: Check for attorney representation FIRST
      if (this.hasAttorneyRepresentation(trademark)) {
        logger.debug("Trademark has attorney representation - filtering out", {
          serialNumber,
        });

        return {
          serialNumber,
          ownerName: null,
          markText: null,
          ownerPhone: null,
          ownerEmail: null,
          attorneyName: this.extractAttorneyName(trademark), // Keep for logging
          abandonDate: null,
          abandonReason: null,
          filingDate: null,
          status: "has_attorney",
          errorMessage:
            "Trademark has attorney representation - not self-filed",
        };
      }

      // ✅ CONTINUE: Only process self-filed trademarks
      const result: TrademarkData = {
        serialNumber,
        ownerName: this.extractOwnerName(trademark),
        markText: this.extractMarkText(trademark),
        ownerPhone: this.extractOwnerPhone(trademark),
        ownerEmail: this.extractOwnerEmail(trademark),
        attorneyName: null, // Self-filed, no attorney
        abandonDate: this.extractAbandonDate(trademark),
        abandonReason: this.extractAbandonReason(trademark),
        filingDate: this.extractFilingDate(trademark),
        status: "success",
      };

      logger.debug("Self-filed trademark extracted successfully", {
        serialNumber,
        hasOwnerName: !!result.ownerName,
      });

      return result;
    } catch (error) {
      logger.error("Failed to extract trademark data", error as Error, {
        serialNumber,
      });
      return this.createErrorResult(
        serialNumber,
        "Failed to extract data from XML"
      );
    }
  }

  private getTrademarkInfo(parsed: ParsedTrademarkXML): TrademarkInfo | null {
    try {
      const trademarkTransaction = parsed["ns2:TrademarkTransaction"];

      if (!trademarkTransaction) {
        console.log("🔍 Available keys:", Object.keys(parsed));
        return null;
      }

      // Navigate through the structure (notice no [0] at the start!)
      const result =
        trademarkTransaction["ns2:TrademarkTransactionBody"]?.[0]?.[
          "ns2:TransactionContentBag"
        ]?.[0]?.["ns2:TransactionData"]?.[0]?.["ns2:TrademarkBag"]?.[0]?.[
          "ns2:Trademark"
        ]?.[0];

      // console.log("🔍 Final trademark result:", !!result);

      return result || null;
    } catch (error) {
      console.log("🔍 Error in getTrademarkInfo:", error);
      return null;
    }
  }

  private extractOwnerName(trademark: TrademarkInfo): string | null {
    try {
      const applicants = trademark["ns2:ApplicantBag"]?.[0]?.["ns2:Applicant"];
      if (!applicants || applicants.length === 0) return null;

      for (const applicant of applicants) {
        const contact = applicant["ns1:Contact"]?.[0];
        if (!contact) continue;

        // Try entity name first (for corporations)
        const entityName = contact["ns1:Name"]?.[0]?.["ns1:EntityName"]?.[0];
        if (entityName) return entityName;

        // Try person name (for individuals)
        const personName =
          contact["ns1:Name"]?.[0]?.["ns1:PersonName"]?.[0]?.[
            "ns1:PersonFullName"
          ]?.[0];
        if (personName) return personName;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  private extractOwnerPhone(trademark: TrademarkInfo): string | null {
    try {
      const contact =
        trademark["ns2:NationalCorrespondent"]?.[0]?.["ns1:Contact"]?.[0];
      if (!contact) return null;

      const phoneNumbers =
        contact["ns1:PhoneNumberBag"]?.[0]?.["ns1:PhoneNumber"];
      return phoneNumbers?.[0] || null;
    } catch (error) {
      return null;
    }
  }

  private extractOwnerEmail(trademark: TrademarkInfo): string | null {
    try {
      const contact =
        trademark["ns2:NationalCorrespondent"]?.[0]?.["ns1:Contact"]?.[0];
      if (!contact) return null;

      const emails =
        contact["ns1:EmailAddressBag"]?.[0]?.["ns1:EmailAddressText"];
      if (!emails || emails.length === 0) return null;

      // Look for main email first, then any email
      const mainEmail = emails.find(
        (email) =>
          typeof email === "object" &&
          email.$ &&
          email.$["ns1:emailAddressPurposeCategory"] === "Main"
      );

      if (mainEmail && typeof mainEmail === "object") {
        return mainEmail._;
      }

      // Return first email (handle both string and object formats)
      const firstEmail = emails[0];
      if (typeof firstEmail === "string") {
        return firstEmail;
      } else if (typeof firstEmail === "object" && firstEmail._) {
        return firstEmail._;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  private extractAttorneyName(trademark: TrademarkInfo): string | null {
    try {
      const attorney = trademark["ns2:RecordAttorney"]?.[0];
      if (!attorney) return null;

      return (
        attorney["ns1:Contact"]?.[0]?.["ns1:Name"]?.[0]?.[
          "ns1:PersonName"
        ]?.[0]?.["ns1:PersonFullName"]?.[0] || null
      );
    } catch (error) {
      return null;
    }
  }

  private extractAbandonDate(trademark: TrademarkInfo): string | null {
    try {
      const abandonDate =
        trademark["ns2:NationalTrademarkInformation"]?.[0]?.[
          "ns2:ApplicationAbandonedDate"
        ]?.[0];
      if (abandonDate) return this.formatDate(abandonDate);

      return null;
    } catch (error) {
      return null;
    }
  }

  private extractAbandonReason(trademark: TrademarkInfo): string | null {
    try {
      const reason =
        trademark["ns2:NationalTrademarkInformation"]?.[0]?.[
          "ns2:MarkCurrentStatusExternalDescriptionText"
        ]?.[0];
      if (reason) return reason;

      return null;
    } catch (error) {
      return null;
    }
  }

  private extractFilingDate(trademark: TrademarkInfo): string | null {
    try {
      const filingDate = trademark["ns2:ApplicationDate"]?.[0];
      if (!filingDate) return null;

      return this.formatDate(filingDate);
    } catch (error) {
      return null;
    }
  }

  private extractMarkText(trademark: TrademarkInfo): string | null {
    try {
      const markText =
        trademark["ns2:MarkRepresentation"]?.[0]?.[
          "ns2:MarkReproduction"
        ]?.[0]?.["ns2:WordMarkSpecification"]?.[0]?.[
          "ns2:MarkVerbalElementText"
        ]?.[0];
      if (markText) return markText;

      return null;
    } catch (error) {
      return null;
    }
  }

  private formatDate(dateString: string): string {
    try {
      // Handle ISO format with timezone (e.g., "2025-08-19-04:00")
      if (dateString.includes("-04:00") || dateString.includes("+")) {
        return dateString.split("-").slice(0, 3).join("-");
      }

      // Handle standard YYYY-MM-DD format
      if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return dateString;
      }

      // Try to parse as Date and format
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split("T")[0];
      }

      return dateString; // Return as-is if can't format
    } catch {
      return dateString;
    }
  }

  private createErrorResult(
    serialNumber: string,
    errorMessage: string
  ): TrademarkData {
    return {
      serialNumber,
      ownerName: null,
      ownerPhone: null,
      ownerEmail: null,
      attorneyName: null,
      abandonDate: null,
      abandonReason: null,
      filingDate: null,
      status: "error",
      errorMessage,
      markText: null,
    };
  }

  public createNotFoundResult(serialNumber: string): TrademarkData {
    return {
      serialNumber,
      ownerName: null,
      ownerPhone: null,
      ownerEmail: null,
      attorneyName: null,
      abandonDate: null,
      abandonReason: null,
      filingDate: null,
      status: "not_found",
      errorMessage: "Trademark not found",
      markText: null,
    };
  }

  private hasAttorneyRepresentation(trademark: TrademarkInfo): boolean {
    try {
      const recordAttorney = trademark["ns2:RecordAttorney"]?.[0];
      if (!recordAttorney) {
        // No attorney section at all - self-filed
        return false;
      }

      // Check if attorney name exists
      const attorneyName =
        recordAttorney["ns1:Contact"]?.[0]?.["ns1:Name"]?.[0]?.[
          "ns1:PersonName"
        ]?.[0]?.["ns1:PersonFullName"]?.[0];

      // If attorney name exists and is not empty, has representation
      if (attorneyName && attorneyName.trim().length > 0) {
        return true;
      }

      // No attorney name - self-filed
      return false;
    } catch (error) {
      // If we can't parse, assume no attorney
      return false;
    }
  }
}
