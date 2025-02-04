import { LambdaFunctionURLEvent } from "aws-lambda";
import { jsPDF } from "jspdf";

const MAX_MESSAGE_LENGTH = 30;
const PDF_CONFIG = {
  x: 10,
  y: {
    message: 10,
    timestamp: 20,
  },
} as const;

interface LambdaResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded: boolean;
}

interface ErrorResponse {
  message: string;
  code: ErrorCode;
}

type ErrorCode =
  | "MISSING_PARAMETER"
  | "MESSAGE_TOO_LONG"
  | "INVALID_CHARACTERS"
  | "INTERNAL_ERROR";

class ValidationError extends Error {
  constructor(message: string, public code: ErrorCode) {
    super(message);
    this.name = "ValidationError";
  }
}

const formatTimestamp = (date: Date): string => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = Math.floor(date.getMinutes() / 10) * 10;

  return `${year}/${month}/${day} ${hour}:${minute
    .toString()
    .padStart(2, "0")} block`;
};

const validateMessage = (message: string | undefined): string => {
  if (!message) {
    throw new ValidationError(
      "Message parameter is required",
      "MISSING_PARAMETER"
    );
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError(
      `Message is too long (max ${MAX_MESSAGE_LENGTH} characters)`,
      "MESSAGE_TOO_LONG"
    );
  }

  if (message.match(/[^\x00-\x7F]/)) {
    throw new ValidationError(
      "Message must contain only ASCII characters",
      "INVALID_CHARACTERS"
    );
  }

  return sanitizeMessage(message);
};

const sanitizeMessage = (message: string): string => {
  const entities: Record<string, string> = {
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&#39;",
  };

  return message.replace(/[<>&"']/g, (char) => entities[char]);
};

const generatePdf = (message: string): Buffer => {
  const doc = new jsPDF();
  doc.text(`Message: ${message}`, PDF_CONFIG.x, PDF_CONFIG.y.message);
  doc.text(
    `Timestamp: ${formatTimestamp(new Date())}`,
    PDF_CONFIG.x,
    PDF_CONFIG.y.timestamp
  );

  return Buffer.from(doc.output("arraybuffer"));
};

const createErrorResponse = (error: Error): LambdaResponse => {
  console.error("Error:", error);

  const errorResponse: ErrorResponse = {
    message:
      error instanceof ValidationError
        ? error.message
        : "Internal server error",
    code: error instanceof ValidationError ? error.code : "INTERNAL_ERROR",
  };

  return {
    statusCode: error instanceof ValidationError ? 400 : 500,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(errorResponse),
    isBase64Encoded: false,
  };
};

export const handler = async (
  event: LambdaFunctionURLEvent
): Promise<LambdaResponse> => {
  try {
    const message = validateMessage(event.queryStringParameters?.message);
    const pdfBuffer = generatePdf(message);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
      },
      body: pdfBuffer.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (error) {
    return createErrorResponse(error as Error);
  }
};
