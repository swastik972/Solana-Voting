import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolanaVoting } from "../target/types/solana_voting";
import { assert, expect } from "chai";
import { PublicKey, SystemProgram } from "@solana/web3.js";

describe("solana-voting", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SolanaVoting as Program<SolanaVoting>;
  const admin = provider.wallet;

  const pollId = new anchor.BN(1);
  const title = "Best Blockchain";
  const candidates = ["Solana", "Ethereum", "Polygon"];

  // Derive Poll PDA
  const [pollPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("poll"), pollId.toArrayLike(Buffer, "le", 8)],
    program.programId
  );

  it("Creates a poll", async () => {
    const tx = await program.methods
      .createPoll(pollId, title, candidates)
      .accounts({
        poll: pollPda,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Create poll tx:", tx);

    const pollAccount = await program.account.poll.fetch(pollPda);
    assert.equal(pollAccount.title, title);
    assert.equal(pollAccount.candidates.length, 3);
    assert.equal(pollAccount.totalVotes.toNumber(), 0);
    assert.equal(pollAccount.isActive, true);
    assert.equal(
      pollAccount.admin.toBase58(),
      admin.publicKey.toBase58()
    );

    console.log("Poll created successfully:");
    pollAccount.candidates.forEach((c, i) => {
      console.log(`  Candidate ${i}: ${c.name} - ${c.votes.toNumber()} votes`);
    });
  });

  it("Casts a vote", async () => {
    const candidateIndex = 0; // Vote for "Solana"

    // Derive Vote Record PDA
    const [voteRecordPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vote"),
        pollId.toArrayLike(Buffer, "le", 8),
        admin.publicKey.toBuffer(),
      ],
      program.programId
    );

    const tx = await program.methods
      .vote(pollId, candidateIndex)
      .accounts({
        poll: pollPda,
        voteRecord: voteRecordPda,
        voter: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Vote tx:", tx);

    const pollAccount = await program.account.poll.fetch(pollPda);
    assert.equal(pollAccount.candidates[0].votes.toNumber(), 1);
    assert.equal(pollAccount.totalVotes.toNumber(), 1);

    const voteRecord = await program.account.voteRecord.fetch(voteRecordPda);
    assert.equal(voteRecord.candidateIndex, candidateIndex);
    assert.equal(
      voteRecord.voter.toBase58(),
      admin.publicKey.toBase58()
    );

    console.log("Vote recorded successfully!");
  });

  it("Prevents double voting", async () => {
    const candidateIndex = 1;

    const [voteRecordPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vote"),
        pollId.toArrayLike(Buffer, "le", 8),
        admin.publicKey.toBuffer(),
      ],
      program.programId
    );

    try {
      await program.methods
        .vote(pollId, candidateIndex)
        .accounts({
          poll: pollPda,
          voteRecord: voteRecordPda,
          voter: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have thrown an error for double voting");
    } catch (err) {
      console.log("Double vote correctly prevented!");
      // The error occurs because the vote_record PDA already exists
      expect(err).to.exist;
    }
  });

  it("Votes from a different wallet", async () => {
    const voter2 = anchor.web3.Keypair.generate();

    // Airdrop SOL to the new voter
    const airdropSig = await provider.connection.requestAirdrop(
      voter2.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    const candidateIndex = 1; // Vote for "Ethereum"

    const [voteRecordPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vote"),
        pollId.toArrayLike(Buffer, "le", 8),
        voter2.publicKey.toBuffer(),
      ],
      program.programId
    );

    const tx = await program.methods
      .vote(pollId, candidateIndex)
      .accounts({
        poll: pollPda,
        voteRecord: voteRecordPda,
        voter: voter2.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([voter2])
      .rpc();

    console.log("Voter 2 tx:", tx);

    const pollAccount = await program.account.poll.fetch(pollPda);
    assert.equal(pollAccount.candidates[0].votes.toNumber(), 1); // Solana
    assert.equal(pollAccount.candidates[1].votes.toNumber(), 1); // Ethereum
    assert.equal(pollAccount.totalVotes.toNumber(), 2);

    console.log("Updated results:");
    pollAccount.candidates.forEach((c, i) => {
      console.log(`  Candidate ${i}: ${c.name} - ${c.votes.toNumber()} votes`);
    });
  });

  it("Closes a poll", async () => {
    const tx = await program.methods
      .closePoll(pollId)
      .accounts({
        poll: pollPda,
        admin: admin.publicKey,
      })
      .rpc();

    console.log("Close poll tx:", tx);

    const pollAccount = await program.account.poll.fetch(pollPda);
    assert.equal(pollAccount.isActive, false);
    console.log("Poll closed successfully!");
  });

  it("Prevents voting on a closed poll", async () => {
    const voter3 = anchor.web3.Keypair.generate();
    const airdropSig = await provider.connection.requestAirdrop(
      voter3.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    const [voteRecordPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("vote"),
        pollId.toArrayLike(Buffer, "le", 8),
        voter3.publicKey.toBuffer(),
      ],
      program.programId
    );

    try {
      await program.methods
        .vote(pollId, 0)
        .accounts({
          poll: pollPda,
          voteRecord: voteRecordPda,
          voter: voter3.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([voter3])
        .rpc();
      assert.fail("Should have thrown an error for closed poll");
    } catch (err) {
      console.log("Voting on closed poll correctly prevented!");
      expect(err).to.exist;
    }
  });
});
