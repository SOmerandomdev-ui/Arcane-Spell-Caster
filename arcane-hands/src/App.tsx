import { HandTracker } from "./components/HandTracker/handtracker.tsx";
import { loadGestureModel } from "./gestures_model/gesturemodel.ts";
import {Frontend} from "./components/frontend.tsx"
import {ShowSpells} from "./components/spellinfo.tsx"
import { useState } from "react";

//pull the trained pose weights in once, before any frame asks for a prediction
void loadGestureModel().catch((error: unknown) => {
  console.warn("Gesture model could not be loaded, pose spells stay off", error);
});

function App() {
  const [SpellsActive, setSpellsActive] = useState(false)
  const [isOn, setisOn] = useState(false)
  return (
  <>
    <Frontend 
      ClassName1={"OnButton"} 
      ClassName2={"Spells"} 
      onSpellclick1={() => setisOn(true)}
      onSpellclick2={() => setSpellsActive(true)}
      isOn={isOn}
      SpellsActive={SpellsActive}
    /> 
    <ShowSpells isOn={isOn} SpellsActive={SpellsActive}/> 
    <HandTracker isOn={isOn} SpellsActive={SpellsActive} />
  </>
  )
}

export default App;
