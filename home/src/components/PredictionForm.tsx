import { useState } from 'react';
import type { FormEvent } from 'react';
import '../styles/PredictionApp.css';

type PredictionFormProps = {
  onCreate: (title: string, options: string[]) => Promise<void>;
  isCreating: boolean;
  zamaReady: boolean;
  connected: boolean;
};

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;

export function PredictionForm({ onCreate, isCreating, zamaReady, connected }: PredictionFormProps) {
  const [title, setTitle] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [error, setError] = useState<string | null>(null);

  const updateOption = (index: number, value: string) => {
    const next = [...options];
    next[index] = value;
    setOptions(next);
  };

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    setOptions([...options, '']);
  };

  const removeOption = (index: number) => {
    if (options.length <= MIN_OPTIONS) return;
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const cleanTitle = title.trim();
    const trimmedOptions = options.map((opt) => opt.trim()).filter((opt) => opt.length > 0);

    if (!cleanTitle) {
      setError('Add a headline for the prediction.');
      return;
    }

    if (trimmedOptions.length < MIN_OPTIONS || trimmedOptions.length > MAX_OPTIONS) {
      setError('Use between 2 and 4 options.');
      return;
    }

    try {
      await onCreate(cleanTitle, trimmedOptions);
      setTitle('');
      setOptions(['', '']);
    } catch (err) {
      setError((err as Error).message || 'Unable to create prediction');
    }
  };

  return (
    <div className="surface card">
      <div className="card__header">
        <div>
          <p className="eyebrow">Create</p>
          <h2 className="card__title">New encrypted prediction</h2>
        </div>
        <div className="chip chip--muted">{MIN_OPTIONS}-{MAX_OPTIONS} options</div>
      </div>

      <form className="form" onSubmit={handleSubmit}>
        <label className="form__label">
          Prediction title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., BTC price above $60k this month?"
            className="form__input"
            required
          />
        </label>

        <div className="form__label">
          Options
          <div className="options-editor">
            {options.map((opt, index) => (
              <div key={index} className="option-row">
                <input
                  value={opt}
                  onChange={(e) => updateOption(index, e.target.value)}
                  placeholder={`Option ${index + 1}`}
                  className="form__input"
                  required
                />
                <div className="option-row__actions">
                  {options.length > MIN_OPTIONS && (
                    <button
                      type="button"
                      onClick={() => removeOption(index)}
                      className="ghost-button"
                      aria-label={`Remove option ${index + 1}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="option-controls">
            <button type="button" onClick={addOption} className="secondary-button" disabled={options.length >= MAX_OPTIONS}>
              + Add option
            </button>
            <span className="helper-text">
              Each selection will be encrypted with Zama before hitting the chain.
            </span>
          </div>
        </div>

        {error ? <div className="alert alert--error">{error}</div> : null}

        <button
          type="submit"
          className="primary-button"
          disabled={isCreating || !connected || !zamaReady}
        >
          {isCreating ? 'Submitting to chain…' : !connected ? 'Connect wallet to publish' : !zamaReady ? 'Loading encryption' : 'Launch prediction'}
        </button>
      </form>
    </div>
  );
}
