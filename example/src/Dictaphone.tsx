import { useState, useRef, useEffect } from "react";
import SpeechRecognition, {
  useSpeechRecognition,
  type SpeechCommand,
} from "react-speech-listener";
import { LuAudioLines, LuSquare, LuTrash2 } from "react-icons/lu";
import "./style.css";

const LANGUAGES = [
  { tag: "fr-FR", label: "Français" },
  { tag: "en-US", label: "English (US)" },
  { tag: "es-ES", label: "Español" },
];

export function Dictaphone() {
  const [language, setLanguage] = useState("fr-FR");
  const [continuous, setContinuous] = useState(true);
  const [lastCommand, setLastCommand] = useState("—");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const commands: SpeechCommand[] = [
    {
      command: "efface tout",
      callback: ({ resetTranscript }) => resetTranscript(),
    },
    {
      command: "écris *",
      callback: (text: string) => setLastCommand(`écrire : « ${text} »`),
    },
    {
      command: ["hello", "hallo", "bonjour", "salut"],
      callback: ({ command }) => setLastCommand(`hi (${command})`),
      matchInterim: true,
    },
    {
      command: "Paris",
      callback: (_c, spoken, similarity) =>
        setLastCommand(
          `flou : « ${spoken} » (${Math.round(similarity * 100)} %)`,
        ),
      isFuzzyMatch: true,
      fuzzyMatchingThreshold: 0.6,
    },
  ];

  const {
    transcript,
    interimTranscript,
    listening,
    resetTranscript,
    isMicrophoneAvailable,
    browserSupportsSpeechRecognition,
    browserSupportsContinuousListening,
    error,
  } = useSpeechRecognition({ commands });

  const fullText =
    transcript + (interimTranscript ? ` ${interimTranscript}` : "");

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 250)}px`;
    }
  }, [fullText]);

  if (!browserSupportsSpeechRecognition) {
    return (
      <p style={{ padding: 24, textAlign: "center" }}>
        Ce navigateur ne supporte pas la reconnaissance vocale. Essaie Chrome,
        Edge ou Safari.
      </p>
    );
  }

  const start = () =>
    SpeechRecognition.startListening({
      continuous: continuous && browserSupportsContinuousListening,
      language,
    });

  const toggleListening = (e: React.FormEvent) => {
    e.preventDefault();
    if (listening) {
      SpeechRecognition.stopListening();
    } else {
      start();
    }
  };

  return (
    <>
      <header>
        <button id="clear" onClick={resetTranscript} title="Tout effacer">
          <LuTrash2 size={18} />
        </button>
        <h3>react-speech-listener</h3>
      </header>

      <select
        id="model-select"
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
      >
        {LANGUAGES.map((l) => (
          <option key={l.tag} value={l.tag}>
            {l.label}
          </option>
        ))}
      </select>

      <div id="chat">
        <div className="assistant">
          Dernière commande : <code>{lastCommand}</code>
          {error && (
            <p style={{ color: "#b45309", marginTop: 8 }}>Erreur : {error}</p>
          )}
          {!isMicrophoneAvailable && (
            <p style={{ color: "#b91c1c", marginTop: 8 }}>
              Accès au micro refusé.
            </p>
          )}
        </div>

        {fullText && <div className="user">{interimTranscript}</div>}
      </div>

      <form id="chat-form" onSubmit={toggleListening}>
        <textarea
          ref={textareaRef}
          id="message"
          rows={1}
          value={fullText}
          readOnly
          placeholder={
            listening
              ? "Écoute en cours..."
              : "Cliquez sur le micro pour parler..."
          }
        />

        <button
          id="send"
          type="submit"
          className={listening ? "listening" : ""}
          aria-label="Micro"
        >
          {listening ? <LuSquare size={18} /> : <LuAudioLines size={20} />}
        </button>
      </form>
    </>
  );
}
