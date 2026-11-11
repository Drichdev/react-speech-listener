# react-speech-listener

A React hook for speech recognition powered by the [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition). It provides live transcripts, voice commands, shared microphone controls, polyfill support, and safe server-side rendering.

This TypeScript implementation is inspired by the architecture and API of [react-speech-recognition](https://github.com/JamesBrill/react-speech-recognition). See [NOTICE.md](./NOTICE.md) for attribution and third-party notices.

## Features

- Live interim and final transcripts.
- Exact and fuzzy voice-command matching.
- One shared recognition session for all hook instances in an app.
- Native browser recognition and compatible polyfills.
- TypeScript declarations, ESM and CommonJS builds.
- React 18 or later; safe to import in server-rendered applications.

## Installation

```bash
npm install react-speech-listener
```

React `>=18` is required as a peer dependency.

## Quick start

```tsx
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-listener";

export function Dictaphone() {
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition();

  if (!browserSupportsSpeechRecognition) {
    return <p>Your browser does not support speech recognition.</p>;
  }

  return (
    <div>
      <p>Microphone: {listening ? "on" : "off"}</p>
      <button
        onClick={() =>
          SpeechRecognition.startListening({ language: "en-US" })
        }
      >
        Start
      </button>
      <button onClick={() => SpeechRecognition.stopListening()}>Stop</button>
      <button onClick={resetTranscript}>Reset</button>
      <p>{transcript}</p>
    </div>
  );
}
```

In Next.js App Router, use the hook in a client component (add `"use client";` at the top of that component).

## API

### `useSpeechRecognition(options?)`

Options:

| Option | Default | Description |
| --- | --- | --- |
| `transcribing` | `true` | Updates the transcript. Voice commands still run when this is `false`. |
| `clearTranscriptOnListen` | `true` | Clears this hook instance's transcript when a non-continuous listening session starts. |
| `commands` | `[]` | Voice commands to match; see [Voice commands](#voice-commands). |

The hook returns:

| Property | Description |
| --- | --- |
| `transcript` | The final transcript followed by the current interim transcript. |
| `interimTranscript` | The speech currently being recognized. |
| `finalTranscript` | Confirmed speech. |
| `listening` | Whether the microphone is listening. |
| `isMicrophoneAvailable` | `false` when microphone access is unavailable or denied. |
| `browserSupportsSpeechRecognition` | Whether native recognition or an applied polyfill is available. |
| `browserSupportsContinuousListening` | Whether continuous listening is supported. This is `false` on Chrome for Android. |
| `error` | The latest speech API error code, such as `"no-speech"` or `"network"`, or `null`. |
| `resetTranscript()` | Clears the transcript for this hook instance. |

Microphone state and controls are shared across all `useSpeechRecognition` instances that use this package instance. Transcript state is maintained separately by each hook instance.

### `SpeechRecognition`

The default export controls the shared recognition session:

```ts
import SpeechRecognition from "react-speech-listener";

await SpeechRecognition.startListening({
  continuous: true, // Keep listening after pauses; defaults to false.
  language: "en-US", // BCP 47 language tag.
  interimResults: true, // Include interim results; defaults to true.
  processLocally: true, // On-device recognition, when supported.
  phrases: [{ phrase: "Lomé", boost: 5 }], // Contextual biasing, when supported.
});

await SpeechRecognition.stopListening(); // Stop and process pending speech.
await SpeechRecognition.abortListening(); // Stop and discard pending speech.

SpeechRecognition.applyPolyfill(MySpeechRecognition);
SpeechRecognition.removePolyfill();

const recognition = SpeechRecognition.getRecognition(); // Raw instance or null.
```

`startListening`, `stopListening`, and `abortListening` return promises. `processLocally` and `phrases` are optional browser features; unsupported options are ignored.

### Additional exports

Most applications only need `SpeechRecognition` and `useSpeechRecognition`. The package also exports these helpers:

| Export | Description |
| --- | --- |
| `RecognitionManager` | The manager used internally to coordinate recognition and transcript listeners. |
| `runCommands(commands, interimTranscript, finalTranscript, resetTranscript)` | Matches transcripts against a list of `SpeechCommand`s and invokes their callbacks. |
| `commandToRegExp(command)` | Converts a supported command string or `RegExp` to a case-insensitive regular expression. |
| `diceCoefficient(a, b)` | Returns a bigram-based Dice similarity score from `0` to `1`. |
| `concatTranscripts(...parts)` | Trims and joins non-empty transcript strings with spaces. |

All types from `src/types.ts`, including `SpeechCommand`, `SpeechPhrase`, `StartListeningOptions`, and the hook option and return types, are re-exported. Import them with `import type`.

### Voice commands

Pass commands to the hook using the exported `SpeechCommand` type:

```tsx
import {
  useSpeechRecognition,
  type SpeechCommand,
} from "react-speech-listener";

const commands: SpeechCommand[] = [
  {
    command: "order * pizzas",
    callback: (quantity) => orderPizzas(quantity),
  },
  {
    command: "the weather is :forecast today",
    callback: (forecast) => setForecast(forecast),
  },
  {
    command: "pass the salt (please)",
    callback: () => passTheSalt(),
  },
  {
    command: ["hello", "hi"],
    callback: ({ command }) => greet(command),
    matchInterim: true,
  },
  {
    command: "Paris",
    callback: (_command, spokenPhrase, similarity) =>
      showMatch(spokenPhrase, similarity),
    isFuzzyMatch: true,
    fuzzyMatchingThreshold: 0.6,
  },
  {
    command: "clear everything",
    callback: ({ resetTranscript }) => resetTranscript(),
  },
];

const { transcript } = useSpeechRecognition({ commands });
```

Command syntax:

- `*` matches one or more words.
- `:name` matches one word.
- `(optional)` makes a phrase optional.
- A command can be a string, a regular expression, or an array of strings and regular expressions.

In exact-match mode, capture groups are passed to the callback, followed by a context object containing the matched `command` and `resetTranscript` function. In fuzzy mode, the callback receives `(commandText, spokenPhrase, similarity, context)`. Set `bestMatchOnly: true` to invoke only the closest fuzzy match.

Set `matchInterim: true` to match partial speech sooner. This can produce false positives, and a callback may run again when the final result arrives.

### Polyfills

Native Web Speech API support varies by browser. A compatible polyfill can provide recognition where native support is unavailable:

```ts
import SpeechRecognition from "react-speech-listener";
import createSpeechServicesPonyfill from "web-speech-cognitive-services";

const { SpeechRecognition: AzureSpeechRecognition } =
  createSpeechServicesPonyfill({
    credentials: {
      region: "your-region",
      subscriptionKey: "your-key",
    },
  });

SpeechRecognition.applyPolyfill(AzureSpeechRecognition);
```

Keep provider credentials out of public client-side code. For production applications, use a backend or the provider's recommended secure credential flow.

## Browser support and privacy

- Speech recognition support depends on the browser. Firefox does not currently provide the native API; use a compatible polyfill if needed.
- The site must be served over HTTPS (or `localhost`) to access the microphone.
- Some browser implementations send audio to a remote service. Check the browser and polyfill provider's privacy and data-processing policies.
- Offline recognition is not generally available; `processLocally` works only where the browser supports it.
- Android-specific behavior is covered by simulated tests, not by testing on physical devices.

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

The build outputs ESM, CommonJS, and TypeScript declarations to `dist/`.

To run the example app with a real microphone:

```bash
cd example
npm install
npm run dev
```


## License

MIT. See [LICENSE](./LICENSE).
