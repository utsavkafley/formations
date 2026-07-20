// Vercel Edge Function — the link-preview image (1200×630).
// Renders the next game (date · location · time) with live IN/OUT counts, so a
// shared link unfurls with a branded, current card. Referenced as og:image by
// middleware.js. Degrades to a plain text card if this ever errors.
import React from "react";
import { ImageResponse } from "@vercel/og";
import { TZ, nextGame, prettyTime } from "../lib/edge-schedule.js";

export const config = { runtime: "edge" };

const h = React.createElement;

const longDate = (d) =>
  d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: TZ });

async function loadFont(weight) {
  const res = await fetch(
    `https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-${weight}-normal.woff`,
  );
  return res.arrayBuffer();
}

export default async function handler() {
  const g = nextGame();

  let time = g.slot.time;
  let location = g.slot.location;
  let inCount = 0;
  let outCount = 0;
  let guestCount = 0;

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (url && key) {
    try {
      const headers = { apikey: key, Authorization: `Bearer ${key}` };
      const [vr, gr, mr] = await Promise.all([
        fetch(`${url}/rest/v1/votes?select=status&game_date=eq.${g.date}`, { headers }),
        fetch(`${url}/rest/v1/guests?select=id&game_date=eq.${g.date}`, { headers }),
        fetch(`${url}/rest/v1/game_meta?select=time,location,opened_manually&game_date=eq.${g.date}`, { headers }),
      ]);
      const votes = await vr.json();
      const guests = await gr.json();
      const metas = await mr.json();
      if (Array.isArray(votes)) {
        inCount = votes.filter((v) => v.status === "in").length;
        outCount = votes.filter((v) => v.status === "out").length;
      }
      if (Array.isArray(guests)) guestCount = guests.length;
      if (Array.isArray(metas) && metas[0]) {
        time = metas[0].time || time;
        location = metas[0].location || location;
      }
    } catch {
      /* schedule-only image */
    }
  }

  const [f800, f600] = await Promise.all([loadFont("800"), loadFont("600")]);
  const muted = "#93a1b1";

  const tree = h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#0a0e13",
        color: "#eaf0f6",
        padding: "70px 76px",
        fontFamily: "Inter",
      },
    },
    h("div", {
      style: { position: "absolute", top: 0, left: 0, right: 0, height: 12, background: "linear-gradient(90deg,#22c55e,#fbbf24)", display: "flex" },
    }),
    h("div", { style: { display: "flex", color: "#22c55e", fontSize: 30, fontWeight: 800, letterSpacing: 4 } }, "PICKUP · NEXT GAME"),
    h("div", { style: { display: "flex", fontSize: 78, fontWeight: 800, marginTop: 18, lineHeight: 1.05 } }, longDate(g.when)),
    h(
      "div",
      { style: { display: "flex", gap: 20, marginTop: 26, fontSize: 38, fontWeight: 600, color: muted } },
      h("div", { style: { display: "flex" } }, prettyTime(time)),
      h("div", { style: { display: "flex" } }, "·"),
      h("div", { style: { display: "flex" } }, location),
    ),
    h("div", { style: { display: "flex", flex: 1 } }),
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 18, fontSize: 44, fontWeight: 800 } },
      h("div", { style: { display: "flex", color: "#22c55e" } }, `${inCount + guestCount} IN`),
      h("div", { style: { display: "flex", color: muted } }, "·"),
      h("div", { style: { display: "flex", color: "#fb7185" } }, `${outCount} OUT`),
      h("div", { style: { display: "flex", color: muted, fontSize: 30, fontWeight: 600, marginLeft: 8 } }, "— tap to RSVP"),
    ),
  );

  return new ImageResponse(tree, {
    width: 1200,
    height: 630,
    fonts: [
      { name: "Inter", data: f800, weight: 800, style: "normal" },
      { name: "Inter", data: f600, weight: 600, style: "normal" },
    ],
  });
}
