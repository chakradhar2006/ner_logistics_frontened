import morePanelHtml from '../fragments/more-panel.html?raw';

export default function MoreMenu() {
  return <div className="mobile-only" dangerouslySetInnerHTML={{ __html: morePanelHtml }} />;
}
