import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header__inner">
        <div className="header__brand">
          <div className="header__mark">VM</div>
          <div>
            <p className="header__eyebrow">Fully encrypted prediction flows</p>
            <h1 className="header__title">Veil Markets</h1>
          </div>
        </div>
        <div className="header__actions">
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
