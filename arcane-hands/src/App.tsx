import { HandTracker } from "./components/HandTracker/handtracker.tsx";
import { loadGestureModel } from "./gestures_model/gesturemodel.ts";

//pull the trained pose weights in once, before any frame asks for a prediction
void loadGestureModel().catch((error: unknown) => {
  console.warn("Gesture model could not be loaded, pose spells stay off", error);
});

function App() {
  return <HandTracker />;
}

export default App;
