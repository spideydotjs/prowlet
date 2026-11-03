import * as anchor from "@coral-xyz/anchor";
import { Program, web3 } from "@coral-xyz/anchor";

import type { ProwletRegistry } from "../target/types/prowlet_registry";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.ProwletRegistry as Program<ProwletRegistry>;
  const [registry] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from("registry")],
    program.programId,
  );

  const existing = await provider.connection.getAccountInfo(registry, "confirmed");
  if (existing) {
    console.log(`Registry is already initialized at ${registry.toBase58()}`);
    return;
  }

  await program.methods
    .initialize()
    .accountsPartial({
      registry,
      admin: provider.wallet.publicKey,
      systemProgram: web3.SystemProgram.programId,
    })
    .rpc();

  console.log(`Initialized Prowlet registry at ${registry.toBase58()}`);
  console.log(`Program: ${program.programId.toBase58()}`);
  console.log(`Cluster: ${provider.connection.rpcEndpoint}`);
}

main().catch((error: unknown) => {
  console.error("Registry initialization failed:", error);
  process.exitCode = 1;
});
