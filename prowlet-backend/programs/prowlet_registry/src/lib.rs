use anchor_lang::prelude::*;
use solana_keccak_hasher;

declare_id!("Hi76RFfVSD82bW3KLhUYWw5rLRf4xVLrS5JzdYEgKdcB");

const METADATA_URI_MAX_BYTES: usize = 200;

#[program]
pub mod prowlet_registry {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        ctx.accounts.registry.admin = ctx.accounts.admin.key();
        Ok(())
    }

    pub fn approve_issuer(ctx: Context<ManageIssuer>, issuer_key: Pubkey) -> Result<()> {
        let issuer = &mut ctx.accounts.issuer_record;
        issuer.authority = issuer_key;
        issuer.approved = true;
        emit!(IssuerApprovalChanged {
            issuer: issuer_key,
            approved: true,
        });
        Ok(())
    }

    pub fn revoke_issuer(ctx: Context<UpdateIssuer>) -> Result<()> {
        let issuer = &mut ctx.accounts.issuer_record;
        issuer.approved = false;
        emit!(IssuerApprovalChanged {
            issuer: issuer.authority,
            approved: false,
        });
        Ok(())
    }

    pub fn register_batch(
        ctx: Context<RegisterBatch>,
        merkle_root: [u8; 32],
        count: u64,
        metadata_uri: String,
    ) -> Result<()> {
        require!(merkle_root != [0; 32], RegistryError::ZeroRoot);
        require!(count > 0, RegistryError::ZeroCount);
        require!(
            metadata_uri.len() <= METADATA_URI_MAX_BYTES,
            RegistryError::MetadataUriTooLong
        );

        let batch = &mut ctx.accounts.batch;
        batch.root = merkle_root;
        batch.issuer = ctx.accounts.issuer.key();
        batch.timestamp = Clock::get()?.unix_timestamp;
        batch.count = count;
        batch.metadata_uri = metadata_uri;

        emit!(BatchRegistered {
            root: merkle_root,
            issuer: batch.issuer,
            timestamp: batch.timestamp,
            count,
        });
        Ok(())
    }

    pub fn revoke_certificate(
        ctx: Context<RevokeCertificate>,
        merkle_root: [u8; 32],
        leaf_hash: [u8; 32],
    ) -> Result<()> {
        let revocation = &mut ctx.accounts.revocation;
        revocation.root = merkle_root;
        revocation.leaf_hash = leaf_hash;
        revocation.revoked_at = Clock::get()?.unix_timestamp;

        emit!(CertificateRevoked {
            root: merkle_root,
            leaf_hash,
            issuer: ctx.accounts.issuer.key(),
        });
        Ok(())
    }

    pub fn verify(
        ctx: Context<VerifyBatch>,
        merkle_root: [u8; 32],
        leaf_hash: [u8; 32],
        proof: Vec<[u8; 32]>,
    ) -> Result<VerifyResult> {
        let Some(batch) = load_batch(&ctx.accounts.batch)? else {
            return Ok(VerifyResult::not_found());
        };

        let valid = verify_merkle_proof(leaf_hash, &proof, merkle_root);
        let revoked = is_revoked(ctx.accounts.revocation.as_ref(), merkle_root, leaf_hash)?;
        let result = VerifyResult {
            valid,
            revoked,
            issuer: batch.issuer,
            timestamp: batch.timestamp,
        };
        emit!(VerificationResult {
            valid: result.valid,
            revoked: result.revoked,
            issuer: result.issuer,
            timestamp: result.timestamp,
        });
        Ok(result)
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Registry::INIT_SPACE,
        seeds = [b"registry"],
        bump
    )]
    pub registry: Account<'info, Registry>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(issuer_key: Pubkey)]
