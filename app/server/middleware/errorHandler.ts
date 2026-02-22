import { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = "AppError";
  }
}

export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  const parsed = parseSolanaError(err.message);
  const statusCode = err instanceof AppError ? err.statusCode : parsed.status;
  res.status(statusCode).json({
    success: false,
    error: parsed.message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

function parseSolanaError(msg: string): { message: string; status: number } {
  if (msg.includes("already in use") || msg.includes("0x0")) {
    return { message: "This wallet has already voted in this poll.", status: 409 };
  }
  if (msg.includes("AccountNotFound") || msg.includes("Account does not exist")) {
    return { message: "Poll not found. Check the Poll ID.", status: 404 };
  }
  if (msg.includes("insufficient funds") || msg.includes("Insufficient")) {
    return { message: "Insufficient SOL balance for this transaction.", status: 402 };
  }
  if (msg.includes("PollClosed")) {
    return { message: "This poll is closed and no longer accepting votes.", status: 403 };
  }
  if (msg.includes("InvalidCandidate")) {
    return { message: "Invalid candidate index.", status: 400 };
  }
  if (msg.includes("Unauthorized")) {
    return { message: "Only the poll admin can perform this action.", status: 403 };
  }
  if (msg.includes("TooFewCandidates")) {
    return { message: "Poll must have at least 2 candidates.", status: 400 };
  }
  if (msg.includes("TooManyCandidates")) {
    return { message: "Poll cannot have more than 10 candidates.", status: 400 };
  }
  if (msg.includes("TitleTooLong")) {
    return { message: "Title must be 100 characters or less.", status: 400 };
  }
  if (msg.includes("ADMIN_PRIVATE_KEY not configured")) {
    return { message: "Admin key not configured on server.", status: 501 };
  }
  return { message: msg.length > 300 ? msg.slice(0, 300) + "..." : msg, status: 500 };
}

export function validatePublicKey(address: string): boolean {
  try {
    const { PublicKey } = require("@solana/web3.js");
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

export const validateCreatePoll = (req: Request, res: Response, next: NextFunction) => {
  const { pollId, title, candidates } = req.body;
  if (!pollId || isNaN(Number(pollId)) || Number(pollId) <= 0)
    return res.status(400).json({ success: false, error: "pollId must be a positive number." });
  if (!title || typeof title !== "string" || title.trim().length === 0)
    return res.status(400).json({ success: false, error: "title is required." });
  if (title.length > 100)
    return res.status(400).json({ success: false, error: "title must be 100 characters or less." });
  if (!Array.isArray(candidates) || candidates.length < 2)
    return res.status(400).json({ success: false, error: "At least 2 candidates are required." });
  if (candidates.length > 10)
    return res.status(400).json({ success: false, error: "Maximum 10 candidates allowed." });
  for (const c of candidates) {
    if (typeof c !== "string" || c.trim().length === 0)
      return res.status(400).json({ success: false, error: "Each candidate must be a non-empty string." });
    if (c.length > 50)
      return res.status(400).json({ success: false, error: "Candidate names must be 50 characters or less." });
  }
  next();
};

export const validateVote = (req: Request, res: Response, next: NextFunction) => {
  const { pollId, candidateIndex, voterAddress } = req.body;
  if (!pollId || isNaN(Number(pollId)) || Number(pollId) <= 0)
    return res.status(400).json({ success: false, error: "pollId must be a positive number." });
  if (candidateIndex === undefined || isNaN(Number(candidateIndex)) || Number(candidateIndex) < 0)
    return res.status(400).json({ success: false, error: "candidateIndex must be a non-negative number." });
  if (!voterAddress || typeof voterAddress !== "string")
    return res.status(400).json({ success: false, error: "voterAddress is required." });
  if (!validatePublicKey(voterAddress))
    return res.status(400).json({ success: false, error: "Invalid Solana wallet address." });
  next();
};
