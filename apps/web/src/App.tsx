import { Admin } from "./pages/Admin";
import { Home } from "./pages/Home";
import { Join } from "./pages/Join";
import { NewSheet } from "./pages/NewSheet";
import { SheetPage } from "./pages/sheet/SheetPage";

export function App() {
  const path = location.pathname;
  if (/^\/(new|check)\/?$/.test(path)) return <NewSheet />;
  if (/^\/join\/?$/.test(path)) return <Join />;
  if (/^\/admin\/?$/.test(path)) return <Admin />;
  const sheet = /^\/s\/([^/]+)\/?$/.exec(path);
  if (sheet) return <SheetPage id={decodeURIComponent(sheet[1]!)} />;
  return <Home />;
}
