import topbarHtml from '../fragments/topbar.html?raw';

export default function Topbar() {
  return <div dangerouslySetInnerHTML={{ __html: topbarHtml }} />;
}
