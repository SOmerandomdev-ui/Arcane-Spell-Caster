type FrontendProps = {
  onSpellclick1: () => void;
  onSpellclick2: () => void;
  ClassName1?: string;
  ClassName2: string;
  isOn: boolean;
  SpellsActive: boolean;
};

/**
 * Landing screen: one full-bleed space composition with the brand as the
 * primary signal, a short line of guidance, and two clear actions.
 */
export function Frontend({
  onSpellclick1,
  onSpellclick2,
  ClassName1,
  ClassName2,
  isOn,
  SpellsActive,
}: FrontendProps) {
  if (isOn || SpellsActive) return null;

  return (
    <div className="Container" role="main">
      <div className="nebula nebula--cyan" aria-hidden="true" />
      <div className="nebula nebula--amber" aria-hidden="true" />
      <div className="space stars1" aria-hidden="true" />
      <div className="space stars2" aria-hidden="true" />
      <div className="space stars3" aria-hidden="true" />
      <div className="horizon-glow" aria-hidden="true" />

      <div className="hero">
        <p className="hero-eyebrow">Hand-tracked sorcery</p>
        <h1 className="Title">
          <span className="Title-brand">Arcane</span>
          <span className="Title-sub">Spell Caster</span>
        </h1>
        <p className="hero-lede">
          Cast fire, frost, and voids with your hands. Open the camera, or
          study the gestures first.
        </p>

        <div className="cta-row">
          <button
            type="button"
            className={ClassName1 ?? "OnButton"}
            onClick={onSpellclick1}
          >
            Open camera
          </button>
          <button
            type="button"
            className={ClassName2}
            onClick={onSpellclick2}
          >
            View spells
          </button>
        </div>
      </div>
    </div>
  );
}
