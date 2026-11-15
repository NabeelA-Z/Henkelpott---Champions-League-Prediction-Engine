// The travel layer: landmark plates, entry stamps, match tickets. Club cities are the clubs' home
// cities; landmark photographs come from Wikimedia Commons (credits in data/landmarks.json).
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Plane } from "lucide-react";
import landmarks from "../data/landmarks.json";
import { CLUB, fmtPct, matchOdds } from "../engine/model";
import { Club, SimLink } from "./ui";

export type Landmark = { city: string; landmark: string; file: string; page: string; license: string; author: string };
export const LANDMARKS = landmarks as Record<string, Landmark>;

/** Club code → city slug (the club's home city). */
export const CLUB_CITY: Record<string, string> = {
  PSG: "paris", BAY: "munich", RMA: "madrid", LIV: "liverpool", INT: "milan", MCI: "manchester", ARS: "london", BAR: "barcelona",
  ATM: "madrid", BVB: "dortmund", ROM: "rome", SCP: "lisbon", AVL: "birmingham", POR: "porto", MUN: "manchester", BRU: "bruges",
  BET: "seville", PSV: "eindhoven", FEY: "rotterdam", LIL: "lille", BOD: "bodo", NAP: "naples", RBL: "leipzig", VIL: "villarreal",
  FEN: "istanbul", SHA: "donetsk", GAL: "istanbul", SLA: "prague", SLO: "bratislava", STU: "stuttgart", AEK: "athens", LAS: "linz",
  COM: "como", RCL: "lens", VIK: "stavanger", SAB: "baku",
};
const CITY_NAME: Record<string, string> = {
  paris: "Paris", munich: "Munich", madrid: "Madrid", liverpool: "Liverpool", milan: "Milan", manchester: "Manchester", london: "London",
  barcelona: "Barcelona", dortmund: "Dortmund", rome: "Rome", lisbon: "Lisbon", birmingham: "Birmingham", porto: "Porto", bruges: "Bruges",
  seville: "Seville", eindhoven: "Eindhoven", rotterdam: "Rotterdam", lille: "Lille", bodo: "Bodø", naples: "Naples", leipzig: "Leipzig",
  villarreal: "Villarreal", istanbul: "Istanbul", donetsk: "Donetsk", prague: "Prague", bratislava: "Bratislava", stuttgart: "Stuttgart",
  athens: "Athens", linz: "Linz", como: "Como", lens: "Lens", stavanger: "Stavanger", baku: "Baku",
};
export const cityOf = (code: string) => CITY_NAME[CLUB_CITY[code]] ?? CLUB[code]?.short ?? code;
/** Shakhtar have played their European home matches outside Ukraine since 2022. */
export const venueOf = (home: string) => (home === "SHA" ? "Shakhtar home, played outside Ukraine" : cityOf(home));

/** The club you follow, remembered on this device; its route is the one cobalt line across the app. */
const FOLLOW_KEY = "hp-follow";
export function useFollow(): [string | null, (code: string | null) => void] {
  const read = () => {
    try {
      const v = localStorage.getItem(FOLLOW_KEY);
      return v && CLUB[v] ? v : null;
    } catch {
      return null;
    }
  };
  const [code, setCode] = useState<string | null>(read);
  useEffect(() => {
    const sync = () => setCode(read());
    window.addEventListener("hp-follow", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("hp-follow", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const set = useCallback((c: string | null) => {
    try {
      if (c) localStorage.setItem(FOLLOW_KEY, c);
      else localStorage.removeItem(FOLLOW_KEY);
    } catch {
      /* storage unavailable: follow lasts for this page view */
    }
    setCode(c);
    window.dispatchEvent(new Event("hp-follow"));
  }, []);
  return [code, set];
}

/** A landmark printed as a navy duotone plate, like a visa page. */
export function Plate({ city, className, caption = true, eager }: { city: string; className?: string; caption?: boolean; eager?: boolean }) {
  const lm = LANDMARKS[city];
  return (
    <figure className={`plate${className ? ` ${className}` : ""}`}>
      {lm && <img src={`/landmarks/${city}.jpg`} alt={`${lm.landmark}, ${lm.city}`} loading={eager ? "eager" : "lazy"} decoding="async" />}
      {caption && (
        <figcaption>
          <span>{lm ? lm.landmark : CITY_NAME[city] ?? city}</span>
          {lm && <span className="plate-city">{lm.city}</span>}
        </figcaption>
      )}
    </figure>
  );
}

/** An entry stamp. tone: ink (default), route (the followed club), void (eliminated), ghost (not reached). */
export function Stamp({ label, value, tone = "ink", tilt = 0, i = 0, big }: {
  label: ReactNode; value?: ReactNode; tone?: "ink" | "route" | "void" | "ghost"; tilt?: number; i?: number; big?: boolean;
}) {
  return (
    <span className={`stamp ${tone}${big ? " big" : ""}`} style={{ "--r": `${tilt}deg`, "--i": i } as CSSProperties}>
      <span className="stamp-l">{label}</span>
      {value !== undefined && <span className="stamp-v">{value}</span>}
    </span>
  );
}

const fmtDay = (d: string) => new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** A league-phase fixture as an airline ticket: away city → home city, with the model's 1X2. */
export function FixtureTicket({ home, away, md, date, result }: { home: string; away: string; md: number; date: string; result?: [number, number] }) {
  const o = matchOdds(home, away, "home");
  return (
    <article className="ticket">
      <div className="ticket-main">
        <Plate city={CLUB_CITY[home]} className="ticket-plate" caption={false} />
        <div className="ticket-head">
          <span>Matchday {md}</span>
          <span>{fmtDay(date)}</span>
        </div>
        <div className="ticket-route" aria-label={`${CLUB[away].name} travel from ${cityOf(away)} to ${venueOf(home)}`}>
          <span className="iata">{CLUB[away].code}</span>
          <span className="flight" aria-hidden="true"><Plane size={14} strokeWidth={2} /></span>
          <span className="iata">{CLUB[home].code}</span>
        </div>
        <div className="ticket-cities">
          <span>{cityOf(away)}</span>
          <span>{venueOf(home)}</span>
        </div>
        <div className="ticket-clubs">
          <Club code={home} short size={18} />
          <span className="faint">v</span>
          <Club code={away} short size={18} />
        </div>
      </div>
      <div className="ticket-stub">
        {result ? (
          <>
            <span className="field-l">Full time</span>
            <span className="carbon big">{result[0]}–{result[1]}</span>
            <span className="tag solid">Played</span>
          </>
        ) : (
          <>
            <span className="field-l">{CLUB[home].code} · X · {CLUB[away].code}</span>
            <span className="carbon">{fmtPct(o.wdl.home, 0)}</span>
            <span className="carbon dim">{fmtPct(o.wdl.draw, 0)}</span>
            <span className="carbon dim">{fmtPct(o.wdl.away, 0)}</span>
            <SimLink to={`/predict?mode=match&a=${home}&b=${away}`} className="ticket-link">Open tie</SimLink>
          </>
        )}
      </div>
    </article>
  );
}
