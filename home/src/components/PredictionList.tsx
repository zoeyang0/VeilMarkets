import '../styles/PredictionApp.css';

export type PredictionRecord = {
  id: number;
  title: string;
  options: string[];
  encryptedCounts: string[];
  clearCounts?: number[];
  createdAt: number;
  creator: string;
  hasVoted: boolean;
};

type PredictionListProps = {
  predictions: PredictionRecord[];
  onVote: (predictionId: number, optionIndex: number) => Promise<void>;
  onDecrypt: (predictionId: number) => Promise<void>;
  decryptingId: number | null;
  votingId: number | null;
  address?: string;
  zamaReady: boolean;
};

function shortenAddress(address?: string) {
  if (!address) return '';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatDate(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PredictionList({
  predictions,
  onVote,
  onDecrypt,
  decryptingId,
  votingId,
  address,
  zamaReady,
}: PredictionListProps) {
  if (!predictions.length) {
    return (
      <div className="surface card empty-card">
        <div>
          <p className="eyebrow">No boards yet</p>
          <h3 className="card__title">Spin up the first encrypted market</h3>
          <p className="helper-text">Create a prediction above and let everyone submit fully private choices.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="prediction-grid">
      {predictions.map((prediction) => (
        <div key={prediction.id} className="surface card prediction-card">
          <div className="card__header">
            <div>
              <p className="eyebrow">Prediction #{prediction.id + 1}</p>
              <h3 className="card__title">{prediction.title}</h3>
            </div>
            <div className="chip">{formatDate(prediction.createdAt)}</div>
          </div>
          <div className="card__meta">
            <span className="helper-text">Creator: {shortenAddress(prediction.creator)}</span>
            <span className="status-pill">
              {prediction.hasVoted ? 'You already voted' : 'Awaiting your encrypted pick'}
            </span>
          </div>

          <div className="options-grid">
            {prediction.options.map((option, index) => {
              const decrypted = prediction.clearCounts?.[index];
              const encryptedHandle = prediction.encryptedCounts[index];
              return (
                <div key={option + index} className="option-tile">
                  <div>
                    <p className="option-label">Option {index + 1}</p>
                    <p className="option-title">{option}</p>
                    <p className="encrypted-hint">
                      {decrypted !== undefined ? (
                        <span className="count-badge">{decrypted} selections</span>
                      ) : (
                        <span>Encrypted tally · {encryptedHandle.slice(0, 10)}…</span>
                      )}
                    </p>
                  </div>
                  <button
                    className="secondary-button"
                    disabled={
                      prediction.hasVoted ||
                      votingId === prediction.id ||
                      !address ||
                      !zamaReady
                    }
                    onClick={() => onVote(prediction.id, index)}
                  >
                    {prediction.hasVoted
                      ? 'Submitted'
                      : votingId === prediction.id
                        ? 'Encrypting...'
                        : !address
                          ? 'Connect wallet'
                          : 'Encrypt vote'}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="card__footer">
            <div className="helper-text">
              Decrypt with Zama relayer to reveal the tallies. Everyone sees the same result while inputs stay private.
            </div>
            <button
              className="ghost-button"
              onClick={() => onDecrypt(prediction.id)}
              disabled={decryptingId === prediction.id || !zamaReady}
            >
              {decryptingId === prediction.id ? 'Decrypting...' : 'Decrypt tallies'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
