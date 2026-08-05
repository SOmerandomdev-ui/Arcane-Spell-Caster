import { useState } from "react";

export function Frontend({onSpellclick1, onSpellclick2, ClassName1, ClassName2, isOn, SpellsActive}: 
    {onSpellclick1: () => void; onSpellclick2: () => void; ClassName1?: string; ClassName2: string, isOn: boolean, SpellsActive: boolean}) {
    
    return (!isOn && !SpellsActive && (
        <div className="Container">
            <div className=" space stars1"></div>
            <div className="space stars2"></div>
            <div className="space stars3"></div>

            <div className="Title"> Arcane Spell Casting </div>
            <button className={ClassName1} style={{
                position: "absolute",
                overflow: "hidden",
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-start",
                border: "1px solid rgb(26, 26, 138)",
                
            }}
                onClick={onSpellclick1}
            > Turn Camera On </button>

            <button className={ClassName2} style={{
                position: "absolute",
                overflow: "hidden",
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-start",
                border: "1px solid rgb(26, 26, 138)",
            }}
            onClick={onSpellclick2}
            
            > Spells </button>

        </div>
    ))
}

