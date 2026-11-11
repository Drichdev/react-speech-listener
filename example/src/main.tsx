import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Dictaphone } from "./Dictaphone";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Dictaphone />
  </StrictMode>,
);
