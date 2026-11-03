import * as anchor from "@coral-xyz/anchor";
import { Program, web3 } from "@coral-xyz/anchor";
import { expect } from "chai";
import jsSha3 from "js-sha3";
import { MerkleTree } from "merkletreejs";

import type { ProwletRegistry } from "../target/types/prowlet_registry";

describe("ProwletRegistry", () => {
  const { keccak_256 } = jsSha3;
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.ProwletRegistry as Program<ProwletRegistry>;
  const admin = provider.wallet;
  const [registry] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("registry")],
    program.programId,
  );

  const key = (label: string) => Buffer.from(keccak_256.arrayBuffer(Buffer.from(label)));
  const pda = (...seeds: Buffer[]) =>
    web3.PublicKey.findProgramAddressSync(seeds, program.programId)[0];

  async function createIssuer() {
    const issuer = web3.Keypair.generate();
    const signature = await provider.connection.requestAirdrop(
      issuer.publicKey,
      web3.LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(signature, "confirmed");
    return issuer;
  }

  async function expectFailure(action: Promise<unknown>) {
    let failed = false;
    try {
      await action;
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
  }

  async function approve(issuer: web3.Keypair) {
    const issuerRecord = pda(Buffer.from("issuer"), issuer.publicKey.toBuffer());
    await program.methods
      .approveIssuer(issuer.publicKey)
      .accountsPartial({
        registry,
        admin: admin.publicKey,
        issuerRecord,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();
    return issuerRecord;
  }

  async function register(issuer: web3.Keypair, leaves: Buffer[]) {
    const tree = new MerkleTree(leaves, (value: Buffer) => Buffer.from(keccak_256.arrayBuffer(value)), {
      sortPairs: true,
    });
    const root = tree.getRoot();
    const batch = pda(Buffer.from("batch"), root);
    const issuerRecord = pda(Buffer.from("issuer"), issuer.publicKey.toBuffer());

    await program.methods
      .registerBatch([...root], new anchor.BN(leaves.length), "")
      .accountsPartial({
        registry,
        issuerRecord,
        issuer: issuer.publicKey,
        batch,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([issuer])
      .rpc();

    return { tree, root, batch, issuerRecord };
  }

  async function simulateVerify(
    root: Buffer,
    leaf: Buffer,
    proof: Buffer[],
    revokedAccount?: web3.PublicKey,
    batch = pda(Buffer.from("batch"), root),
  ) {
    const result = await program.methods
      .verify([...root], [...leaf], proof.map((item) => [...item]))
      .accountsPartial({
        batch,
        revocation: revokedAccount ?? null,
      })
      .view();

    return result as {
      valid: boolean;
      revoked: boolean;
      issuer: web3.PublicKey;
      timestamp: anchor.BN;
    };
  }

  before(async () => {
    await program.methods
      .initialize()
      .accountsPartial({
        registry,
        admin: admin.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();
  });

  it("restricts issuer approval to the registry admin", async () => {
    const outsider = await createIssuer();
    const issuer = web3.Keypair.generate();
    const issuerRecord = pda(Buffer.from("issuer"), issuer.publicKey.toBuffer());

    await expectFailure(
      program.methods
        .approveIssuer(issuer.publicKey)
        .accountsPartial({
          registry,
          admin: outsider.publicKey,
          issuerRecord,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([outsider])
        .rpc(),
    );

    await approve(issuer);
    const account = await program.account.issuer.fetch(issuerRecord);
    expect(account.approved).to.equal(true);
    expect(account.authority.equals(issuer.publicKey)).to.equal(true);

    await program.methods
      .revokeIssuer()
      .accountsPartial({ registry, admin: admin.publicKey, issuerRecord })
      .rpc();
    expect((await program.account.issuer.fetch(issuerRecord)).approved).to.equal(false);

    await approve(issuer);
    expect((await program.account.issuer.fetch(issuerRecord)).approved).to.equal(true);
  });

  it("registers an approved issuer batch and rejects duplicate roots", async () => {
    const issuer = await createIssuer();
    await approve(issuer);
    const { tree, root, batch } = await register(issuer, [key("one"), key("two")]);

    const stored = await program.account.batch.fetch(batch);
    expect(Buffer.from(stored.root).equals(root)).to.equal(true);
    expect(stored.issuer.equals(issuer.publicKey)).to.equal(true);
    expect(stored.count.toNumber()).to.equal(2);
    expect(stored.timestamp.toNumber()).to.be.greaterThan(0);

    await expectFailure(
      program.methods
        .registerBatch([...root], new anchor.BN(2), "")
        .accountsPartial({
          registry,
          issuerRecord: pda(Buffer.from("issuer"), issuer.publicKey.toBuffer()),
          issuer: issuer.publicKey,
          batch,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([issuer])
        .rpc(),
    );

    const result = await simulateVerify(
      root,
      key("one"),
      tree.getProof(key("one")).map(({ data }) => data),
    );
    expect(result.valid).to.equal(true);
    expect(result.revoked).to.equal(false);
    expect(result.issuer.equals(issuer.publicKey)).to.equal(true);
  });

  it("rejects unapproved issuers and zero-count batches", async () => {
    const issuer = await createIssuer();
    const root = key("unregistered");
    const batch = pda(Buffer.from("batch"), root);
    const issuerRecord = pda(Buffer.from("issuer"), issuer.publicKey.toBuffer());

    await expectFailure(
      program.methods
        .registerBatch([...root], new anchor.BN(1), "")
        .accountsPartial({
          registry,
          issuerRecord,
          issuer: issuer.publicKey,
          batch,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([issuer])
        .rpc(),
    );

    await approve(issuer);
    await expectFailure(
      program.methods
        .registerBatch([...root], new anchor.BN(0), "")
        .accountsPartial({
          registry,
          issuerRecord,
          issuer: issuer.publicKey,
          batch,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([issuer])
        .rpc(),
    );
  });

  it("rejects invalid proofs and returns not-found for unknown roots", async () => {
    const issuer = await createIssuer();
    await approve(issuer);
    const leaves = [key("left"), key("right")];
    const { tree, root } = await register(issuer, leaves);

    const invalid = await simulateVerify(
      root,
      key("not-in-tree"),
      tree.getProof(leaves[0]).map(({ data }) => data),
    );
    expect(invalid.valid).to.equal(false);

    const missing = await simulateVerify(
      key("missing-root"),
      key("missing-leaf"),
      [],
    );
    expect(missing.valid).to.equal(false);
    expect(missing.issuer.equals(web3.PublicKey.default)).to.equal(true);
    expect(missing.timestamp.toNumber()).to.equal(0);
  });

  it("allows only the batch issuer to revoke and exposes the revocation state", async () => {
    const issuer = await createIssuer();
    const outsider = await createIssuer();
    await approve(issuer);
    const leaf = key("certificate-to-revoke");
    const { root, batch, tree } = await register(issuer, [leaf]);
    const revocation = pda(Buffer.from("revocation"), root, leaf);

    await expectFailure(
      program.methods
        .revokeCertificate([...root], [...leaf])
        .accountsPartial({
          batch,
          issuer: outsider.publicKey,
          revocation,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([outsider])
        .rpc(),
    );

    await program.methods
      .revokeCertificate([...root], [...leaf])
      .accountsPartial({
        batch,
        issuer: issuer.publicKey,
        revocation,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([issuer])
      .rpc();

    const result = await simulateVerify(
      root,
      leaf,
      tree.getProof(leaf).map(({ data }) => data),
      revocation,
    );
    expect(result.valid).to.equal(true);
    expect(result.revoked).to.equal(true);
  });
});
