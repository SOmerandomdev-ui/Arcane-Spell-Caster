import {useEffect, useRef } from "react";

export function CameraRender() {
    //Points to a video element 
    const VideoRef = useRef<HTMLVideoElement>(null)

    //Runs when camera is mounted onto the page
    useEffect(() => {
        let stream: MediaStream | null = null;

        //async function for when permission is given to access camera 
        async function start() {
            //asks permission for camera
            stream = await navigator.mediaDevices.getUserMedia({
                //type of media to use
                video: { facingMode: "user" },
                audio: false,
                })

                //Confirms that videoref 
                if (VideoRef.current) {
                    VideoRef.current.srcObject = stream 
                    await VideoRef.current.play()
                }
        }

        start()

        //runs on unmount and iterates through the stream tracks (audio and video) and stops them 
        return () => {
            stream?.getTracks().forEach((t) => t.stop());
        };

    //square brackets ensure this effect only runs on mount 
    }, []);

    return <video 
        ref={VideoRef} 
        autoPlay 
        playsInline
        style={{width: "1980px", height: "1000px"}}
        /> 

}