import ShieldHand from "../assets/ShieldHand.png";
import Lightning from "../assets/LightningHand.png"
import FireBall from "../assets/FireBallHand.png"
import BlackHole from "../assets/BlackHoleHand.png"
import RedOrb from "../assets/RedOrb.png"
import InfiniteVoid from "../assets/InfiniteVoidHand.png"

export function ShowSpells({isOn, SpellsActive, Back}: {isOn: boolean, SpellsActive: boolean, Back: () => void}) {
    return (SpellsActive && (
        <div style={{
            display: "flex", 
            flexDirection: "row",
            justifyContent: "center",
            marginTop: "9vh",
            gap: "1vw"}}> 

            <button onClick={Back} className="Back" style={{
                position: "absolute",
                overflow: "hidden",
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-start",
                border: "1px solid rgb(26, 26, 138)",
            }}> Back </button>

            <div className="SpellBox">
                <div className="SpellTitle"> Frost Shield</div>
                <div className="Hand"> Hand Placement</div>
                <img src={ShieldHand} alt="Shield hand" />
                <div className="SpellDescription">Creates a shield when you put your palm in front of the screen</div>
            </div>

            <div className="SpellBox">
                <div className="SpellTitle"> Lightning</div>
                <div className="Hand"> Hand Placement</div>
                <img src={Lightning} alt="Lightning hand" />
                <div className="SpellDescription">Place your hands horizontally with your fingers pointing at each other and spreaded out</div>
            </div>
            <div className="SpellBox">
                <div className="SpellTitle"> Fireball </div>
                <div className="Hand"> Hand Placement</div>
                <img src={FireBall} alt="Fireball hand" />
                <div className="SpellDescription">Place one or two of your hands to the side with the palm facing up</div>
            </div>
            <div className="SpellBox">
                <div className="SpellTitle"> RedOrb </div>
                <div className="Hand"> Hand Placement</div>
                <img src={RedOrb} alt="RedOrb hand" />
                <div className="SpellDescription">Close your hand into a fist and point your index finger up</div>
            </div>
            <div className="SpellBox">
                <div className="SpellTitle"> BlackHole </div>
                <div className="Hand"> Hand Placement</div>
                <img src={BlackHole} alt="Blackhole Hand" />
                <div className="SpellDescription">Place one hand facing upwards and one hand above it facing downwards</div>
            </div>
            <div className="SpellBox">
                <div className="SpellTitle"> BlackHole </div>
                <div className="Hand"> Hand Placement</div>
                <img src={InfiniteVoid} alt="Infinitevoid hand" />
                <div className="SpellDescription">Assume this pose with one of your hands and hold it for 2 seconds </div>
            </div>
        </div>
    ))
}