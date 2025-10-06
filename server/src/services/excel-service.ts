import * as XLSX from "xlsx";
import logger from "../utils/logger";
import { AppError } from "../types/global-interface";

export interface ExcelParseResult {
  serialNumbers: string[];
  totalRows: number;
  validSerialNumbers: number;
  invalidSerialNumbers: string[];
  fileName: string;
}

export class ExcelService {
  private static instance: ExcelService;

  public static getInstance(): ExcelService {
    if (!ExcelService.instance) {
      ExcelService.instance = new ExcelService();
    }
    return ExcelService.instance;
  }

  public async parseExcelFile(
    file: Express.Multer.File,
    columnName?: string
  ): Promise<ExcelParseResult> {
    try {
      logger.info("Starting Excel file parsing", {
        action: "excel_parse_start",
        fileName: file.originalname,
        fileSize: file.size,
        columnName,
      });

      const workbook = XLSX.read(file.buffer, {
        type: "buffer",
        cellDates: true,
        cellNF: false,
        cellText: false,
      });

      // Get the first worksheet
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        throw new AppError(
          "No worksheets found in Excel file",
          400,
          "EXCEL_NO_SHEETS"
        );
      }

      const worksheet = workbook.Sheets[sheetName];

      // Convert to JSON with header row
      const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, {
        header: 1, // Use first row as headers
        defval: "",
        raw: false, // Get formatted values as strings
      });

      if (jsonData.length < 2) {
        throw new AppError(
          "Excel file must contain at least a header row and one data row",
          400,
          "EXCEL_INSUFFICIENT_DATA"
        );
      }

      const result = this.extractSerialNumbers(
        jsonData,
        columnName,
        file.originalname
      );

      logger.excelProcessed(file.originalname, result.validSerialNumbers);

      return result;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error("Failed to parse Excel file", error as Error, {
        fileName: file.originalname,
      });

