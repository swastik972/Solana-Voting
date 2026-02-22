import { Router, Request, Response } from "express";
import {
  fetchPoll,
  fetchAllPolls,
  checkVoteStatus,
  getBalance,
  createPoll,
  closePoll,
  buildVoteTransaction,
  submitSignedTransaction,
  getExplorerUrl,
  getConnectionStatus,
  getProgramId,
} from "../services/solana.service";
import {
  asyncHandler,
  AppError,
  validateCreatePoll,
  validateVote,
  validatePublicKey,
} from "../middleware/errorHandler";

const router = Router();

// ─── Health & Info ───────────────────────────────────────────────────────────

router.get("/health", (_req: Request, res: Response) => {
  res.json({
    success: true,
    status: "ok",
    timestamp: new Date().toISOString(),
    ...getConnectionStatus(),
  });
});

router.get("/info", (_req: Request, res: Response) => {
  res.json({ success: true, data: { programId: getProgramId(), ...getConnectionStatus() } });
});

// ─── Polls ───────────────────────────────────────────────────────────────────

router.get(
  "/polls",
  asyncHandler(async (_req, res) => {
    const polls = await fetchAllPolls();
    res.json({ success: true, count: polls.length, data: polls });
  })
);

router.get(
  "/polls/:pollId",
  asyncHandler(async (req, res) => {
    const pollId = parseInt(req.params.pollId, 10);
    if (isNaN(pollId) || pollId <= 0) throw new AppError("Invalid poll ID.", 400);
    const poll = await fetchPoll(pollId);
    res.json({ success: true, data: poll });
  })
);

router.post(
  "/polls",
  validateCreatePoll,
  asyncHandler(async (req, res) => {
    const { pollId, title, candidates } = req.body;
    const result = await createPoll(Number(pollId), title.trim(), candidates.map((c: string) => c.trim()));
    res.status(201).json({
      success: true,
      message: `Poll "${title}" created successfully.`,
      data: { ...result, explorerUrl: getExplorerUrl(result.signature) },
    });
  })
);

router.patch(
  "/polls/:pollId/close",
  asyncHandler(async (req, res) => {
    const pollId = parseInt(req.params.pollId, 10);
    if (isNaN(pollId) || pollId <= 0) throw new AppError("Invalid poll ID.", 400);
    const result = await closePoll(pollId);
    res.json({
      success: true,
      message: "Poll closed successfully.",
      data: { ...result, explorerUrl: getExplorerUrl(result.signature) },
    });
  })
);

router.get(
  "/polls/:pollId/results",
  asyncHandler(async (req, res) => {
    const pollId = parseInt(req.params.pollId, 10);
    if (isNaN(pollId) || pollId <= 0) throw new AppError("Invalid poll ID.", 400);
    const poll = await fetchPoll(pollId);
    const ranked = [...poll.candidates]
      .sort((a, b) => b.votes - a.votes)
      .map((c, i) => ({
        rank: i + 1,
        name: c.name,
        votes: c.votes,
        percentage: poll.totalVotes > 0 ? ((c.votes / poll.totalVotes) * 100).toFixed(1) : "0.0",
      }));
    res.json({
      success: true,
      data: {
        pollId: poll.pollId,
        title: poll.title,
        isActive: poll.isActive,
        totalVotes: poll.totalVotes,
        results: ranked,
        winner: poll.totalVotes > 0 ? ranked[0] : null,
      },
    });
  })
);

// ─── Voting ──────────────────────────────────────────────────────────────────

router.post(
  "/vote/build",
  validateVote,
  asyncHandler(async (req, res) => {
    const { pollId, candidateIndex, voterAddress } = req.body;
    const { hasVoted } = await checkVoteStatus(Number(pollId), voterAddress);
    if (hasVoted) throw new AppError("This wallet has already voted in this poll.", 409);
    const result = await buildVoteTransaction(Number(pollId), Number(candidateIndex), voterAddress);
    res.json({ success: true, message: "Transaction built. Sign with your wallet and submit.", data: result });
  })
);

router.post(
  "/vote/submit",
  asyncHandler(async (req, res) => {
    const { signedTransaction } = req.body;
    if (!signedTransaction || typeof signedTransaction !== "string")
      throw new AppError("signedTransaction (base64) is required.", 400);
    const result = await submitSignedTransaction(signedTransaction);
    res.json({
      success: true,
      message: "Vote submitted and confirmed!",
      data: { ...result, explorerUrl: getExplorerUrl(result.signature) },
    });
  })
);

router.get(
  "/vote/status/:pollId/:voterAddress",
  asyncHandler(async (req, res) => {
    const pollId = parseInt(req.params.pollId, 10);
    const voterAddress = req.params.voterAddress;
    if (isNaN(pollId) || pollId <= 0) throw new AppError("Invalid poll ID.", 400);
    if (!validatePublicKey(voterAddress)) throw new AppError("Invalid Solana wallet address.", 400);
    const result = await checkVoteStatus(pollId, voterAddress);
    res.json({ success: true, data: result });
  })
);

// ─── Wallet ──────────────────────────────────────────────────────────────────

router.get(
  "/wallet/:address/balance",
  asyncHandler(async (req, res) => {
    const { address } = req.params;
    if (!validatePublicKey(address)) throw new AppError("Invalid Solana wallet address.", 400);
    const balanceSol = await getBalance(address);
    res.json({ success: true, data: { address, balanceSol, balanceLamports: Math.round(balanceSol * 1e9) } });
  })
);

export default router;
