"use client";
import dynamic from "next/dynamic";

// three.js is only fetched in the browser, after the page (and the analysis tool) is interactive.
const HeroScene = dynamic(() => import("./HeroScene"), { ssr: false, loading: () => <div className="hero-stage" /> });
export default HeroScene;
