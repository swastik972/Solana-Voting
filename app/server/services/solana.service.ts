import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { Program, AnchorProvider, BN, Idl, Wallet } from "@coral-xyz/anchor";
import bs58 from "bs58";
import { config } from "../config";
import idl from "../idl/solana_voting.json";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CandidateInfo {
  name: string;
  votes: number;
}

export interface PollInfo {
  admin: string;
  pollId: number;
  title: string;
  candidates: CandidateInfo[];
  totalVotes: number;
  isActive: boolean;
  pollAddress: string;
}

export interface VoteRecordInfo {
  voter: string;
  pollId: number;
  candidateIndex: number;
  recordAddress: string;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

const PROGRAM_ID = new PublicKey(config.programId);
const connection = new Connection(config.solanaRpcUrl, "confirmed");

function getReadOnlyProgram(): Program {
  const dummyKeypair = Keypair.generate();
  const dummyWallet = {
    publicKey: dummyKeypair.publicKey,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any) => txs,
  } as unknown as Wallet;
  const provider = new AnchorProvider(connection, dummyWallet, {
    preflightCommitment: "confirmed",
  });
  return new Program(idl as Idl, PROGRAM_ID, provider);
}

function getAdminProgram(): { program: Program; admin: Keypair } {
  if (!config.adminPrivateKey) {
    throw new Error("ADMIN_PRIVATE_KEY not configured. Set it in .env to use admin API endpoints.");
  }
  const adminKeypair = Keypair.fromSecretKey(bs58.decode(config.adminPrivateKey));
  const adminWallet = {
    publicKey: adminKeypair.publicKey,
    signTransaction: async (tx: Transaction) => { tx.partialSign(adminKeypair); return tx; },
    signAllTransactions: async (txs: Transaction[]) => { txs.forEach((tx) => tx.partialSign(adminKeypair)); return txs; },
  } as unknown as Wallet;
  const provider = new AnchorProvider(connection, adminWallet, { preflightCommitment: "confirmed" });
  const program = new Program(idl as Idl, PROGRAM_ID, provider);
  return { program, admin: adminKeypair };
}

// ─── PDAs ────────────────────────────────────────────────────────────────────

export function getPollPDA(pollId: number): [PublicKey, number] {
  const bn = new BN(pollId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("poll"), bn.toArrayLike(Buffer, "le", 8)],
    PROGRAM_ID
  );
}

export function getVoteRecordPDA(pollId: number, voter: PublicKey): [PublicKey, number] {
  const bn = new BN(pollId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vote"), bn.toArrayLike(Buffer, "le", 8), voter.toBuffer()],
    PROGRAM_ID
  );
}

// ─── Read ────────────────────────────────────────────────────────────────────

export async function fetchPoll(pollId: number): Promise<PollInfo> {
  const program = getReadOnlyProgram();
  const [pollPda] = getPollPDA(pollId);
  const acct = await program.account.poll.fetch(pollPda);
  return {
    admin: (acct.admin as PublicKey).toBase58(),
    pollId: (acct.pollId as BN).toNumber(),
    title: acct.title as string,
    candidates: (acct.candidates as any[]).map((c) => ({
      name: c.name as string,
      votes: (c.votes as BN).toNumber(),
    })),
    totalVotes: (acct.totalVotes as BN).toNumber(),
    isActive: acct.isActive as boolean,
    pollAddress: pollPda.toBase58(),
  };
}

export async function fetchAllPolls(): Promise<PollInfo[]> {
  const program = getReadOnlyProgram();
  const all = await program.account.poll.all();
  return all.map((item) => ({
    admin: (item.account.admin as PublicKey).toBase58(),
    pollId: (item.account.pollId as BN).toNumber(),
    title: item.account.title as string,
    candidates: (item.account.candidates as any[]).map((c) => ({
      name: c.name as string,
      votes: (c.votes as BN).toNumber(),
    })),
    totalVotes: (item.account.totalVotes as BN).toNumber(),
    isActive: item.account.isActive as boolean,
    pollAddress: item.publicKey.toBase58(),
  }));
}

