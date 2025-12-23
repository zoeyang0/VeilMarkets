import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { VeilPredictionMarket, VeilPredictionMarket__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory(
    "VeilPredictionMarket",
  )) as VeilPredictionMarket__factory;
  const predictionContract = (await factory.deploy()) as VeilPredictionMarket;
  const predictionContractAddress = await predictionContract.getAddress();

  return { predictionContract, predictionContractAddress };
}

describe("VeilPredictionMarket", function () {
  let signers: Signers;
  let predictionContract: VeilPredictionMarket;
  let predictionContractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ predictionContract, predictionContractAddress } = await deployFixture());
  });

  it("creates prediction with encrypted zero counts", async function () {
    const options = ["Yes", "No", "Maybe"];
    const tx = await predictionContract.createPrediction("Will it rain tomorrow?", options);
    await tx.wait();

    expect(await predictionContract.predictionCount()).to.eq(1);

    const [title, returnedOptions, encryptedCounts, createdAt, creator] = await predictionContract.getPrediction(0);
    expect(title).to.eq("Will it rain tomorrow?");
    expect(returnedOptions).to.deep.eq(options);
    expect(creator).to.eq(signers.deployer.address);
    expect(encryptedCounts.length).to.eq(options.length);
    expect(createdAt).to.be.greaterThan(0);

    const clearCounts: bigint[] = [];
    for (const encrypted of encryptedCounts) {
      const value = await fhevm.userDecryptEuint(
        FhevmType.euint32,
        encrypted,
        predictionContractAddress,
        signers.deployer,
      );
      clearCounts.push(value);
    }
    clearCounts.forEach((count) => expect(count).to.eq(0n));
  });

  it("records encrypted vote for the selected option", async function () {
    const options = ["Alpha", "Beta"];
    await predictionContract.createPrediction("Choose a symbol", options);

    const encryptedChoice = await fhevm
      .createEncryptedInput(predictionContractAddress, signers.alice.address)
      .add32(1)
      .encrypt();

    const voteTx = await predictionContract
      .connect(signers.alice)
      .submitEncryptedChoice(0, encryptedChoice.handles[0], encryptedChoice.inputProof);
    await voteTx.wait();

    const [, , encryptedCounts] = await predictionContract.getPrediction(0);
    const clearCounts: bigint[] = [];
    for (const encrypted of encryptedCounts) {
      const value = await fhevm.userDecryptEuint(
        FhevmType.euint32,
        encrypted,
        predictionContractAddress,
        signers.alice,
      );
      clearCounts.push(value);
    }

    expect(clearCounts[0]).to.eq(0n);
    expect(clearCounts[1]).to.eq(1n);
  });

  it("blocks duplicate votes from the same wallet", async function () {
    const options = ["Left", "Right"];
    await predictionContract.createPrediction("Pick a side", options);

    const encryptedChoice = await fhevm
      .createEncryptedInput(predictionContractAddress, signers.bob.address)
      .add32(0)
      .encrypt();

    await predictionContract
      .connect(signers.bob)
      .submitEncryptedChoice(0, encryptedChoice.handles[0], encryptedChoice.inputProof);

    await expect(
      predictionContract
        .connect(signers.bob)
        .submitEncryptedChoice(0, encryptedChoice.handles[0], encryptedChoice.inputProof),
    ).to.be.revertedWithCustomError(predictionContract, "AlreadyParticipated");
  });

  it("tracks hasUserVoted with an explicit address parameter", async function () {
    const options = ["Up", "Down"];
    await predictionContract.createPrediction("Check status", options);
    expect(await predictionContract.hasUserVoted(0, signers.alice.address)).to.eq(false);

    const encryptedChoice = await fhevm
      .createEncryptedInput(predictionContractAddress, signers.alice.address)
      .add32(1)
      .encrypt();

    await predictionContract
      .connect(signers.alice)
      .submitEncryptedChoice(0, encryptedChoice.handles[0], encryptedChoice.inputProof);

    expect(await predictionContract.hasUserVoted(0, signers.alice.address)).to.eq(true);
  });
});
