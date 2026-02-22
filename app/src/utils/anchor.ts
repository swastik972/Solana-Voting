import { Program, AnchorProvider, BN, Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import idl from "../idl/solana_voting.json";

// Program ID — must match declare_id! in lib.rs
export const PROGRAM_ID = new PublicKey(
  "VoTEaXrdRwKBMmvKEPKSjMSvnM1hR7GEXW9VnPQpjy7"
);

export const NETWORK = clusterApiUrl("devnet");

export const getConnection = () => new Connection(NETWORK, "confirmed");

export const getProvider = (wallet: any) => {
  const connection = getConnection();
  return new AnchorProvider(connection, wallet, {
    preflightCommitment: "confirmed",
  });
};

export const getProgram = (wallet: any) => {
  const provider = getProvider(wallet);
  return new Program(idl as Idl, PROGRAM_ID, provider);
};

/** Derive the PDA for a poll account */
export const getPollPDA = (pollId: number) => {
  const bn = new BN(pollId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("poll"), bn.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );
};

/** Derive the PDA for a vote record account */
export const getVoteRecordPDA = (pollId: number, voter: PublicKey) => {
  const bn = new BN(pollId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vote"), bn.toArrayLike(Buffer, "le", 8), voter.toBuffer()],
    PROGRAM_ID
  );
};

/** Shorten a public key for display */
export const shortenAddress = (address: string, chars = 4): string => {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
};

/** Format lamports to SOL */
export const lamportsToSol = (lamports: number): string => {
  return (lamports / 1e9).toFixed(4);
};

/** Solana Explorer URL for a transaction */
export const getExplorerUrl = (signature: string): string => {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
};

/** Parse Anchor error messages */
export const parseError = (error: any): string => {
  const msg = error?.message || error?.toString() || "Unknown error";

  if (msg.includes("already in use") || msg.includes("0x0")) {
    return "You have already voted in this poll!";
  }
  if (msg.includes("AccountNotFound") || msg.includes("Account does not exist")) {
    return "Poll not found. Please check the Poll ID.";
  }
  if (msg.includes("insufficient funds") || msg.includes("Insufficient")) {
    return "Insufficient SOL balance. Please airdrop some SOL on Devnet.";
  }
  if (msg.includes("PollClosed")) {
    return "This poll is closed and no longer accepting votes.";
  }
  if (msg.includes("InvalidCandidate")) {
    return "Invalid candidate selection.";
  }
  if (msg.includes("Unauthorized")) {
    return "Only the poll admin can perform this action.";
  }
  if (msg.includes("User rejected")) {
    return "Transaction was rejected by the user.";
  }

  return msg.length > 200 ? msg.slice(0, 200) + "..." : msg;
};

export interface CandidateData {
  name: string;
  votes: BN;
}

export interface PollData {
  admin: PublicKey;
  pollId: BN;
  title: string;
  candidates: CandidateData[];
  totalVotes: BN;
  isActive: boolean;
  bump: number;
}