export async function checkVoteStatus(
  pollId: number,
  voterAddress: string
): Promise<{ hasVoted: boolean; voteRecord: VoteRecordInfo | null }> {
  const program = getReadOnlyProgram();
  const voter = new PublicKey(voterAddress);
  const [voteRecordPda] = getVoteRecordPDA(pollId, voter);
  try {
    const record = await program.account.voteRecord.fetch(voteRecordPda);
    return {
      hasVoted: true,
      voteRecord: {
        voter: (record.voter as PublicKey).toBase58(),
        pollId: (record.pollId as BN).toNumber(),
        candidateIndex: record.candidateIndex as number,
        recordAddress: voteRecordPda.toBase58(),
      },
    };
  } catch {
    return { hasVoted: false, voteRecord: null };
  }
}

export async function getBalance(address: string): Promise<number> {
  const pubkey = new PublicKey(address);
  const lamports = await connection.getBalance(pubkey);
  return lamports / 1e9;
}

// ─── Write (Admin) ──────────────────────────────────────────────────────────

export async function createPoll(
  pollId: number,
  title: string,
  candidates: string[]
): Promise<{ signature: string; pollAddress: string }> {
  const { program, admin } = getAdminProgram();
  const pollIdBN = new BN(pollId);
  const [pollPda] = getPollPDA(pollId);
  const tx = await program.methods
    .createPoll(pollIdBN, title, candidates)
    .accounts({ poll: pollPda, admin: admin.publicKey, systemProgram: SystemProgram.programId })
    .signers([admin])
    .rpc();
  await connection.confirmTransaction(tx, "confirmed");
  return { signature: tx, pollAddress: pollPda.toBase58() };
}

export async function closePoll(pollId: number): Promise<{ signature: string }> {
  const { program, admin } = getAdminProgram();
  const pollIdBN = new BN(pollId);
  const [pollPda] = getPollPDA(pollId);
  const tx = await program.methods
    .closePoll(pollIdBN)
    .accounts({ poll: pollPda, admin: admin.publicKey })
    .signers([admin])
    .rpc();
  await connection.confirmTransaction(tx, "confirmed");
  return { signature: tx };
}

// ─── Vote Transaction Builder ───────────────────────────────────────────────

export async function buildVoteTransaction(
  pollId: number,
  candidateIndex: number,
  voterAddress: string
): Promise<{ transaction: string; blockhash: string }> {
  const program = getReadOnlyProgram();
  const voter = new PublicKey(voterAddress);
  const pollIdBN = new BN(pollId);
  const [pollPda] = getPollPDA(pollId);
  const [voteRecordPda] = getVoteRecordPDA(pollId, voter);

  const ix = await program.methods
    .vote(pollIdBN, candidateIndex)
    .accounts({ poll: pollPda, voteRecord: voteRecordPda, voter, systemProgram: SystemProgram.programId })
    .instruction();

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ blockhash, lastValidBlockHeight, feePayer: voter }).add(ix);
  const serialized = tx.serialize({ requireAllSignatures: false }).toString("base64");
  return { transaction: serialized, blockhash };
}

export async function submitSignedTransaction(signedTxBase64: string): Promise<{ signature: string }> {
  const txBuffer = Buffer.from(signedTxBase64, "base64");
  const signature = await connection.sendRawTransaction(txBuffer, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  await connection.confirmTransaction(signature, "confirmed");
  return { signature };
}

// ─── Utility ─────────────────────────────────────────────────────────────────

export function getExplorerUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${config.solanaNetwork}`;
}

export function getProgramId(): string {
  return PROGRAM_ID.toBase58();
}

export function getConnectionStatus() {
  return { rpcUrl: config.solanaRpcUrl, network: config.solanaNetwork, programId: PROGRAM_ID.toBase58() };
}