      throw new AppError(
        `Failed to parse Excel file: ${(error as Error).message}`,
        400,
        "EXCEL_PARSE_ERROR"
      );
    }
  }

  private extractSerialNumbers(
    data: any[][],
    columnName?: string,
    fileName?: string
  ): ExcelParseResult {
    const headers = data[0];
    const rows = data.slice(1);

    // Find the column index for serial numbers
    const columnIndex = this.findSerialNumberColumn(headers, columnName);

    const serialNumbers: string[] = [];
    const invalidSerialNumbers: string[] = [];

    // Extract serial numbers from the identified column
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cellValue = row[columnIndex];

      if (cellValue === undefined || cellValue === null || cellValue === "") {
        continue; // Skip empty cells
      }

      const serialNumber = this.cleanSerialNumber(cellValue);

      if (this.isValidSerialNumber(serialNumber)) {
        serialNumbers.push(serialNumber);
      } else {
        invalidSerialNumbers.push(`Row ${i + 2}: ${cellValue}`); // +2 for header and 0-based index
      }
    }

    if (serialNumbers.length === 0) {
      throw new AppError(
        "No valid serial numbers found in the specified column",
        400,
        "EXCEL_NO_VALID_SERIALS"
      );
    }

    return {
      serialNumbers: [...new Set(serialNumbers)], // Remove duplicates
      totalRows: rows.length,
      validSerialNumbers: serialNumbers.length,
      invalidSerialNumbers,
      fileName: fileName || "unknown",
    };
  }

  private findSerialNumberColumn(headers: any[], columnName?: string): number {
    // If specific column name provided, look for it
    if (columnName) {
      const index = headers.findIndex(
        (header) =>
          header &&
          header.toString().toLowerCase().trim() ===
            columnName.toLowerCase().trim()
      );

      if (index === -1) {
        throw new AppError(
          `Column "${columnName}" not found in Excel file. Available columns: ${headers.join(
            ", "
          )}`,
          400,
          "EXCEL_COLUMN_NOT_FOUND"
        );
      }

      return index;
    }

    // Auto-detect serial number column by common names
    const commonSerialColumnNames = [
      "serial number",
      "serialnumber",
      "serial_number",
      "serial",
      "application number",
      "application_number",
      "applicationnumber",
      "app number",
      "app_number",
      "appnumber",
      "trademark serial",
      "tm serial",
      "uspto serial",
      "registration number",
    ];

    for (const commonName of commonSerialColumnNames) {
      const index = headers.findIndex(
        (header) =>
          header && header.toString().toLowerCase().trim() === commonName
      );

      if (index !== -1) {
        logger.info("Auto-detected serial number column", {
          action: "column_auto_detect",
          columnName: headers[index],
          columnIndex: index,
        });
        return index;
      }
    }

    // If no common names found, look for columns that might contain serial numbers
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      if (header && typeof header === "string") {
        const headerLower = header.toLowerCase();
        if (headerLower.includes("serial") || headerLower.includes("number")) {
          logger.info("Guessed serial number column", {
            action: "column_guess",
            columnName: header,
            columnIndex: i,
          });
          return i;
        }
      }
    }

    // Default to first column if nothing else matches
    if (headers.length > 0) {
      logger.warn("Using first column as default for serial numbers", {
        action: "column_default",
        columnName: headers[0],
        availableColumns: headers,
      });
      return 0;
    }

    throw new AppError(
      "Unable to determine which column contains serial numbers",
      400,
      "EXCEL_NO_SERIAL_COLUMN"
    );
  }

  private cleanSerialNumber(value: any): string {
    if (value === undefined || value === null) {
      return "";
    }

    let cleaned = value.toString().trim();

    // Remove common prefixes/suffixes
    cleaned = cleaned.replace(
      /^(app|application|serial|reg|registration)[\s#:-]*/i,
      ""
    );
    cleaned = cleaned.replace(/[\s#:-]*$/i, "");

    // Remove non-digit characters (except for letters that might be part of the number)
    cleaned = cleaned.replace(/[^\w]/g, "");

    // If it's all digits, keep as is. If mixed, might be valid format
    return cleaned;
  }

  private isValidSerialNumber(serialNumber: string): boolean {
    if (!serialNumber || serialNumber.length === 0) {
      return false;
    }

    // USPTO serial numbers are typically numeric and 6-10 digits
    // But some older ones might have different formats
    const numericRegex = /^\d{6,10}$/;
    const alphanumericRegex = /^[0-9A-Z]{6,12}$/i;

    return (
      numericRegex.test(serialNumber) || alphanumericRegex.test(serialNumber)
    );
  }

  public generateResultsExcel(
    results: any[],
    originalFileName: string
  ): { buffer: Buffer; fileName: string } {
    try {
      logger.info("Generating results Excel file", {
        action: "excel_generate_start",
        recordCount: results.length,
        originalFileName,
      });

      // Prepare data for Excel
       const excelData = results.map((result) => ({
      "Serial Number": result.serialNumber,
      Mark: result.markText || "N/A",
      "Owner Name": result.ownerName || "N/A",
      "Owner Phone": result.ownerPhone || "N/A",
      "Owner Email": result.ownerEmail || "N/A",
      "Filing Date": result.filingDate || "N/A",
      "Date of Abandon": result.abandonDate || "N/A",
      "Abandon Reason": result.abandonReason || "N/A",
      "Self-Filed": "YES", // ✅ ADD: All results are self-filed
      Status: result.status,
      "Error Message": result.errorMessage || "",
    }));

     const summaryData = {
      "Serial Number": "SUMMARY",
      Mark: "",
      "Owner Name": `Total Self-Filed Records: ${results.length}`,
      "Owner Phone": "",
      "Owner Email": `Success: ${results.filter(r => r.status === "success").length}`,
      "Filing Date": "",
      "Date of Abandon": "",
      "Abandon Reason": "",
      "Self-Filed": "",
      Status: "",
      "Error Message": "",
    };
        excelData.push(summaryData);

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(excelData);

      // Set column widths for better readability
     const columnWidths = [
      { wch: 15 }, // Serial Number
      { wch: 20 }, // Mark Text
      { wch: 30 }, // Owner Name
      { wch: 15 }, // Owner Phone
      { wch: 30 }, // Owner Email
      { wch: 12 }, // Filing Date
      { wch: 12 }, // Abandon Date
      { wch: 50 }, // Abandon Reason
      { wch: 10 }, // Self-Filed
      { wch: 10 }, // Status
      { wch: 30 }, // Error Message
    ];

      worksheet["!cols"] = columnWidths;

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, "USPTO Results");

      // Generate buffer
      const buffer = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
      });

      // Generate output filename
      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:.]/g, "-");
      const baseName = originalFileName.replace(/\.[^/.]+$/, "");
      const fileName = `${baseName}_results_${timestamp}.xlsx`;

      logger.info("Successfully generated results Excel file", {
        action: "excel_generate_complete",
        fileName,
        fileSize: buffer.length,
      });

      return { buffer: Buffer.from(buffer), fileName };
    } catch (error) {
      logger.error("Failed to generate Excel file", error as Error);
      throw new AppError(
        `Failed to generate results Excel file: ${(error as Error).message}`,
        500,
        "EXCEL_GENERATION_ERROR"
      );
    }
  }

  public validateUploadedFile(file: Express.Multer.File): void {
    if (!file) {
      throw new AppError("No file uploaded", 400, "FILE_MISSING");
    }

    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new AppError(
        "File size too large. Maximum size is 10MB",
        400,
        "FILE_TOO_LARGE"
      );
    }

    // Check file type
    const allowedMimeTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel", // .xls
      "text/csv", // .csv (bonus support)
    ];

    const allowedExtensions = [".xlsx", ".xls", ".csv"];
    const fileExtension = file.originalname
      .toLowerCase()
      .substring(file.originalname.lastIndexOf("."));

    if (
      !allowedMimeTypes.includes(file.mimetype) &&
      !allowedExtensions.includes(fileExtension)
    ) {
      throw new AppError(
        "Invalid file type. Please upload an Excel file (.xlsx, .xls) or CSV file",
        400,
        "FILE_INVALID_TYPE"
      );
    }
  }
}
