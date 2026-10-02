import { SimLink } from "../components/ui";
import { MODEL } from "../engine/model";

export default function About() {
  return (
    <div className="prose">
      <div className="kicker">About</div>
      <h1 style={{ fontSize: "clamp(1.8rem, 4.5vw, 2.8rem)", marginTop: 4 }}>Henkelpott</h1>
      <p className="muted" style={{ marginTop: 10 }}>
        "Henkelpott" is the German nickname for the Champions League trophy: the pot with handles, the big ears. This is a prediction engine for the 2026/27 season.
      </p>

      <h2>01 · The prediction engine</h2>
      <p>
        A Dixon-Coles goals model gives every club an attack and a defence rating, fit on {MODEL.data.matchesFit.toLocaleString("en-GB")} matches with recent results counting
        most. European fixtures tie the domestic leagues together, so a Norwegian champion and a Premier League side are rated on one scale. Across five held-out
        Champions League seasons combined, it beats an Elo baseline. <SimLink to="/methodology">Read the methodology.</SimLink>
      </p>

      <h2>02 · The simulation</h2>
      <p>
        One 36-club Swiss-model league phase with the real draw: eight different opponents each, four at home. UEFA tie-breakers decide the table; 1st–8th go straight
        through, 9th–24th meet in a two-legged play-off, and the bracket follows UEFA's fixed seeded paths. Every knockout round is two legs with extra time and penalties
        in the second leg; the final is one match on neutral ground in Madrid. <em>Season to date</em> locks in matches already played.
      </p>

      <h2>03 · The data</h2>
      <p>
        Results from football-data.co.uk and the public-domain openfootball project, the 2026/27 fixture list from uefa.com, all fit offline in Python and frozen into the
        site. Player squads are placeholders, so scorer names read like "Liverpool No. 9" until real registered lists are added.
      </p>

      <h2>04 · The design</h2>
      <p>
        An original navy and silver palette. Club badges are generated shields in kit-inspired colours with the club's three-letter code. There are no official crests,
        UEFA marks, starball or anthem references.
      </p>

      <h2>05 · The stack</h2>
      <p>
        React and TypeScript on Vite, deployed as static files. The Monte Carlo engine runs in a pool of Web Workers so re-simulating never blocks the page, and every
        view carries its seed in the URL so a link reproduces the exact run. Model fitting is Python (numpy, scipy).
      </p>

      <h2>Disclaimer</h2>
      <p>
        Henkelpott is an independent project, not affiliated with or endorsed by UEFA, the UEFA Champions League, or any club. Club names are used only to identify the
        teams. Probabilities are model estimates for entertainment and analysis, not betting advice.
      </p>
    </div>
  );
}
