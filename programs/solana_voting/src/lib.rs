use anchor_lang::prelude::*;

declare_id!("65sD6MWQPZieeMfBrcbe2mgHpRkxosobzKgTCmnbqQqi");

#[program]
pub mod solana_voting {
    use super::*;

    /// Creates a new voting poll. Only the admin (signer) can create polls.
    pub fn create_poll(
        ctx: Context<CreatePoll>,
        poll_id: u64,
        title: String,
        candidates: Vec<String>,
    ) -> Result<()> {
        require!(candidates.len() >= 2, VotingError::TooFewCandidates);
        require!(candidates.len() <= 10, VotingError::TooManyCandidates);
        require!(title.len() <= 100, VotingError::TitleTooLong);

        let poll = &mut ctx.accounts.poll;
        poll.admin = ctx.accounts.admin.key();
        poll.poll_id = poll_id;
        poll.title = title;
        poll.candidates = candidates
            .iter()
            .map(|name| Candidate {
                name: name.clone(),
                votes: 0,
            })
            .collect();
        poll.total_votes = 0;
        poll.is_active = true;
        poll.bump = ctx.bumps.poll;

        msg!("Poll '{}' created with {} candidates", poll.title, poll.candidates.len());
        Ok(())
    }

    /// Casts a vote for a candidate in a poll. Each wallet can only vote once per poll.
    pub fn vote(ctx: Context<Vote>, poll_id: u64, candidate_index: u8) -> Result<()> {
        let poll = &mut ctx.accounts.poll;

        require!(poll.is_active, VotingError::PollClosed);
        require!(
            (candidate_index as usize) < poll.candidates.len(),
            VotingError::InvalidCandidate
        );

        // Increment vote count for the selected candidate
        poll.candidates[candidate_index as usize].votes += 1;
        poll.total_votes += 1;

        // Record the voter's choice
        let vote_record = &mut ctx.accounts.vote_record;
        vote_record.voter = ctx.accounts.voter.key();
        vote_record.poll_id = poll_id;
        vote_record.candidate_index = candidate_index;
        vote_record.bump = ctx.bumps.vote_record;

        msg!(
            "Vote cast by {} for candidate '{}' in poll '{}'",
            ctx.accounts.voter.key(),
            poll.candidates[candidate_index as usize].name,
            poll.title
        );
        Ok(())
    }

    /// Closes a poll so no more votes can be cast. Only the admin can close.
    pub fn close_poll(ctx: Context<ClosePoll>, _poll_id: u64) -> Result<()> {
        let poll = &mut ctx.accounts.poll;
        require!(
            poll.admin == ctx.accounts.admin.key(),
            VotingError::Unauthorized
        );
        poll.is_active = false;
        msg!("Poll '{}' has been closed", poll.title);
        Ok(())
    }
}

// ─── Account Contexts ────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(poll_id: u64, title: String, candidates: Vec<String>)]
pub struct CreatePoll<'info> {
    #[account(
        init,
        payer = admin,
        space = Poll::space(&candidates),
        seeds = [b"poll", poll_id.to_le_bytes().as_ref()],
        bump
    )]
    pub poll: Account<'info, Poll>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(poll_id: u64, candidate_index: u8)]
pub struct Vote<'info> {
    #[account(
        mut,
        seeds = [b"poll", poll_id.to_le_bytes().as_ref()],
        bump = poll.bump,
    )]
    pub poll: Account<'info, Poll>,

    /// The vote_record PDA ensures each wallet can only vote once per poll.
    /// If a wallet tries to vote again, account initialization will fail.
    #[account(
        init,
        payer = voter,
        space = VoteRecord::SPACE,
        seeds = [b"vote", poll_id.to_le_bytes().as_ref(), voter.key().as_ref()],
        bump
    )]
    pub vote_record: Account<'info, VoteRecord>,

    #[account(mut)]
    pub voter: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(poll_id: u64)]
pub struct ClosePoll<'info> {
    #[account(
        mut,
        seeds = [b"poll", poll_id.to_le_bytes().as_ref()],
        bump = poll.bump,
    )]
    pub poll: Account<'info, Poll>,

    #[account(mut)]
    pub admin: Signer<'info>,
}

// ─── Account Data Structures ─────────────────────────────────────────────────

#[account]
pub struct Poll {
    pub admin: Pubkey,        // 32
    pub poll_id: u64,         // 8
    pub title: String,        // 4 + len
    pub candidates: Vec<Candidate>, // 4 + (len * Candidate::SIZE)
    pub total_votes: u64,     // 8
    pub is_active: bool,      // 1
    pub bump: u8,             // 1
}

impl Poll {
    pub fn space(candidates: &[String]) -> usize {
        8 +                            // discriminator
        32 +                           // admin pubkey
        8 +                            // poll_id
        4 + 100 +                      // title (max 100 chars)
        4 + (candidates.len() * Candidate::SIZE) + // candidates vec
        8 +                            // total_votes
        1 +                            // is_active
        1 +                            // bump
        64                             // padding for safety
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Candidate {
    pub name: String, // 4 + len (max 50)
    pub votes: u64,   // 8
}

impl Candidate {
    pub const SIZE: usize = 4 + 50 + 8; // string prefix + max name + votes
}

#[account]
pub struct VoteRecord {
    pub voter: Pubkey,        // 32
    pub poll_id: u64,         // 8
    pub candidate_index: u8,  // 1
    pub bump: u8,             // 1
}

impl VoteRecord {
    pub const SPACE: usize = 8 + 32 + 8 + 1 + 1 + 16; // discriminator + fields + padding
}

// ─── Error Codes ─────────────────────────────────────────────────────────────

#[error_code]
pub enum VotingError {
    #[msg("Poll must have at least 2 candidates")]
    TooFewCandidates,
    #[msg("Poll cannot have more than 10 candidates")]
    TooManyCandidates,
    #[msg("Title must be 100 characters or less")]
    TitleTooLong,
    #[msg("This poll is closed")]
    PollClosed,
    #[msg("Invalid candidate index")]
    InvalidCandidate,
    #[msg("Only the poll admin can perform this action")]
    Unauthorized,
}
