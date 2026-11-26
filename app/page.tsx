import ScannerApp from './scanner-app';
import { getBuildInfo, repositoryUrl } from './build-info';

const buildInfo = getBuildInfo();

export default function Home() {
  return (
    <main className="site-shell">
      <header className="topbar">
        <h1><span className="brand-mark" aria-hidden="true">⌗</span>tagscanner</h1>
        <p>QR · 條碼 · 視覺標記</p>
      </header>
      <ScannerApp />
      <footer className="site-footer">
        <p className="privacy-statement">掃描與影像資料僅在此瀏覽器內處理，不會上傳。</p>
        <nav className="version-links" aria-label="版本與專案">
          <time dateTime={buildInfo.date} title={buildInfo.commit ? '版本日期（UTC+8）' : '建置日期（UTC+8）'}>{buildInfo.date}</time>
          {buildInfo.commit && (
            <a className="commit-hash" href={`${repositoryUrl}/commit/${buildInfo.commit}`} target="_blank" rel="noopener noreferrer" title="查看此版本">{buildInfo.shortHash}</a>
          )}
          <a href={repositoryUrl} target="_blank" rel="noopener noreferrer">GitHub</a>
          <a href={`${repositoryUrl}/issues`} target="_blank" rel="noopener noreferrer">Issues</a>
        </nav>
      </footer>
    </main>
  );
}
