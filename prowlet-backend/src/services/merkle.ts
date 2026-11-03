import { randomBytes } from "node:crypto";

import { MerkleTree } from "merkletreejs";
import jsSha3 from "js-sha3";

const { keccak_256 } = jsSha3;

export type CertificateLeafInput = {
  id: string;
  recipient: string;
  email: string;
  course: string;
  issueDate: string;
  salt: Buffer;
};

export function hashCertificate(input: CertificateLeafInput): Buffer {
  const packed = Buffer.concat([
    Buffer.from(input.id),
    Buffer.from(input.recipient),
    Buffer.from(input.email),
    Buffer.from(input.course),
    Buffer.from(input.issueDate),
    input.salt,
  ]);
  return Buffer.from(keccak_256.arrayBuffer(packed));
}

export function createCertificateSalt() {
  return randomBytes(16);
}

export function createMerkleTree(leaves: Buffer[]) {
  return new MerkleTree(leaves, (value: Buffer) => Buffer.from(keccak_256.arrayBuffer(value)), {
    sortPairs: true,
    hashLeaves: false,
  });
}

export function verifyMerkleProof(leaf: Buffer, proof: Buffer[], root: Buffer) {
  return createMerkleTree([]).verify(proof, leaf, root);
}
