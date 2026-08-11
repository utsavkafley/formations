import { useEffect, useState } from "react";
import Poll from "./Poll.jsx";
import Builder from "./Builder.jsx";
import Players from "./Players.jsx";

// Tiny path router (no dependency). `/` is the shareable poll landing so link
// previews in group chats point at the next game's RSVP; `/build` is the
// formation tool and `/players` shows the crowd-sourced profiles.
function viewFor(pathname) {
  const path = pathname.replace(/\/+$/, "");
  if (path === "/build") return "build";
  if (path === "/players") return "players";
  return "poll";
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

  if (view === "build") return <Builder onNavigate={navigate} />;
  if (view === "players") return <Players onNavigate={navigate} />;
  return <Poll onNavigate={navigate} />;
}
