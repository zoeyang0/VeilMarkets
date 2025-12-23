// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title Encrypted prediction market where selections and tallies stay private on-chain
contract VeilPredictionMarket is ZamaEthereumConfig {
    struct Prediction {
        string title;
        string[] options;
        euint32[] encryptedCounts;
        uint256 createdAt;
        address creator;
    }

    uint256 public predictionCount;
    mapping(uint256 => Prediction) private _predictions;
    mapping(uint256 => mapping(address => bool)) private _hasVoted;

    event PredictionCreated(uint256 indexed predictionId, address indexed creator, string title, string[] options);
    event SelectionSubmitted(uint256 indexed predictionId, address indexed voter);

    error InvalidPrediction();
    error AlreadyParticipated();

    /// @notice Create a new prediction with between 2 and 4 options
    function createPrediction(string calldata title, string[] calldata options) external returns (uint256) {
        uint256 optionLength = options.length;
        if (bytes(title).length == 0 || optionLength < 2 || optionLength > 4) {
            revert InvalidPrediction();
        }

        for (uint256 i = 0; i < optionLength; i++) {
            if (bytes(options[i]).length == 0) {
                revert InvalidPrediction();
            }
        }

        uint256 newId = predictionCount;
        Prediction storage prediction = _predictions[newId];
        prediction.title = title;
        prediction.createdAt = block.timestamp;
        prediction.creator = msg.sender;

        for (uint256 i = 0; i < optionLength; i++) {
            prediction.options.push(options[i]);

            euint32 initialCount = FHE.asEuint32(0);
            FHE.allowThis(initialCount);
            FHE.allow(initialCount, msg.sender);
            FHE.makePubliclyDecryptable(initialCount);

            prediction.encryptedCounts.push(initialCount);
        }

        predictionCount++;

        emit PredictionCreated(newId, msg.sender, title, options);
        return newId;
    }

    /// @notice Submit an encrypted choice for a prediction
    function submitEncryptedChoice(
        uint256 predictionId,
        externalEuint32 encryptedOptionIndex,
        bytes calldata inputProof
    ) external {
        if (predictionId >= predictionCount) {
            revert InvalidPrediction();
        }

        if (_hasVoted[predictionId][msg.sender]) {
            revert AlreadyParticipated();
        }

        Prediction storage prediction = _predictions[predictionId];
        uint256 optionLength = prediction.options.length;
        euint32 optionIndex = FHE.fromExternal(encryptedOptionIndex, inputProof);

        euint32 encryptedOne = FHE.asEuint32(1);
        euint32 encryptedZero = FHE.asEuint32(0);

        for (uint256 i = 0; i < optionLength; i++) {
            ebool isTarget = FHE.eq(optionIndex, FHE.asEuint32(uint32(i)));
            euint32 increment = FHE.select(isTarget, encryptedOne, encryptedZero);

            euint32 updatedCount = FHE.add(prediction.encryptedCounts[i], increment);
            prediction.encryptedCounts[i] = updatedCount;

            FHE.allowThis(updatedCount);
            FHE.allow(updatedCount, msg.sender);
            if (prediction.creator != msg.sender) {
                FHE.allow(updatedCount, prediction.creator);
            }
            FHE.makePubliclyDecryptable(updatedCount);
        }

        _hasVoted[predictionId][msg.sender] = true;
        emit SelectionSubmitted(predictionId, msg.sender);
    }

    /// @notice Retrieve prediction metadata and encrypted tallies
    function getPrediction(
        uint256 predictionId
    )
        external
        view
        returns (string memory title, string[] memory options, euint32[] memory counts, uint256 createdAt, address creator)
    {
        if (predictionId >= predictionCount) {
            revert InvalidPrediction();
        }

        Prediction storage prediction = _predictions[predictionId];
        return (prediction.title, prediction.options, prediction.encryptedCounts, prediction.createdAt, prediction.creator);
    }

    /// @notice Check whether a user already submitted a choice for a prediction
    function hasUserVoted(uint256 predictionId, address user) external view returns (bool) {
        if (predictionId >= predictionCount) {
            revert InvalidPrediction();
        }

        return _hasVoted[predictionId][user];
    }
}
