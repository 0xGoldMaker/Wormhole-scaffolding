import {
  Commitment,
  Connection,
  PublicKey,
  PublicKeyInitData,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import { BN } from "@project-serum/anchor";
import {
  CompleteTransferNativeWithPayloadCpiAccounts,
  //getCompleteTransferNativeWithPayloadCpiAccounts,
} from "@certusone/wormhole-sdk/lib/cjs/solana";
import { createHelloTokenProgramInterface } from "../program";
import {
  deriveForeignContractKey,
  deriveSenderConfigKey,
  deriveTokenTransferMessageKey,
  deriveTmpTokenAccountKey,
  deriveRedeemerConfigKey,
} from "../accounts";
import {
  deriveClaimKey,
  derivePostedVaaKey,
  getPostedVaa,
  getProgramSequenceTracker,
} from "@certusone/wormhole-sdk/lib/cjs/solana/wormhole";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  isBytes,
  ParsedTokenTransferVaa,
  ParsedVaa,
  parseTokenTransferPayload,
  parseTokenTransferVaa,
  parseVaa,
  SignedVaa,
} from "@certusone/wormhole-sdk";
import { deriveWormholeMessageKey } from "../../01_hello_world";
import {
  deriveCustodyKey,
  deriveCustodySignerKey,
  deriveEndpointKey,
  deriveRedeemerAccountKey,
  deriveTokenBridgeConfigKey,
  getEndpointRegistration,
} from "@certusone/wormhole-sdk/lib/cjs/solana/tokenBridge";

export async function createRedeemNativeTransferWithPayloadInstruction(
  connection: Connection,
  programId: PublicKeyInitData,
  payer: PublicKeyInitData,
  tokenBridgeProgramId: PublicKeyInitData,
  wormholeProgramId: PublicKeyInitData,
  wormholeMessage: SignedVaa | ParsedTokenTransferVaa,
  recipientTokenAccount: PublicKeyInitData,
  recipient?: PublicKeyInitData,
  commitment?: Commitment
): Promise<TransactionInstruction> {
  const program = createHelloTokenProgramInterface(connection, programId);

  const parsed = isBytes(wormholeMessage)
    ? parseTokenTransferVaa(wormholeMessage)
    : wormholeMessage;

  const mint = new PublicKey(parsed.tokenAddress);

  const tmpTokenAccount = deriveTmpTokenAccountKey(programId, mint);
  const tokenBridgeAccounts = getCompleteTransferNativeWithPayloadCpiAccounts(
    tokenBridgeProgramId,
    wormholeProgramId,
    payer,
    parsed,
    tmpTokenAccount
  );

  return program.methods
    .redeemNativeTransferWithPayload([...parsed.hash])
    .accounts({
      config: deriveRedeemerConfigKey(programId),
      foreignContract: deriveForeignContractKey(programId, parsed.emitterChain),
      tmpTokenAccount,
      recipientTokenAccount: new PublicKey(recipientTokenAccount),
      recipient: new PublicKey(recipient === undefined ? payer : recipient),
      payerTokenAccount: getAssociatedTokenAddressSync(
        mint,
        new PublicKey(payer)
      ),
      tokenBridgeProgram: new PublicKey(tokenBridgeProgramId),
      ...tokenBridgeAccounts,
    })
    .instruction();
}

// Temporary
function getCompleteTransferNativeWithPayloadCpiAccounts(
  tokenBridgeProgramId: PublicKeyInitData,
  wormholeProgramId: PublicKeyInitData,
  payer: PublicKeyInitData,
  vaa: SignedVaa | ParsedTokenTransferVaa,
  toTokenAccount: PublicKeyInitData
): CompleteTransferNativeWithPayloadCpiAccounts {
  const parsed = isBytes(vaa) ? parseTokenTransferVaa(vaa) : vaa;
  const mint = new PublicKey(parsed.tokenAddress);
  const cpiProgramId = new PublicKey(parsed.to);

  return {
    payer: new PublicKey(payer),
    tokenBridgeConfig: deriveTokenBridgeConfigKey(tokenBridgeProgramId),
    vaa: derivePostedVaaKey(wormholeProgramId, parsed.hash),
    tokenBridgeClaim: deriveClaimKey(
      tokenBridgeProgramId,
      parsed.emitterAddress,
      parsed.emitterChain,
      parsed.sequence
    ),
    tokenBridgeForeignEndpoint: deriveEndpointKey(
      tokenBridgeProgramId,
      parsed.emitterChain,
      parsed.emitterAddress
    ),
    toTokenAccount: new PublicKey(toTokenAccount),
    tokenBridgeRedeemer: deriveRedeemerAccountKey(cpiProgramId),
    toFeesTokenAccount: new PublicKey(toTokenAccount),
    tokenBridgeCustody: deriveCustodyKey(tokenBridgeProgramId, mint),
    mint,
    tokenBridgeCustodySigner: deriveCustodySignerKey(tokenBridgeProgramId),
    rent: SYSVAR_RENT_PUBKEY,
    systemProgram: SystemProgram.programId,
    tokenProgram: TOKEN_PROGRAM_ID,
    wormholeProgram: new PublicKey(wormholeProgramId),
  };
}