pub struct ManageIssuer<'info> {
    #[account(seeds = [b"registry"], bump)]
    pub registry: Account<'info, Registry>,
    #[account(
        mut,
        address = registry.admin @ RegistryError::Unauthorized
    )]
    pub admin: Signer<'info>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + Issuer::INIT_SPACE,
        seeds = [b"issuer", issuer_key.as_ref()],
        bump
    )]
    pub issuer_record: Account<'info, Issuer>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateIssuer<'info> {
    #[account(seeds = [b"registry"], bump)]
    pub registry: Account<'info, Registry>,
    #[account(
        address = registry.admin @ RegistryError::Unauthorized
    )]
    pub admin: Signer<'info>,
    #[account(
        mut,
        seeds = [b"issuer", issuer_record.authority.as_ref()],
        bump
    )]
    pub issuer_record: Account<'info, Issuer>,
}

#[derive(Accounts)]
#[instruction(merkle_root: [u8; 32])]
pub struct RegisterBatch<'info> {
    #[account(seeds = [b"registry"], bump)]
    pub registry: Account<'info, Registry>,
    #[account(
        seeds = [b"issuer", issuer.key().as_ref()],
        bump,
        constraint = issuer_record.approved @ RegistryError::IssuerNotApproved
    )]
    pub issuer_record: Account<'info, Issuer>,
    #[account(mut)]
    pub issuer: Signer<'info>,
    #[account(
        init,
        payer = issuer,
        space = 8 + Batch::INIT_SPACE,
        seeds = [b"batch", merkle_root.as_ref()],
        bump
    )]
    pub batch: Account<'info, Batch>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(merkle_root: [u8; 32], leaf_hash: [u8; 32])]
pub struct RevokeCertificate<'info> {
    #[account(
        seeds = [b"batch", merkle_root.as_ref()],
        bump,
        constraint = batch.root == merkle_root @ RegistryError::BatchNotFound
    )]
    pub batch: Account<'info, Batch>,
    #[account(mut, address = batch.issuer @ RegistryError::NotBatchIssuer)]
    pub issuer: Signer<'info>,
    #[account(
        init,
        payer = issuer,
        space = 8 + Revocation::INIT_SPACE,
        seeds = [b"revocation", merkle_root.as_ref(), leaf_hash.as_ref()],
        bump
    )]
    pub revocation: Account<'info, Revocation>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(merkle_root: [u8; 32])]
pub struct VerifyBatch<'info> {
    /// CHECK: The PDA is validated by its seeds; uninitialized accounts represent unknown roots.
    #[account(seeds = [b"batch", merkle_root.as_ref()], bump)]
    pub batch: UncheckedAccount<'info>,
    pub revocation: Option<UncheckedAccount<'info>>,
}

#[account]
#[derive(InitSpace)]
pub struct Registry {
    pub admin: Pubkey,
}

#[account]
#[derive(InitSpace)]
pub struct Issuer {
    pub authority: Pubkey,
    pub approved: bool,
}

#[account]
#[derive(InitSpace)]
pub struct Batch {
    pub root: [u8; 32],
    pub issuer: Pubkey,
    pub timestamp: i64,
    pub count: u64,
    #[max_len(METADATA_URI_MAX_BYTES)]
    pub metadata_uri: String,
}

