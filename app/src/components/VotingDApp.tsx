import React, { useState, useEffect, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { SystemProgram } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  getProgram,
  getPollPDA,
  getVoteRecordPDA,
  shortenAddress,
  lamportsToSol,
  getExplorerUrl,
  parseError,
  PollData,
} from "../utils/anchor";

const VotingDApp: React.FC = () => {
  const { publicKey, connected } = useWallet();
  const wallet = useWallet();
  const { connection } = useConnection();

  // Wallet info
  const [balance, setBalance] = useState<number>(0);

  // Create poll state
  const [pollTitle, setPollTitle] = useState("");
  const [pollId, setPollId] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [candidatesList, setCandidatesList] = useState<string[]>([]);

  // Fetch poll state
  const [fetchPollId, setFetchPollId] = useState("");
  const [currentPoll, setCurrentPoll] = useState<PollData | null>(null);
  const [hasVoted, setHasVoted] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
    txSig?: string;
  } | null>(null);

  // Fetch SOL balance
  useEffect(() => {
    if (publicKey && connection) {
      connection.getBalance(publicKey).then(setBalance).catch(console.error);
    }
  }, [publicKey, connection]);

  // Clear status message after 15 seconds
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 15000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  // Check if user has voted when poll or wallet changes
  const checkVoteStatus = useCallback(async () => {
    if (!publicKey || !currentPoll) return;
    try {
      const pollIdNum = currentPoll.pollId.toNumber();
      const [voteRecordPda] = getVoteRecordPDA(pollIdNum, publicKey);
      const accountInfo = await connection.getAccountInfo(voteRecordPda);
      setHasVoted(accountInfo !== null);
    } catch {
      setHasVoted(false);
    }
  }, [publicKey, currentPoll, connection]);

  useEffect(() => {
    checkVoteStatus();
  }, [checkVoteStatus]);

  // ─── Create Poll ──────────────────────────────────────────────────────────

  const addCandidate = () => {
    const name = candidateName.trim();
    if (!name) return;
    if (candidatesList.includes(name)) {
      setStatusMessage({ type: "error", text: "Candidate already added!" });
      return;
    }
    if (candidatesList.length >= 10) {
      setStatusMessage({
        type: "error",
        text: "Maximum 10 candidates allowed.",
      });
      return;
    }
    setCandidatesList([...candidatesList, name]);
    setCandidateName("");
  };

  const removeCandidate = (index: number) => {
    setCandidatesList(candidatesList.filter((_, i) => i !== index));
  };

  const handleCreatePoll = async () => {
    if (!publicKey || !wallet) return;
    const idNum = parseInt(pollId);
    if (isNaN(idNum) || idNum <= 0) {
      setStatusMessage({
        type: "error",
        text: "Please enter a valid poll ID (positive number).",
      });
      return;
    }
    if (!pollTitle.trim()) {
      setStatusMessage({ type: "error", text: "Please enter a poll title." });
      return;
    }
    if (candidatesList.length < 2) {
      setStatusMessage({
        type: "error",
        text: "Please add at least 2 candidates.",
      });
      return;
    }

    setLoading(true);
    setStatusMessage({ type: "info", text: "Creating poll..." });

    try {
      const program = getProgram(wallet);
      const pollIdBN = new BN(idNum);
      const [pollPda] = getPollPDA(idNum);

      const tx = await program.methods
        .createPoll(pollIdBN, pollTitle.trim(), candidatesList)
        .accounts({
          poll: pollPda,
          admin: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Wait for confirmation
      await connection.confirmTransaction(tx, "confirmed");

      setStatusMessage({
        type: "success",
        text: `Poll "${pollTitle}" created successfully!`,
        txSig: tx,
      });

      // Reset form
      setPollTitle("");
      setPollId("");
      setCandidatesList([]);

      // Auto-load the created poll
      setFetchPollId(idNum.toString());
      await fetchPoll(idNum);
    } catch (error: any) {
      setStatusMessage({ type: "error", text: parseError(error) });
    } finally {
      setLoading(false);
    }
  };

  // ─── Fetch Poll ───────────────────────────────────────────────────────────

  const fetchPoll = async (id?: number) => {
    const idNum = id || parseInt(fetchPollId);
    if (isNaN(idNum) || idNum <= 0) {
      setStatusMessage({
        type: "error",
        text: "Please enter a valid Poll ID.",
      });
      return;
    }

    setLoading(true);
    setStatusMessage({ type: "info", text: "Fetching poll data..." });

    try {
      const program = getProgram(wallet);
      const [pollPda] = getPollPDA(idNum);
      const pollAccount = await program.account.poll.fetch(pollPda);

      setCurrentPoll(pollAccount as unknown as PollData);
      setStatusMessage(null);
    } catch (error: any) {
      setCurrentPoll(null);
      setStatusMessage({
        type: "error",
        text: `Poll not found. ${parseError(error)}`,
      });
    } finally {
      setLoading(false);
    }
  };

  // ─── Vote ─────────────────────────────────────────────────────────────────

  const handleVote = async (candidateIndex: number) => {
    if (!publicKey || !wallet || !currentPoll) return;

    setLoading(true);
    const candidateName = currentPoll.candidates[candidateIndex].name;
    setStatusMessage({
      type: "info",
      text: `Casting vote for "${candidateName}"...`,
    });

    try {
      const program = getProgram(wallet);
      const pollIdNum = currentPoll.pollId.toNumber();
      const pollIdBN = new BN(pollIdNum);
      const [pollPda] = getPollPDA(pollIdNum);
      const [voteRecordPda] = getVoteRecordPDA(pollIdNum, publicKey);

      const tx = await program.methods
        .vote(pollIdBN, candidateIndex)
        .accounts({
          poll: pollPda,
          voteRecord: voteRecordPda,
          voter: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Wait for confirmation
      await connection.confirmTransaction(tx, "confirmed");

      setStatusMessage({
        type: "success",
        text: `Vote for "${candidateName}" confirmed!`,
        txSig: tx,
      });

      // Refresh poll data
      await fetchPoll(pollIdNum);
      setHasVoted(true);

      // Refresh balance
      const newBalance = await connection.getBalance(publicKey);
      setBalance(newBalance);
    } catch (error: any) {
      setStatusMessage({ type: "error", text: parseError(error) });
    } finally {
      setLoading(false);
    }
  };

  // ─── Render: Not Connected ────────────────────────────────────────────────

  if (!connected) {
    return (
      <div className="connect-prompt">
        <h2>Welcome to Solana Voting</h2>
        <p>Connect your Phantom wallet to create polls and cast votes</p>
        <WalletMultiButton />

        <div className="troubleshoot-box" style={{
          fontSize: "0.85rem",
          color: "var(--text-secondary)",
          background: "rgba(255, 255, 255, 0.05)",
          padding: "1rem",
          borderRadius: "8px",
          maxWidth: "400px",
          margin: "1.5rem auto 0"
        }}>
          <h4 style={{ marginBottom: "0.5rem", color: "var(--accent)" }}>🔍 Having trouble connecting?</h4>
          <ul style={{ textAlign: "left", listStyleType: "none", padding: 0 }}>
            <li>• Ensure Phantom is set to <strong>Devnet</strong> in Settings.</li>
            <li>• Refresh the page if the popup doesn't appear.</li>
            <li>• Try unlocking Phantom first before clicking connect.</li>
          </ul>
        </div>
      </div>
    );
  }

  // ─── Render: Connected ────────────────────────────────────────────────────

  const maxVotes = currentPoll
    ? Math.max(
      ...currentPoll.candidates.map((c) =>
        typeof c.votes === "object" && "toNumber" in c.votes
          ? c.votes.toNumber()
          : Number(c.votes)
      ),
      1
    )
    : 1;

  return (
    <div>
      {/* Wallet Info */}
      <div className="wallet-section">
        <WalletMultiButton />
        {publicKey && (
          <div className="wallet-info">
            <div className="info-item">
              <span className="info-label">Wallet</span>
              <span className="info-value">
                {shortenAddress(publicKey.toBase58())}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">Balance</span>
              <span className="info-value">
                {lamportsToSol(balance)} SOL
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">Network</span>
              <span className="info-value">Devnet</span>
            </div>
          </div>
        )}
      </div>

      {/* Create Poll Card */}
      <div className="card">
        <div className="flex-between">
          <h2>📋 Create Poll</h2>
          <span className="admin-badge">Admin</span>
        </div>

        <div className="form-group">
          <label>Poll ID (unique number)</label>
          <input
            type="number"
            placeholder="e.g. 1"
            value={pollId}
            onChange={(e) => setPollId(e.target.value)}
            min="1"
          />
        </div>

        <div className="form-group">
          <label>Poll Title</label>
          <input
            type="text"
            placeholder="e.g. Best Blockchain of 2026"
            value={pollTitle}
            onChange={(e) => setPollTitle(e.target.value)}
            maxLength={100}
          />
        </div>

        <div className="form-group">
          <label>Candidates (min 2, max 10)</label>
          <div className="candidates-input">
            <input
              type="text"
              placeholder="Enter candidate name"
              value={candidateName}
              onChange={(e) => setCandidateName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCandidate()}
              maxLength={50}
            />
            <button className="btn btn-add" onClick={addCandidate} type="button">
              + Add
            </button>
          </div>
          <div className="candidate-tags">
            {candidatesList.map((name, i) => (
              <span key={i} className="candidate-tag">
                {name}
                <button onClick={() => removeCandidate(i)} title="Remove">
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleCreatePoll}
          disabled={loading || candidatesList.length < 2}
        >
          {loading ? <span className="spinner" /> : null}
          Create Poll
        </button>
      </div>

      {/* Fetch Poll Card */}
      <div className="card">
        <h2>🔍 View Poll & Vote</h2>

        <div className="form-group">
          <label>Enter Poll ID to load</label>
          <div className="candidates-input">
            <input
              type="number"
              placeholder="e.g. 1"
              value={fetchPollId}
              onChange={(e) => setFetchPollId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchPoll()}
              min="1"
            />
            <button
              className="btn btn-secondary"
              onClick={() => fetchPoll()}
              disabled={loading}
            >
              Load Poll
            </button>
          </div>
        </div>

        {/* Poll Display */}
        {currentPoll && (
          <div className="poll-card">
            <div className="poll-header">
              <div>
                <span className="poll-title">{currentPoll.title}</span>{" "}
                <span className="poll-id">
                  ID: {currentPoll.pollId.toNumber()}
                </span>
              </div>
              <span
                className={`poll-status ${currentPoll.isActive ? "active" : "closed"
                  }`}
              >
                {currentPoll.isActive ? "Active" : "Closed"}
              </span>
            </div>

            <div className="poll-meta">
              Admin: {shortenAddress(currentPoll.admin.toBase58())}
              {publicKey &&
                currentPoll.admin.toBase58() === publicKey.toBase58() &&
                " (You)"}
            </div>

            {/* Candidates */}
            <div className="candidate-list">
              {currentPoll.candidates.map((candidate, index) => {
                const votes =
                  typeof candidate.votes === "object" &&
                    "toNumber" in candidate.votes
                    ? candidate.votes.toNumber()
                    : Number(candidate.votes);
                const percentage = maxVotes > 0 ? (votes / maxVotes) * 100 : 0;

                return (
                  <div key={index} className="candidate-item">
                    <div className="candidate-rank">{index + 1}</div>
                    <div className="candidate-details">
                      <div className="candidate-name">{candidate.name}</div>
                      <div className="candidate-votes">
                        {votes} vote{votes !== 1 ? "s" : ""}
                      </div>
                      <div className="vote-bar-container">
                        <div
                          className="vote-bar"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                    <div className="candidate-action">
                      {hasVoted ? (
                        <span className="voted-badge">✓ Voted</span>
                      ) : currentPoll.isActive ? (
                        <button
                          className="btn btn-vote"
                          onClick={() => handleVote(index)}
                          disabled={loading}
                        >
                          {loading ? <span className="spinner" /> : "Vote"}
                        </button>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                          Closed
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="total-votes">
              Total votes: <strong>
                {typeof currentPoll.totalVotes === "object" &&
                  "toNumber" in currentPoll.totalVotes
                  ? currentPoll.totalVotes.toNumber()
                  : Number(currentPoll.totalVotes)}
              </strong>
            </div>

            {/* Refresh button */}
            <div style={{ textAlign: "center", marginTop: "0.75rem" }}>
              <button
                className="btn-refresh"
                onClick={() => fetchPoll(currentPoll.pollId.toNumber())}
                disabled={loading}
              >
                🔄 Refresh Results
              </button>
            </div>
          </div>
        )}

        {!currentPoll && fetchPollId && !loading && (
          <div className="empty-state">
            <p>No poll loaded. Enter a Poll ID and click "Load Poll".</p>
          </div>
        )}
      </div>

      {/* Status Message */}
      {statusMessage && (
        <div className={`status-message ${statusMessage.type}`}>
          <span>
            {statusMessage.type === "success" && "✅ "}
            {statusMessage.type === "error" && "❌ "}
            {statusMessage.type === "info" && "⏳ "}
            {statusMessage.text}
          </span>
          {statusMessage.txSig && (
            <div style={{ marginTop: "0.5rem" }}>
              <a
                className="tx-link"
                href={getExplorerUrl(statusMessage.txSig)}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on Solana Explorer →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VotingDApp;
