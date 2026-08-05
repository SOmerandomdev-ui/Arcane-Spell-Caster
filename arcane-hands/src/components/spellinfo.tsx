import ShieldHand from "../assets/ShieldHand.png";
import Lightning from "../assets/LightningHand.png";
import FireBall from "../assets/FireBallHand.png";
import BlackHole from "../assets/BlackHoleHand.png";
import RedOrb from "../assets/RedOrb.png";
import InfiniteVoid from "../assets/InfiniteVoidHand.png";

type Spell = {
  title: string;
  hand: string;
  image: string;
  alt: string;
  description: string;
  tone: "frost" | "volt" | "ember" | "crimson" | "void" | "domain";
};

const SPELLS: Spell[] = [
  {
    title: "Frost Shield",
    hand: "Palm toward screen",
    image: ShieldHand,
    alt: "Palm facing the camera for Frost Shield",
    description: "Raise an open palm toward the screen to form a frost barrier.",
    tone: "frost",
  },
  {
    title: "Lightning",
    hand: "Two hands, fingers out",
    image: Lightning,
    alt: "Two hands horizontal for Lightning",
    description:
      "Hold both hands sideways with fingers spread and tips aimed at each other.",
    tone: "volt",
  },
  {
    title: "Fireball",
    hand: "Palm facing up",
    image: FireBall,
    alt: "Upward palm for Fireball",
    description: "Turn one or both palms skyward to summon a flame.",
    tone: "ember",
  },
  {
    title: "Red Orb",
    hand: "Index pointing up",
    image: RedOrb,
    alt: "Fist with index finger up for Red Orb",
    description: "Close your hand into a fist and point your index finger upward.",
    tone: "crimson",
  },
  {
    title: "Black Hole",
    hand: "One up, one down",
    image: BlackHole,
    alt: "Stacked palms for Black Hole",
    description:
      "Face one palm up and place the other above it facing down.",
    tone: "void",
  },
  {
    title: "Infinite Void",
    hand: "Hold pose 2 seconds",
    image: InfiniteVoid,
    alt: "Domain expansion hand sign for Infinite Void",
    description:
      "Hold the trained domain sign for two seconds to open the void.",
    tone: "domain",
  },
];

type ShowSpellsProps = {
  isOn: boolean;
  SpellsActive: boolean;
  Back: () => void;
};

export function ShowSpells({ isOn, SpellsActive, Back }: ShowSpellsProps) {
  if (!SpellsActive || isOn) return null;

  return (
    <div className="spell-screen" role="main">
      <div className="nebula nebula--cyan" aria-hidden="true" />
      <div className="nebula nebula--amber" aria-hidden="true" />
      <div className="space stars1" aria-hidden="true" />
      <div className="space stars2" aria-hidden="true" />
      <div className="horizon-glow" aria-hidden="true" />

      <header className="spell-header">
        <button type="button" className="Back" onClick={Back}>
          ← Back
        </button>
        <div className="spell-header-copy">
          <p className="hero-eyebrow">Gesture codex</p>
          <h1 className="spell-heading">Spells</h1>
          <p className="spell-lede">
            Match the hand shape, then hold it steady in front of the camera.
          </p>
        </div>
      </header>

      <div className="spell-grid">
        {SPELLS.map((spell, index) => (
          <article
            key={spell.title}
            className={`SpellBox SpellBox--${spell.tone}`}
            style={{ animationDelay: `${index * 45}ms` }}
          >
            <h2 className="SpellTitle">{spell.title}</h2>
            <p className="Hand">{spell.hand}</p>
            <img src={spell.image} alt={spell.alt} loading="lazy" />
            <p className="SpellDescription">{spell.description}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
