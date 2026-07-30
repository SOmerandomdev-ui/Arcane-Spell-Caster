import * as tf from "@tensorflow/tfjs";

/*let model = tf.sequential()

//layers for the model
model.add(tf.layers.dense({inputShape: [42], units: 32, activation: "relu"}))
model.add(tf.layers.dense({units: 16, activation: "relu"}))
model.add(tf.layers.dense({units: 1, activation: "sigmoid"}))



//complie the model 
model.compile({optimizer: tf.train.adam(0.001), loss: "binaryCrossentropy", metrics: ["accuracy"]})
*/

//turns that data into something the model can use
export function samplestoTensors(samples: {features: number[]; isMatch: boolean} []) {
    //maps through the features and turns the data into something the computer can use 
    const xs = tf.tensor2d(samples.map((s) => s.features))
    const ys = tf.tensor2d(samples.map((s) => [s.isMatch ? 1 : 0]))

    return {xs, ys}
}

//samples for the data 
/*
let jsondata = await fetch ('/samples (2).json')    
let mySamples: {features: number[]; isMatch: boolean}[] = await jsondata.json()

const { xs, ys } = samplestoTensors(mySamples)
*/

//train the model 

/*
export async function train() {
    await model.fit(xs, ys, {epochs: 100, batchSize: 16, validationSplit: 0.2, shuffle: true, callbacks: {
        onEpochEnd: (epoch, logs) => {
          console.log(`epoch ${epoch}: loss=${logs?.loss?.toFixed(4)} acc=${logs?.acc?.toFixed(4)}`);
        },
      },})}
*/

//save the model 
//await model.save("downloads://gesture-model");

//Load model 
let model: tf.LayersModel | null = null;

export async function loadGestureModel() {
  model = await tf.loadLayersModel("/gesture-model.json");
  console.log("model loaded");
}

export function predictPose(features: number[]): number {
  if (!model) return 0;
  const input = tf.tensor2d([features]);
  const out = model.predict(input) as tf.Tensor;
  const score = out.dataSync()[0];
  input.dispose();
  out.dispose();
  return score;
}

//shared flag so the tracker overlay can react to the pose the spell manager detected
let poseActive = false;

export function setPoseActive(active: boolean) {
  poseActive = active;
}

export function isPoseActive(): boolean {
  return poseActive;
}