import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:address", "Prints the VeilPredictionMarket address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments } = hre;
  const deployment = await deployments.get("VeilPredictionMarket");
  console.log("VeilPredictionMarket address is " + deployment.address);
});

task("task:create-prediction", "Create a prediction with 2-4 options")
  .addParam("title", "Title for the prediction")
  .addParam("options", "Comma separated list of options")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers } = hre;
    const deployment = await deployments.get("VeilPredictionMarket");
    const predictionContract = await ethers.getContractAt("VeilPredictionMarket", deployment.address);
    const signers = await ethers.getSigners();

    const options = (taskArguments.options as string)
      .split(",")
      .map((opt) => opt.trim())
      .filter((opt) => opt.length > 0);

    if (options.length < 2 || options.length > 4) {
      throw new Error("Options must contain between 2 and 4 entries");
    }

    console.log(`Creating prediction "${taskArguments.title}" with options: ${options.join(" | ")}`);
    const tx = await predictionContract.connect(signers[0]).createPrediction(taskArguments.title, options);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("task:vote", "Submit an encrypted choice for a prediction")
  .addParam("id", "Prediction id")
  .addParam("option", "Zero-based option index to vote for")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers, fhevm } = hre;

    const predictionId = parseInt(taskArguments.id);
    const optionIndex = parseInt(taskArguments.option);
    if (!Number.isInteger(predictionId) || predictionId < 0) {
      throw new Error("Argument --id must be a non-negative integer");
    }
    if (!Number.isInteger(optionIndex) || optionIndex < 0) {
      throw new Error("Argument --option must be a non-negative integer");
    }

    await fhevm.initializeCLIApi();

    const deployment = await deployments.get("VeilPredictionMarket");
    const signers = await ethers.getSigners();
    const predictionContract = await ethers.getContractAt("VeilPredictionMarket", deployment.address);

    const encryptedChoice = await fhevm
      .createEncryptedInput(deployment.address, signers[0].address)
      .add32(optionIndex)
      .encrypt();

    console.log(
      `Submitting encrypted vote for prediction ${predictionId} with handle=${ethers.hexlify(encryptedChoice.handles[0])}`,
    );
    const tx = await predictionContract
      .connect(signers[0])
      .submitEncryptedChoice(predictionId, encryptedChoice.handles[0], encryptedChoice.inputProof);

    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("task:show", "Decrypt tallies for a prediction (requires ACL access)")
  .addParam("id", "Prediction id")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers, fhevm } = hre;

    const predictionId = parseInt(taskArguments.id);
    if (!Number.isInteger(predictionId) || predictionId < 0) {
      throw new Error("Argument --id must be a non-negative integer");
    }

    await fhevm.initializeCLIApi();

    const deployment = await deployments.get("VeilPredictionMarket");
    const predictionContract = await ethers.getContractAt("VeilPredictionMarket", deployment.address);
    const signers = await ethers.getSigners();

    const [title, options, encryptedCounts, createdAt, creator] = await predictionContract.getPrediction(predictionId);
    const clearCounts = await Promise.all(
      encryptedCounts.map((enc: string) =>
        fhevm.userDecryptEuint(FhevmType.euint32, enc, deployment.address, signers[0]),
      ),
    );

    console.log(`Prediction #${predictionId}: ${title}`);
    console.log(`Creator: ${creator}`);
    console.log(`Created at: ${new Date(Number(createdAt) * 1000).toISOString()}`);
    options.forEach((option: string, index: number) => {
      console.log(`  [${index}] ${option} => encrypted=${encryptedCounts[index]} | clear=${clearCounts[index]}`);
    });
  });
