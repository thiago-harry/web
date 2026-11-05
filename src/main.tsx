import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import PitchCronograma from "@/pages/PitchCronograma";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PitchCronograma />
  </StrictMode>,
);
