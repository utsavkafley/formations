import { useEffect, useState } from "react";
import Poll from "./Poll.jsx";
import Builder from "./Builder.jsx";

// Tiny path router (no dependency). `/` is the shareable poll landing so link
// previews in group chats point at the next game's RSVP; `/build` is the
// organizer's formation tool.
function viewFor(pathname) {
  return pathname.replace(/\/+$/, "") === "/build" ? "build" : "poll";
}

export default function App() {
  const [view, setView] = useState(() => viewFor(window.location.pathname));

  useEffect(() => {
    const onPop = () => setView(viewFor(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function navigate(path) {
    if (path !== window.location.pathname) window.history.pushState({}, "", path);
    setView(viewFor(path));
    window.scrollTo(0, 0);
  }

  return view === "build" ? <Builder onNavigate={navigate} /> : <Poll onNavigate={navigate} />;
}
