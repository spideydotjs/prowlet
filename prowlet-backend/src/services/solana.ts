import { readFile } from "node:fs/promises";
import path from "node:path";

import * as anchor from "@coral-xyz/anchor";
import type { Idl, Program } from "@coral-xyz/anchor";

import { env } from "../config/env";

type VerifyResponse = { valid: boolean; revoked: boolean; issuer: anchor.web3.PublicKey; timestamp: anchor.BN };

class SolanaRegistry {
  private clientPromise?: Promise<{ program: Program; wallet: anchor.Wallet }>;

  private async client() {
    if (!this.clientPromise) this.clientPromise = this.createClient();
    return this.clientPromise;
  }

  private async createClient() {
    if (!env.SOLANA_KEYPAIR_PATH) throw new Error("SOLANA_KEYPAIR_PATH is required when BLOCKCHAIN_MODE=solana.");
    const keypairPath = path.resolve(env.SOLANA_KEYPAIR_PATH);
    const secret = JSON.parse(await readFile(keypairPath, "utf8")) as number[];
    const keypair = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(secret));
    const wallet = new anchor.Wallet(keypair);
    const connection = new anchor.web3.Connection(env.SOLANA_RPC_URL, "confirmed");
    const idlPath = path.resolve(process.cwd(), "target/idl/prowlet_registry.json");
    const idl = JSON.parse(await readFile(idlPath, "utf8")) as Idl;
    return {
      program: new anchor.Program(idl, new anchor.AnchorProvider(connection, wallet, {
        commitment: "confirmed",
        preflightCommitment: "confirmed",
      })),
      wallet,
    };
  }

  async registerBatch(root: Buffer, count: number, batchId: string, organizationId: string) {
    const { program, wallet } = await this.client();
    const rootBytes = [...root];
    const [registry] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("registry")],
      program.programId,
    );
    const [issuerRecord] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("issuer"), wallet.publicKey.toBuffer()],
      program.programId,
    );
    const [batch] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("batch"), root],
      program.programId,
    );
    const storedBatch = await (program.account as Record<string, {
      fetchNullable(address: anchor.web3.PublicKey): Promise<{
        root: number[];
        issuer: anchor.web3.PublicKey;
        count: anchor.BN;
      } | null>;
    }>).batch.fetchNullable(batch);
    if (storedBatch) {
      if (
        !Buffer.from(storedBatch.root).equals(root)
        || !storedBatch.issuer.equals(wallet.publicKey)
        || !storedBatch.count.eq(new anchor.BN(count))
      ) {
        throw new Error("An existing Solana batch does not match the retry request.");
      }
      const [transaction] = await program.provider.connection.getSignaturesForAddress(batch, { limit: 1 });
      if (!transaction || transaction.err) throw new Error("Existing Solana batch transaction could not be confirmed.");
      return { signature: transaction.signature, slot: transaction.slot };
    }

    try {
      const current = await (program.account as Record<string, {
        fetch(address: anchor.web3.PublicKey): Promise<{ approved: boolean }>;
      }>).issuer.fetch(issuerRecord);
      if (!current.approved) {
        await program.methods.approveIssuer(wallet.publicKey)
          .accountsPartial({ registry, admin: wallet.publicKey, issuerRecord })
          .rpc();
      }
    } catch (error) {
      if (!String(error).includes("Account does not exist")) throw error;
      await program.methods.approveIssuer(wallet.publicKey)
        .accountsPartial({ registry, admin: wallet.publicKey, issuerRecord })
        .rpc();
    }

    const signature = await program.methods
      .registerBatch(rootBytes, new anchor.BN(count), `prowlet:${batchId}:${organizationId}`)
      .accountsPartial({
        registry,
        issuerRecord,
        issuer: wallet.publicKey,
        batch,
      })
      .rpc();
    const confirmation = await program.provider.connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!confirmation) throw new Error("Solana transaction confirmation was not available.");
    return { signature, slot: confirmation.slot };
  }

  async revoke(root: Buffer, leaf: Buffer) {
    const { program, wallet } = await this.client();
    const [batch] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("batch"), root],
      program.programId,
    );
    const [revocation] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("revocation"), root, leaf],
      program.programId,
    );
    const existing = await program.provider.connection.getAccountInfo(revocation, "confirmed");
    if (existing) {
      if (!existing.owner.equals(program.programId)) throw new Error("The Solana revocation account is invalid.");
      const record = await (program.account as Record<string, {
        fetch(address: anchor.web3.PublicKey): Promise<{ root: number[]; leafHash: number[] }>;
      }>).revocation.fetch(revocation);
      if (!Buffer.from(record.root).equals(root) || !Buffer.from(record.leafHash).equals(leaf)) {
        throw new Error("The Solana revocation record does not match this certificate.");
      }
      return "";
    }
    return program.methods
      .revokeCertificate([...root], [...leaf])
      .accountsPartial({ batch, issuer: wallet.publicKey, revocation })
      .rpc();
  }

  async verify(root: Buffer, leaf: Buffer, proof: Buffer[]) {
    const { program } = await this.client();
    const [batch] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("batch"), root],
      program.programId,
    );
    const [revocation] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("revocation"), root, leaf],
      program.programId,
    );
    const revocationInfo = await program.provider.connection.getAccountInfo(revocation, "confirmed");
    const result = await program.methods
      .verify([...root], [...leaf], proof.map((item) => [...item]))
      // Anchor's untyped Program declaration omits nullable optional accounts.
      // @ts-expect-error The on-chain verify instruction requires the optional key.
      .accountsPartial({ batch, revocation: revocationInfo ? revocation : null })
      .view();
    return result as VerifyResponse;
  }
}

export const solanaRegistry = new SolanaRegistry();