#[account]
#[derive(InitSpace)]
pub struct Revocation {
    pub root: [u8; 32],
    pub leaf_hash: [u8; 32],
    pub revoked_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub struct VerifyResult {
    pub valid: bool,
    pub revoked: bool,
    pub issuer: Pubkey,
    pub timestamp: i64,
}

impl VerifyResult {
    fn not_found() -> Self {
        Self {
            valid: false,
            revoked: false,
            issuer: Pubkey::default(),
            timestamp: 0,
        }
    }
}

#[event]
pub struct IssuerApprovalChanged {
    pub issuer: Pubkey,
    pub approved: bool,
}

#[event]
pub struct BatchRegistered {
    pub root: [u8; 32],
    pub issuer: Pubkey,
    pub timestamp: i64,
    pub count: u64,
}

#[event]
pub struct CertificateRevoked {
    pub root: [u8; 32],
    pub leaf_hash: [u8; 32],
    pub issuer: Pubkey,
}

#[event]
pub struct VerificationResult {
    pub valid: bool,
    pub revoked: bool,
    pub issuer: Pubkey,
    pub timestamp: i64,
}

#[error_code]
pub enum RegistryError {
    #[msg("Only the registry administrator may perform this action.")]
    Unauthorized,
    #[msg("The issuer has not been approved.")]
    IssuerNotApproved,
    #[msg("The Merkle root cannot be zero.")]
    ZeroRoot,
    #[msg("Batch count must be greater than zero.")]
    ZeroCount,
    #[msg("Metadata URI exceeds the 200-byte limit.")]
    MetadataUriTooLong,
    #[msg("The batch does not exist.")]
    BatchNotFound,
    #[msg("Only the batch issuer may revoke certificates.")]
    NotBatchIssuer,
    #[msg("The revocation account does not match the requested certificate.")]
    InvalidRevocation,
}

fn load_batch(account: &UncheckedAccount) -> Result<Option<Batch>> {
    if account.owner != &crate::ID {
        return Ok(None);
    }
    let data = account.try_borrow_data()?;
    let mut data_slice: &[u8] = &data;
    match Batch::try_deserialize(&mut data_slice) {
        Ok(batch) => Ok(Some(batch)),
        Err(_) => Ok(None),
    }
}

fn is_revoked(
    revocation_account: Option<&UncheckedAccount>,
    merkle_root: [u8; 32],
    leaf_hash: [u8; 32],
) -> Result<bool> {
    let Some(account) = revocation_account else {
        return Ok(false);
    };

    let (expected, _) = Pubkey::find_program_address(
        &[b"revocation", merkle_root.as_ref(), leaf_hash.as_ref()],
        &crate::ID,
    );
    require_keys_eq!(account.key(), expected, RegistryError::InvalidRevocation);
    require_keys_eq!(*account.owner, crate::ID, RegistryError::InvalidRevocation);

    let data = account.try_borrow_data()?;
    let mut data_slice: &[u8] = &data;
    let revocation = Revocation::try_deserialize(&mut data_slice)
        .map_err(|_| error!(RegistryError::InvalidRevocation))?;
    require!(
        revocation.root == merkle_root && revocation.leaf_hash == leaf_hash,
        RegistryError::InvalidRevocation
    );
    Ok(true)
}

fn verify_merkle_proof(leaf: [u8; 32], proof: &[[u8; 32]], root: [u8; 32]) -> bool {
    let computed = proof.iter().fold(leaf, |current, sibling| {
        let (left, right) = if current <= *sibling {
            (&current, sibling)
        } else {
            (sibling, &current)
        };
        solana_keccak_hasher::hashv(&[left, right]).to_bytes()
    });
    computed == root
}

#[cfg(test)]
mod tests {
    use super::verify_merkle_proof;
    use solana_keccak_hasher;

    fn pair_hash(left: [u8; 32], right: [u8; 32]) -> [u8; 32] {
        if left <= right {
            solana_keccak_hasher::hashv(&[&left, &right]).to_bytes()
        } else {
            solana_keccak_hasher::hashv(&[&right, &left]).to_bytes()
        }
    }

    #[test]
    fn accepts_sorted_keccak_merkle_proof() {
        let first = solana_keccak_hasher::hash(b"certificate-1").to_bytes();
        let second = solana_keccak_hasher::hash(b"certificate-2").to_bytes();
        let third = solana_keccak_hasher::hash(b"certificate-3").to_bytes();
        let root = pair_hash(pair_hash(first, second), third);
        assert!(verify_merkle_proof(first, &[second, third], root));
        assert!(!verify_merkle_proof(
            solana_keccak_hasher::hash(b"unknown").to_bytes(),
            &[second, third],
            root
        ));
    }

    #[test]
    fn accepts_single_leaf_tree_with_empty_proof() {
        let leaf = solana_keccak_hasher::hash(b"single-certificate").to_bytes();
        assert!(verify_merkle_proof(leaf, &[], leaf));
    }
}
