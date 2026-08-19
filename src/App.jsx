import React, { useEffect, useState } from "react";
import ThriftByEugy from "./ThriftByEugy.jsx";
import AdminUpload from "./AdminUpload.jsx";
import SpinViewerDemo from "./SpinViewer.jsx";

// Tiny hash router: #/admin shows the admin panel, #/spin the 360° viewer
// demo, everything else the storefront.
export default function App() {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (hash === "#/admin") return <AdminUpload />;
  if (hash === "#/spin") return <SpinViewerDemo />;
  return <ThriftByEugy />;
}
