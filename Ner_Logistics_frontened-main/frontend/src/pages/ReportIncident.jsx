import PageShell from '../components/PageShell.jsx';
import desktopHtml from '../fragments/desktop-report.html?raw';
import mobileHtml from '../fragments/mobile-report.html?raw';

export default function ReportIncident() {
  return <PageShell desktopHtml={desktopHtml} mobileHtml={mobileHtml} />;
}
