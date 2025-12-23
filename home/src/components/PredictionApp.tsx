import { useEffect, useMemo, useState } from 'react';
import { Contract } from 'ethers';
import { useAccount, usePublicClient } from 'wagmi';

import { CONTRACT_ABI, CONTRACT_ADDRESS } from '../config/contracts';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { Header } from './Header';
import { PredictionForm } from './PredictionForm';
import { PredictionList } from './PredictionList';
import type { PredictionRecord } from './PredictionList';
import '../styles/PredictionApp.css';

// const zeroAddress = '0x0000000000000000000000000000000000000000';

export function PredictionApp() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [predictions, setPredictions] = useState<PredictionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [votingId, setVotingId] = useState<number | null>(null);
  const [decryptingId, setDecryptingId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const zamaReady = !!instance && !zamaLoading;
  const addressReady = true;

  useEffect(() => {
    const fetchPredictions = async () => {
      if (!publicClient || !addressReady) {
        setPredictions([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setLoadError(null);

      try {
        const total = (await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'predictionCount',
        })) as bigint;

        const items: PredictionRecord[] = [];

        for (let id = 0; id < Number(total); id++) {
          const [title, options, encryptedCounts, createdAt, creator] = (await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'getPrediction',
            args: [BigInt(id)],
          })) as [string, string[], string[], bigint, string];

          let hasVoted = false;
          if (address) {
            hasVoted = (await publicClient.readContract({
              address: CONTRACT_ADDRESS,
              abi: CONTRACT_ABI,
              functionName: 'hasUserVoted',
              args: [BigInt(id), address],
            })) as boolean;
          }

          items.push({
            id,
            title,
            options: [...options],
            encryptedCounts: [...encryptedCounts],
            createdAt: Number(createdAt),
            creator,
            hasVoted,
          });
        }

        setPredictions(items);
      } catch (error) {
        console.error('Failed to load predictions', error);
        setLoadError('Unable to load predictions from the contract.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPredictions();
  }, [address, addressReady, publicClient, refreshKey]);

  const metrics = useMemo(() => {
    const optionCount = predictions.reduce((acc, current) => acc + current.options.length, 0);
    const decryptedBoards = predictions.filter((p) => p.clearCounts).length;
    return { optionCount, decryptedBoards };
  }, [predictions]);

  const refreshPredictions = () => setRefreshKey((prev) => prev + 1);

  const handleCreate = async (title: string, options: string[]) => {
    if (!addressReady) {
      throw new Error('Contract address is not configured yet.');
    }
    if (!signerPromise) {
      throw new Error('Connect a wallet first.');
    }

    setCreating(true);
    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer not available.');
      }

      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.createPrediction(title, options);
      await tx.wait();
      refreshPredictions();
    } finally {
      setCreating(false);
    }
  };

  const handleVote = async (predictionId: number, optionIndex: number) => {
    if (!instance || !address) {
      alert('Encryption service or wallet unavailable.');
      return;
    }
    if (!signerPromise) {
      alert('Connect your wallet to cast a vote.');
      return;
    }
    setVotingId(predictionId);

    try {
      const buffer = instance.createEncryptedInput(CONTRACT_ADDRESS, address);
      buffer.add32(optionIndex);
      const encrypted = await buffer.encrypt();

      const signer = await signerPromise;
      if (!signer) throw new Error('Signer unavailable');
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.submitEncryptedChoice(predictionId, encrypted.handles[0], encrypted.inputProof);
      await tx.wait();
      refreshPredictions();
    } catch (error) {
      console.error('Failed to submit encrypted choice', error);
      alert((error as Error).message || 'Unable to submit encrypted choice');
    } finally {
      setVotingId(null);
    }
  };

  const handleDecrypt = async (predictionId: number) => {
    if (!instance) {
      alert('Encryption service is still warming up.');
      return;
    }

    const target = predictions.find((item) => item.id === predictionId);
    if (!target) return;

    setDecryptingId(predictionId);
    try {
      const results = await instance.publicDecrypt(target.encryptedCounts);
      const clear = target.encryptedCounts.map((handle: string) => {
        const value = results.clearValues?.[handle];
        if (typeof value === 'bigint') return Number(value);
        if (typeof value === 'boolean') return value ? 1 : 0;
        return Number(value || 0);
      });

      setPredictions((prev) =>
        prev.map((item) => (item.id === predictionId ? { ...item, clearCounts: clear } : item)),
      );
    } catch (error) {
      console.error('Failed to decrypt tallies', error);
      alert((error as Error).message || 'Unable to decrypt tallies');
    } finally {
      setDecryptingId(null);
    }
  };

  return (
    <div className="app-shell">
      <Header />
      <main className="content">
        <section className="hero">
          <div>
            <p className="eyebrow">Encrypted prediction boards</p>
            <h2>Shape markets without revealing your pick</h2>
            <p className="subtext">
              Create questions, add two to four options, and collect Zama-encrypted selections.
              Tallies stay private on-chain until you choose to decrypt them with the relayer.
            </p>
            <div className="stat-row">
              <div className="stat-card">
                <p className="stat-label">Live predictions</p>
                <p className="stat-value">{predictions.length}</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">Encrypted options</p>
                <p className="stat-value">{metrics.optionCount}</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">Decrypted boards</p>
                <p className="stat-value">{metrics.decryptedBoards}</p>
              </div>
            </div>
          </div>
          <div className="status-stack">
            <div className="status-card">
              <div className="chip chip--muted">Zama Relayer</div>
              <p className="status-title">{zamaReady ? 'Ready' : 'Initializing encryption'}</p>
              <p className="helper-text">
                {zamaError ? zamaError : 'Relayer handles encryption, input proofs, and decryption.'}
              </p>
            </div>
            <div className="status-card">
              <div className="chip chip--muted">Network</div>
              <p className="status-title">{addressReady ? 'Contract configured' : 'Contract address missing'}</p>
              <p className="helper-text">
                {addressReady
                  ? 'Sepolia endpoint configured via Infura.'
                  : 'Add a deployed Sepolia address to enable reads and writes.'}
              </p>
            </div>
          </div>
        </section>

        <section className="action-grid">
          <PredictionForm
            onCreate={handleCreate}
            isCreating={creating}
            zamaReady={zamaReady}
            connected={isConnected}
          />
          <div className="surface card info-card">
            <p className="eyebrow">How it works</p>
            <h2 className="card__title">Encrypted participation</h2>
            <ul className="info-list">
              <li>
                Options stay on-chain as encrypted counts; viewers decrypt tallies through the Zama relayer.
              </li>
              <li>
                Voting happens entirely with encrypted inputs so the chain never sees which option a wallet picked.
              </li>
              <li>
                Each update re-grants ACL permissions and marks tallies publicly decryptable for open visibility.
              </li>
            </ul>
            <div className="tip">
              <span className="chip">Tip</span>
              Use the decrypt button on any card to fetch public proof-backed tallies.
            </div>
          </div>
        </section>

        <section className="list-section">
          <div className="card__header">
            <div>
              <p className="eyebrow">Markets</p>
              <h2 className="card__title">Active predictions</h2>
            </div>
            <button className="ghost-button" onClick={refreshPredictions}>
              Refresh
            </button>
          </div>

          {isLoading ? (
            <div className="surface card empty-card">
              <p className="helper-text">Loading encrypted predictions…</p>
            </div>
          ) : loadError ? (
            <div className="surface card alert alert--error">{loadError}</div>
          ) : (
            <PredictionList
              predictions={predictions}
              onVote={handleVote}
              onDecrypt={handleDecrypt}
              decryptingId={decryptingId}
              votingId={votingId}
              address={address}
              zamaReady={zamaReady}
            />
          )}
        </section>
      </main>
    </div>
  );
}
