import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { runCommands } from "./commands";
import SpeechRecognition from "./SpeechRecognition";
import type { UseSpeechRecognitionOptions, UseSpeechRecognitionReturn } from "./types";
import { concatTranscripts } from "./utils";

interface TranscriptState {
  interimTranscript: string;
  finalTranscript: string;
}

type TranscriptAction =
  | { type: "clear" }
  | { type: "append"; interim: string; final: string };

const transcriptReducer = (state: TranscriptState, action: TranscriptAction): TranscriptState => {
  if (action.type === "clear") {
    return state.interimTranscript === "" && state.finalTranscript === ""
      ? state // même référence : pas de re-render inutile
      : { interimTranscript: "", finalTranscript: "" };
  }
  if (action.final === "" && action.interim === state.interimTranscript) return state;
  return {
    interimTranscript: action.interim,
    finalTranscript: concatTranscripts(state.finalTranscript, action.final),
  };
};

export const useSpeechRecognition = ({
  transcribing = true,
  clearTranscriptOnListen = true,
  commands,
}: UseSpeechRecognitionOptions = {}): UseSpeechRecognitionReturn => {
  const [manager] = useState(() => SpeechRecognition.getRecognitionManager());

  // État global du micro, sans « tearing » et sûr en SSR.
  const recognitionState = useSyncExternalStore(
    manager.subscribe,
    manager.getState,
    manager.getServerState,
  );

  const [{ interimTranscript, finalTranscript }, dispatch] = useReducer(transcriptReducer, {
    interimTranscript: manager.getInterimTranscript(),
    finalTranscript: "",
  });

  // Les options passent par des refs : l'abonnement reste stable à chaque rendu.
  const commandsRef = useRef(commands);
  commandsRef.current = commands;
  const transcribingRef = useRef(transcribing);
  transcribingRef.current = transcribing;
  const clearOnListenRef = useRef(clearTranscriptOnListen);
  clearOnListenRef.current = clearTranscriptOnListen;

  // Reflète synchronement ce que vaudra l'état intermédiaire une fois tous les dispatch traités.
  // Permet d'éviter de relancer un rendu pour un résultat identique (useReducer n'a pas
  // d'abandon anticipé comme useState).
  const interimRef = useRef(interimTranscript);

  const resetTranscript = useCallback(() => {
    manager.resetTranscript();
    interimRef.current = "";
    dispatch({ type: "clear" });
  }, [manager]);

  useEffect(
    () =>
      manager.subscribeTranscript({
        onTranscript: (interim, final) => {
          if (transcribingRef.current && (final !== "" || interim !== interimRef.current)) {
            interimRef.current = interim;
            dispatch({ type: "append", interim, final });
          }
          const list = commandsRef.current;
          if (list && list.length > 0) runCommands(list, interim, final, resetTranscript);
        },
        onClear: () => {
          if (clearOnListenRef.current) {
            interimRef.current = "";
            dispatch({ type: "clear" });
          }
        },
      }),
    [manager, resetTranscript],
  );

  return useMemo(
    () => ({
      transcript: concatTranscripts(finalTranscript, interimTranscript),
      interimTranscript,
      finalTranscript,
      resetTranscript,
      ...recognitionState,
    }),
    [finalTranscript, interimTranscript, resetTranscript, recognitionState],
  );
};
