import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

export const config = {
  port: parseInt(process.env.SERVER_PORT || process.env.PORT || "5000", 10),
  nodeEnv: process.env.NODE_ENV || "development",

  solanaNetwork: process.env.SOLANA_NETWORK || "devnet",
  solanaRpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  programId:
    process.env.PROGRAM_ID || "65sD6MWQPZieeMfBrcbe2mgHpRkxosobzKgTCmnbqQqi",
  adminPrivateKey: process.env.ADMIN_PRIVATE_KEY || "",

  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",

  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10),
  rateLimitMaxRequests: parseInt(
    process.env.RATE_LIMIT_MAX_REQUESTS || "100",
    10
  ),
};
